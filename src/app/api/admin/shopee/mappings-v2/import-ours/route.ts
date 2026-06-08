import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchBcMap, snapshotFor } from '@/lib/bc-snapshot'

// POST — 批量上傳「我們的表」：依選項ID 設定 商品自設名稱/規格自設名稱/售價(覆蓋)/BC快速碼
// body: { account_id, rows: [{ variation_id, set: {custom_product_name?, custom_variation_name?, price_override?, bc_sku_id?, copies?} }] }
const ALLOWED = ['custom_product_name', 'custom_variation_name', 'price_override', 'bc_sku_id', 'copies']

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, rows } = body
  if (!account_id || !Array.isArray(rows)) return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const supabase = createAdminClient()

  let updated = 0
  const work = rows.filter((r: { variation_id?: string; set?: Record<string, unknown> }) => r?.variation_id && r.set && Object.keys(r.set).length > 0)

  // 有設 BC 對應的列 → 先撈 BC 品名/成本，套用快照
  const bcMap = await fetchBcMap(supabase, work.map((r: { set: Record<string, unknown> }) => r.set.bc_sku_id as string | undefined))

  // 分批並行更新（每筆 update 條件不同，無法單次 upsert 全部）
  for (let i = 0; i < work.length; i += 25) {
    const chunk = work.slice(i, i + 25)
    const results = await Promise.all(chunk.map(async (r: { variation_id: string; set: Record<string, unknown> }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ALLOWED) if (k in r.set) updates[k] = r.set[k]
      if (r.set.bc_sku_id) Object.assign(updates, snapshotFor(bcMap.get(r.set.bc_sku_id as string), (r.set.copies as string) ?? null))
      const { error } = await supabase.from('shopee_product_options_v2')
        .update(updates).eq('account_id', account_id).eq('shopee_variation_id', String(r.variation_id))
      return error ? 0 : 1
    }))
    updated += results.filter(Boolean).length
  }

  return NextResponse.json({ ok: true, count: updated })
}
