import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 從舊版「商品對應」(shopee_product_mappings) 帶入已對應的 bc_sku_id+copies
// body: { account_id, overwrite? }（overwrite=true 連已對應的也覆蓋；預設只補未對應）
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, overwrite } = body
  if (!account_id) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const supabase = createAdminClient()

  // V2 選項（分頁撈全）
  const options: { id: string; shopee_product_id: string | null; shopee_variation_id: string; bc_sku_id: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_product_options_v2')
      .select('id, shopee_product_id, shopee_variation_id, bc_sku_id').eq('account_id', account_id).range(from, from + 999)
    if (!data || data.length === 0) break
    options.push(...data)
    if (data.length < 1000) break
  }
  if (options.length === 0) return NextResponse.json({ error: '此帳號尚無選項，請先匯入蝦皮表' }, { status: 400 })

  // V1 對應（分頁撈全，僅取有對應 bc_sku_id 的）
  const skuMap = new Map<string, { bc_sku_id: string; copies: string | null }>()
  const varMap = new Map<string, { bc_sku_id: string; copies: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_product_mappings')
      .select('shopee_sku_code, shopee_variation_id, bc_sku_id, copies').not('bc_sku_id', 'is', null).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const v = { bc_sku_id: r.bc_sku_id as string, copies: (r.copies as string) ?? null }
      if (r.shopee_sku_code) skuMap.set(String(r.shopee_sku_code), v)
      if (r.shopee_variation_id) varMap.set(String(r.shopee_variation_id), v)
    }
    if (data.length < 1000) break
  }

  // 逐選項配對：先用 商品ID_選項ID，再退回 選項ID
  const updates: { account_id: string; shopee_variation_id: string; bc_sku_id: string; copies: string | null; updated_at: string }[] = []
  const now = new Date().toISOString()
  for (const o of options) {
    if (o.bc_sku_id && !overwrite) continue
    const skuCode = o.shopee_product_id ? `${o.shopee_product_id}_${o.shopee_variation_id}` : ''
    const hit = (skuCode && skuMap.get(skuCode)) || varMap.get(o.shopee_variation_id)
    if (!hit) continue
    updates.push({ account_id, shopee_variation_id: o.shopee_variation_id, bc_sku_id: hit.bc_sku_id, copies: hit.copies, updated_at: now })
  }

  if (updates.length === 0) return NextResponse.json({ ok: true, count: 0 })

  // upsert（onConflict 帳號+選項ID，只更新對應欄位）
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await supabase.from('shopee_product_options_v2')
      .upsert(updates.slice(i, i + 500), { onConflict: 'account_id,shopee_variation_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: updates.length })
}
