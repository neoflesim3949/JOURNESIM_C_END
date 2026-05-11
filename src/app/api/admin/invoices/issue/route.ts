import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { smseIssueInvoice, smseConfigSummary, type SmseIssueInput } from '@/lib/smse'

// GET — 取得目前 smse 設定（給前端顯示「正式 / 測試」徽章）
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(smseConfigSummary())
}

// 依發票日期算出民國期別 (start month)
function rocPeriod(dateYmd: string): { year: number; startMonth: number } {
  const d = new Date(dateYmd.replace(/\//g, '-'))
  const m = d.getMonth() + 1
  return {
    year: d.getFullYear() - 1911,
    startMonth: m % 2 === 0 ? m - 1 : m,
  }
}

interface TrackRow {
  id: string
  track_prefix: string
  start_number: string | number
  end_number: string | number
  next_number: string | number
  intype: string | null
  tax_type: string | null
  buyer_type: string | null
}

// 找出符合條件的 active 字軌、配下一個號碼（樂觀並行）
// 回傳 { invoiceNumber, randomNumber } 或 null（沒符合的 active 字軌就回傳 null，由速買配系統配號）
async function allocateNumber(
  body: SmseIssueInput
): Promise<{ invoiceNumber: string; randomNumber: string; trackId: string } | null> {
  const supabase = createAdminClient()
  const { year, startMonth } = rocPeriod(body.invoiceDate)

  // 先找最精準匹配（buyer_type、intype、tax_type 都吻合）→ 再放寬
  // 用 or 條件處理「不限對象（buyer_type 為 null）」
  let query = supabase.from('invoice_tracks')
    .select('*')
    .eq('is_active', true)
    .eq('period_year', year)
    .eq('period_start_month', startMonth)
    .eq('intype', body.intype)
    .eq('tax_type', body.taxType)

  const { data: matched } = await query.limit(20)
  let candidates = (matched || []) as TrackRow[]
  // 先取 buyer_type 完全相同的，沒有就取 buyer_type=null（不限）
  const exact = candidates.filter(t => t.buyer_type === body.buyerType)
  const generic = candidates.filter(t => !t.buyer_type)
  candidates = exact.length > 0 ? exact : generic
  // 過濾掉已用完的
  candidates = candidates.filter(t => Number(t.next_number) <= Number(t.end_number))
  if (candidates.length === 0) return null
  const track = candidates[0]

  const numInt = Number(track.next_number)
  // 樂觀更新：next_number 沒被搶走才會成功
  const { data: updated, error } = await supabase
    .from('invoice_tracks')
    .update({ next_number: numInt + 1, updated_at: new Date().toISOString() })
    .eq('id', track.id)
    .eq('next_number', numInt)
    .select('id')
  if (error || !updated || updated.length === 0) return null // race lost；上層可改為重試或落回系統配號

  const invoiceNumber = `${track.track_prefix}${String(numInt).padStart(8, '0')}`
  const randomNumber = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return { invoiceNumber, randomNumber, trackId: track.id }
}

// POST — 開立電子發票
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json()) as SmseIssueInput
  if (!body.items || body.items.length === 0) return NextResponse.json({ error: '請至少新增一個品項' }, { status: 400 })
  if (!body.allAmount || body.allAmount <= 0) return NextResponse.json({ error: '總金額需大於 0' }, { status: 400 })

  let allocatedTrackId: string | null = null
  // 沒有指定 InvoiceNumber → 從 active 字軌自動配號
  if (!body.invoiceNumber) {
    const alloc = await allocateNumber(body)
    if (alloc) {
      body.invoiceNumber = alloc.invoiceNumber
      body.randomNumber = alloc.randomNumber
      allocatedTrackId = alloc.trackId
    }
    // 若 alloc 為 null：沒有 active 字軌符合 → 讓速買配系統配號（不傳 InvoiceNumber）
  }

  try {
    const result = await smseIssueInvoice(body)
    if (!result.ok) {
      // 速買配失敗：把剛配給的字軌號碼還回去
      if (allocatedTrackId) {
        const supabase = createAdminClient()
        const numStr = body.invoiceNumber!.replace(/^[A-Z]{2}/, '')
        const numInt = Number(numStr)
        // 樂觀回退：next_number 還是 numInt+1 才復原
        await supabase.from('invoice_tracks')
          .update({ next_number: numInt, updated_at: new Date().toISOString() })
          .eq('id', allocatedTrackId)
          .eq('next_number', numInt + 1)
      }
      return NextResponse.json({ error: `[${result.status}] ${result.desc}`, raw: result.raw, sent: result.sentParams }, { status: 500 })
    }

    // 寫入 invoices 主檔
    try {
      const supabase = createAdminClient()
      const totalAmount = body.allAmount
      // 計算稅金：B2C 一律 內含；B2B/B2G 依 unitTAX
      // 應稅 (taxType=1) 才計 5% 稅金
      let totalTax = 0
      let totalSales = totalAmount
      if (body.taxType === '1') {
        const isInclusive = body.buyerType === 'B2C' || body.unitTAX !== 'N'
        if (isInclusive) {
          totalSales = Math.round(totalAmount / 1.05)
          totalTax = totalAmount - totalSales
        } else {
          // 外加：speedmate 收到的 allAmount 應已含稅；items 是未稅
          // 反推：sales = items 加總 = allAmount / 1.05
          totalSales = Math.round(totalAmount / 1.05)
          totalTax = totalAmount - totalSales
        }
      }
      // 將 invoiceDate (YYYY/MM/DD) → DATE
      const invoiceDate = (result.invoiceDate || body.invoiceDate).replace(/\//g, '-')
      await supabase.from('invoices').insert({
        invoice_number: result.invoiceNumber,
        random_number: result.randomNumber,
        invoice_date: invoiceDate,
        invoice_time: result.invoiceTime || body.invoiceTime,
        invoice_type: result.invoiceType,
        buyer_type: body.buyerType,
        intype: body.intype,
        tax_type: body.taxType,
        tax_rate: body.taxRate ? Number(body.taxRate) : null,
        buyer_id: body.buyerId || null,
        buyer_name: body.name || null,
        buyer_company: body.companyName || null,
        buyer_address: body.address || null,
        buyer_phone: body.phone || null,
        buyer_email: body.email || null,
        donate: !!body.donate,
        love_key: body.loveKey || null,
        carrier_type: body.carrierType || null,
        carrier_id: body.carrierId || null,
        main_remark: body.mainRemark || null,
        certificate_remark: body.certificateRemark || null,
        visa_last4: body.visaLast4 || null,
        data_id: body.dataId || null,
        orderid: body.orderid || null,
        items: body.items,
        total_sales: totalSales,
        total_tax: totalTax,
        total_amount: totalAmount,
        status: 'issued',
        smse_raw_response: result.raw,
      })
    } catch (err) {
      console.error('[invoices] 寫入失敗（不影響發票開立）:', err)
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
