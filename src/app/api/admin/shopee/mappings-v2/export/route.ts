import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOptionIndex } from '@/lib/option-index'
import * as XLSX from 'xlsx'

// POST ?account_id= — 取最新匯入批次的原始 Excel，逐列覆蓋「價格」欄為系統售價，回傳 xlsx
// body: { product_ids?: string[] } 有給就只匯出這些商品的列（其餘列剔除）
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = new URL(request.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const reqBody = await request.json().catch(() => ({}))
  const productIds: string[] | null = Array.isArray(reqBody.product_ids) && reqBody.product_ids.length ? reqBody.product_ids : null
  const supabase = createAdminClient()

  // 最新批次（原始 Excel 結構）
  const { data: batch } = await supabase.from('shopee_import_batches')
    .select('raw_aoa, col_index, note_row, header_row, sheet_name, file_name')
    .eq('account_id', accountId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!batch) return NextResponse.json({ error: '此帳號尚無匯入批次，請先匯入蝦皮 Excel' }, { status: 400 })

  const ci = batch.col_index as Record<string, number>
  const priceCol = ci['價格']
  const varCol = ci['商品選項ID']
  const mainSkuCol = ci['主商品貨號']     // 可能不存在（舊匯入）
  const varSkuCol = ci['商品選項貨號']
  const stockCol = ci['庫存']             // 上架=10000、下架=0
  if (priceCol === undefined || varCol === undefined) {
    return NextResponse.json({ error: '批次缺少價格或商品選項ID 欄位索引' }, { status: 500 })
  }

  // 選項（算每個選項ID 的最終售價：覆蓋值 > 原蝦皮價）— 分頁撈全

  const options: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_product_options_v2')
      .select('shopee_variation_id, shopee_product_id, main_sku_code, variation_sku_code, bc_sku_id, copies, manual_price, original_price, is_listed').eq('account_id', accountId)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    options.push(...data)
    if (data.length < 1000) break
  }

  // 只匯出選取商品 → 保留的選項ID 集合
  const keepVar = productIds
    ? new Set(options.filter(o => productIds.includes(String(o.shopee_product_id))).map(o => String(o.shopee_variation_id)))
    : null

  // 套餐選項貨號 → 套餐售價（售價以套餐為準）
  const pkgPriceByCode = new Map((await buildOptionIndex(supabase)).map(it => [it.code, it.sell_price]))

  const priceByVar = new Map<string, number>()
  const mainSkuByVar = new Map<string, string>()
  const varSkuByVar = new Map<string, string>()
  const stockByVar = new Map<string, number>()
  for (const o of options || []) {
    const vid = String(o.shopee_variation_id)
    // 售價：有對應＝套餐售價；未對應＝人工售價 > 原蝦皮價
    const pkgPrice = o.variation_sku_code ? (pkgPriceByCode.get(o.variation_sku_code) ?? null) : null
    const finalPrice = pkgPrice != null ? pkgPrice : (o.manual_price != null ? Number(o.manual_price) : (o.original_price != null ? Number(o.original_price) : null))
    if (finalPrice && finalPrice > 0) priceByVar.set(vid, finalPrice)
    // 主商品貨號（手填）＋ 商品選項貨號（直接用填入的套餐選項貨號）
    if (o.main_sku_code) mainSkuByVar.set(vid, String(o.main_sku_code))
    if (o.variation_sku_code) varSkuByVar.set(vid, String(o.variation_sku_code))
    // 庫存：下架=0、其餘固定 10000
    stockByVar.set(vid, o.is_listed === false ? 0 : 10000)
  }

  // 就地覆蓋價格欄（其餘 cell 一律不動），未設定售價的列保留原價
  // 有選取商品時：表頭/說明列保留，資料列只留選取商品的選項
  const src = (batch.raw_aoa as unknown[][]).map(r => Array.isArray(r) ? [...r] : r)
  const dataStart = (typeof batch.note_row === 'number' ? batch.note_row : (batch.header_row ?? 0)) + 1
  const head = src.slice(0, dataStart)
  const body: unknown[][] = []
  let changed = 0
  for (let i = dataStart; i < src.length; i++) {
    const row = src[i] as unknown[]
    if (!Array.isArray(row)) { if (!keepVar) body.push(row as unknown[]); continue }
    const vid = row[varCol] === undefined || row[varCol] === null ? '' : String(row[varCol]).trim()
    if (keepVar && (!vid || !keepVar.has(vid))) continue
    if (vid) {
      const p = priceByVar.get(vid); if (p != null) { row[priceCol] = p; changed++ }
      if (mainSkuCol !== undefined) { const ms = mainSkuByVar.get(vid); if (ms) row[mainSkuCol] = ms }
      if (varSkuCol !== undefined) { const vs = varSkuByVar.get(vid); if (vs) row[varSkuCol] = vs }
      if (stockCol !== undefined) { const st = stockByVar.get(vid); if (st != null) row[stockCol] = st }
    }
    body.push(row)
  }
  const aoa = [...head, ...body]

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
