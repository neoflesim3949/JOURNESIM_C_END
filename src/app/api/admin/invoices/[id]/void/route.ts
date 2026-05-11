import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { smseModifyInvoice } from '@/lib/smse'

// POST — 註銷發票（types=Void）
// 註銷後若下一號還沒使用、且此張就是字軌最後配出的號碼，則歸還號碼給字軌（next_number 回退）
// body: { voidReason: string, remark?: string }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const reason = String(body.voidReason || '').trim()
  if (!reason) return NextResponse.json({ error: '請輸入註銷原因' }, { status: 400 })
  if (reason.length > 20) return NextResponse.json({ error: '註銷原因最多 20 字' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (error || !invoice) return NextResponse.json({ error: '找不到發票' }, { status: 404 })
  if (invoice.status !== 'issued') return NextResponse.json({ error: '此發票狀態不允許註銷' }, { status: 400 })

  const invoiceDateSmse = String(invoice.invoice_date).replace(/-/g, '/')
  const result = await smseModifyInvoice({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoiceDateSmse,
    types: 'Void',
    voidReason: reason,
    remark: body.remark || undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: `[${result.status}] ${result.desc}`, raw: result.raw }, { status: 500 })
  }

  // 更新發票狀態
  await supabase.from('invoices').update({
    status: 'voided',
    voided_at: new Date().toISOString(),
    void_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  // 嘗試歸還號碼：僅當此張的號碼 = 字軌的 (next_number - 1)，且字軌前綴吻合，才回退
  // 否則中間有 gap，無法直接還
  let refunded: { trackId: string; newNext: number } | null = null
  const prefix = invoice.invoice_number.slice(0, 2)
  const numInt = Number(invoice.invoice_number.slice(2))
  const { data: tracks } = await supabase
    .from('invoice_tracks')
    .select('id, next_number, start_number, end_number, track_prefix')
    .eq('track_prefix', prefix)
  for (const t of tracks || []) {
    if (Number(t.next_number) - 1 === numInt) {
      // 樂觀回退
      const { data: updated } = await supabase
        .from('invoice_tracks')
        .update({ next_number: numInt, updated_at: new Date().toISOString() })
        .eq('id', t.id)
        .eq('next_number', numInt + 1)
        .select('id')
      if (updated && updated.length > 0) {
        refunded = { trackId: t.id, newNext: numInt }
      }
      break
    }
  }

  return NextResponse.json({
    ok: true,
    voidDate: result.voidDate,
    voidTime: result.voidTime,
    refunded,
    note: refunded ? '下一號未使用，此號碼已歸還字軌、下次可重用' : '下一號已被使用，此號碼保留 gap、無法歸還',
  })
}
