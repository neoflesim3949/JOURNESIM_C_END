import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 匯入蝦皮批量上傳 Excel：建匯入批次 + upsert 選項主檔（保留既有對應/覆蓋售價）
// body: { account_id, file_name, sheet_name, raw_aoa, header, col_index, header_row, note_row, data_start }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { account_id, file_name, sheet_name, raw_aoa, header, col_index, header_row, note_row } = body
  if (!account_id) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  if (!Array.isArray(raw_aoa) || !col_index) return NextResponse.json({ error: 'Excel 內容無效' }, { status: 400 })

  const ci = col_index as Record<string, number>
  if (ci['商品選項ID'] === undefined || ci['價格'] === undefined) {
    return NextResponse.json({ error: '找不到「商品選項ID」或「價格」欄，請確認是蝦皮批量上傳表' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. 建匯入批次
  const dataStart = (typeof note_row === 'number' ? note_row : (header_row ?? 0)) + 1
  const { data: batch, error: batchErr } = await supabase.from('shopee_import_batches').insert({
    account_id, file_name: file_name || null, raw_aoa, header: header || null, col_index: ci,
    header_row: header_row ?? 0, note_row: typeof note_row === 'number' ? note_row : null,
    sheet_name: sheet_name || null,
  }).select('id').single()
  if (batchErr || !batch) return NextResponse.json({ error: batchErr?.message || '建立批次失敗' }, { status: 500 })

  const cell = (row: unknown[], key: string): string => {
    const idx = ci[key]
    if (idx === undefined) return ''
    const v = row?.[idx]
    return v === undefined || v === null ? '' : String(v).trim()
  }
  const num = (s: string): number | null => {
    const n = Number(String(s).replace(/[, ]/g, ''))
    return s && !Number.isNaN(n) ? n : null
  }

  // 2. 逐資料列組 upsert（商品名稱/ID 空白時往下沿用上一筆）
  let lastProductName = '', lastProductId = ''
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (let i = dataStart; i < raw_aoa.length; i++) {
    const r = raw_aoa[i] as unknown[]
    const variationId = cell(r, '商品選項ID')
    if (!variationId) continue
    if (seen.has(variationId)) continue // 同檔重複選項ID只取第一筆
    seen.add(variationId)
    const productName = cell(r, '商品名稱') || lastProductName
    const productId = cell(r, '商品ID') || lastProductId
    lastProductName = productName; lastProductId = productId
    rows.push({
      account_id, batch_id: batch.id,
      shopee_product_id: productId || null,
      shopee_product_name: productName || null,
      shopee_variation_id: variationId,
      shopee_variation_name: cell(r, '商品規格名稱') || null,
      main_sku_code: cell(r, '主商品貨號') || null,
      variation_sku_code: cell(r, '商品選項貨號') || null,
      original_price: num(cell(r, '價格')),
      raw_row_index: i,
      updated_at: new Date().toISOString(),
      // 不含 bc_sku_id/copies/price_override → 既有列 upsert 時保留
    })
  }

  if (rows.length === 0) return NextResponse.json({ error: '沒有解析到任何選項列' }, { status: 400 })

  // 分批 upsert（保留既有對應）
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('shopee_product_options_v2')
      .upsert(chunk, { onConflict: 'account_id,shopee_variation_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, batch_id: batch.id, count: rows.length })
}
