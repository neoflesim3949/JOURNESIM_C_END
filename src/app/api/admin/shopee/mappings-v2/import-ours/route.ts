import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchBcMap, snapshotFor } from '@/lib/bc-snapshot'
import { buildOptionIndex } from '@/lib/option-index'

// POST — 批量上傳「我們的表」：依選項ID 設定 商品自設名稱/規格自設名稱/BC快速碼/商品選項貨號
// body: { account_id, rows: [{ variation_id, set: {custom_product_name?, custom_variation_name?, bc_sku_id?, copies?, variation_sku_code?} }] }
const ALLOWED = ['custom_product_name', 'custom_variation_name', 'bc_sku_id', 'copies', 'variation_sku_code', 'price_snapshot', 'is_listed']

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, rows } = body
  if (!account_id || !Array.isArray(rows)) return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const supabase = createAdminClient()

  let updated = 0
  let unresolved = 0
  const work = rows.filter((r: { variation_id?: string; set?: Record<string, unknown> }) => r?.variation_id && r.set && Object.keys(r.set).length > 0)

  // 「商品選項貨號」→ 解析套餐選項，帶出 BC/copies/套餐售價（與 V2 介面填寫一致）
  if (work.some((r: { set: Record<string, unknown> }) => 'variation_sku_code' in r.set)) {
    const index = new Map((await buildOptionIndex(supabase)).map(it => [it.code, it]))
    for (const r of work as { set: Record<string, unknown> }[]) {
      if (!('variation_sku_code' in r.set)) continue
      const code = String(r.set.variation_sku_code || '').trim()
      if (!code) { delete r.set.variation_sku_code; continue } // 空白不動，避免覆蓋既有
      const hit = index.get(code)
      if (hit) { r.set.variation_sku_code = code; r.set.bc_sku_id = hit.bc_sku_id; r.set.copies = hit.copies; r.set.price_snapshot = hit.sell_price }
      else { r.set.variation_sku_code = code; unresolved++ } // 保留貨號，不動 BC
    }
  }

  // 有設 BC 對應的列 → 先撈 BC 品名/成本，套用快照
  const bcMap = await fetchBcMap(supabase, work.map((r: { set: Record<string, unknown> }) => r.set.bc_sku_id as string | undefined))

  // 分批並行更新（每筆 update 條件不同，無法單次 upsert 全部）
  for (let i = 0; i < work.length; i += 25) {
    const chunk = work.slice(i, i + 25)
    const results = await Promise.all(chunk.map(async (r: { variation_id: string; set: Record<string, unknown> }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ALLOWED) if (k in r.set) updates[k] = r.set[k]
      if (r.set.bc_sku_id) Object.assign(updates, snapshotFor(bcMap.get(r.set.bc_sku_id as string), (r.set.copies as string) ?? null))
      else if ('bc_sku_id' in r.set) { updates.bc_name_snapshot = null; updates.bc_cost_snapshot = null } // 取消對應 → 清快照
      const { error } = await supabase.from('shopee_product_options_v2')
        .update(updates).eq('account_id', account_id).eq('shopee_variation_id', String(r.variation_id))
      return error ? 0 : 1
    }))
    updated += results.filter(Boolean).length
  }

  return NextResponse.json({ ok: true, count: updated, unresolved })
}
