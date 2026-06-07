import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'
import { computeCostTwd, computePrice, costCnyFromPrices, DEFAULT_RULE, PricingRule } from '@/lib/shopee-pricing'

// POST ?account_id= — 取最新匯入批次的原始 Excel，逐列覆蓋「價格」欄為系統售價，回傳 xlsx
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = new URL(request.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const supabase = createAdminClient()

  // 最新批次（原始 Excel 結構）
  const { data: batch } = await supabase.from('shopee_import_batches')
    .select('raw_aoa, col_index, note_row, header_row, sheet_name, file_name')
    .eq('account_id', accountId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!batch) return NextResponse.json({ error: '此帳號尚無匯入批次，請先匯入蝦皮 Excel' }, { status: 400 })

  const ci = batch.col_index as Record<string, number>
  const priceCol = ci['價格']
  const varCol = ci['商品選項ID']
  if (priceCol === undefined || varCol === undefined) {
    return NextResponse.json({ error: '批次缺少價格或商品選項ID 欄位索引' }, { status: 500 })
  }

  // 規則 + 匯率 + 選項 + BC 價格 → 算每個選項ID 的最終售價
  const { data: ruleRow } = await supabase.from('shopee_pricing_rules')
    .select('multiplier, add_amount, rounding, round_to').eq('account_id', accountId).maybeSingle()
  const rule: PricingRule = ruleRow ? {
    multiplier: Number(ruleRow.multiplier), add_amount: Number(ruleRow.add_amount),
    rounding: ruleRow.rounding, round_to: Number(ruleRow.round_to),
  } : DEFAULT_RULE

  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  const { data: options } = await supabase.from('shopee_product_options_v2')
    .select('shopee_variation_id, bc_sku_id, copies, price_override').eq('account_id', accountId)

  const skuIds = [...new Set((options || []).map(o => o.bc_sku_id).filter(Boolean))] as string[]
  const { data: bcProducts } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, prices').in('sku_id', skuIds)
    : { data: [] }
  const bcMap = new Map((bcProducts || []).map(p => [p.sku_id, p]))

  const priceByVar = new Map<string, number>()
  for (const o of options || []) {
    let finalPrice: number | null = null
    if (o.price_override != null) {
      finalPrice = Number(o.price_override)
    } else if (o.bc_sku_id) {
      const bc = bcMap.get(o.bc_sku_id)
      const costCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, o.copies) : 0
      const costTwd = computeCostTwd(costCny, cnyRate)
      finalPrice = costTwd ? computePrice(costTwd, rule) : null
    }
    if (finalPrice && finalPrice > 0) priceByVar.set(String(o.shopee_variation_id), finalPrice)
  }

  // 就地覆蓋價格欄（其餘 cell 一律不動），未設定售價的列保留原價
  const aoa = (batch.raw_aoa as unknown[][]).map(r => Array.isArray(r) ? [...r] : r)
  const dataStart = (typeof batch.note_row === 'number' ? batch.note_row : (batch.header_row ?? 0)) + 1
  let changed = 0
  for (let i = dataStart; i < aoa.length; i++) {
    const row = aoa[i] as unknown[]
    if (!Array.isArray(row)) continue
    const vid = row[varCol] === undefined || row[varCol] === null ? '' : String(row[varCol]).trim()
    if (!vid) continue
    const p = priceByVar.get(vid)
    if (p != null) { row[priceCol] = p; changed++ }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown[][])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, batch.sheet_name || 'Sheet1')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const fname = `shopee_price_${accountId.slice(0, 8)}_${changed}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  })
}
