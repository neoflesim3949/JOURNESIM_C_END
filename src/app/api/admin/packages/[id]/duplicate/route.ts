import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 複製套餐（含資訊 + 內含 BC 商品 + 各 copies 售價）
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: orig } = await supabase.from('packages').select('*').eq('id', id).single()
  if (!orig) return NextResponse.json({ error: '套餐不存在' }, { status: 404 })

  // 1. 建立新套餐（複製資訊）
  const { data: np, error: e1 } = await supabase.from('packages').insert({
    name: `${orig.name}（複製）`,
    description: orig.description || null,
    product_type: orig.product_type,
    category: orig.category || null,
    tags: orig.tags || null,
    countries: orig.countries || null,
    apns: orig.apns || null,
    operators: orig.operators || null,
    apn_synced_at: orig.apn_synced_at || null,
  }).select().single()
  if (e1 || !np) return NextResponse.json({ error: e1?.message || '建立失敗' }, { status: 500 })

  // 重新編號：把複製品排在「原套餐的下一個」
  const { data: allPkgs } = await supabase.from('packages').select('id').order('sort_order').order('created_at')
  const ids = (allPkgs || []).map(p => p.id).filter(x => x !== np.id)
  const origPos = ids.indexOf(id)
  ids.splice(origPos >= 0 ? origPos + 1 : ids.length, 0, np.id)
  await Promise.all(ids.map((pid, i) => supabase.from('packages').update({ sort_order: i }).eq('id', pid)))

  // 2. 複製 package_plans
  const { data: plans } = await supabase.from('package_plans').select('*').eq('package_id', id)
  if (plans && plans.length > 0) {
    const planRows = plans.map(p => ({
      package_id: np.id,
      bc_sku_id: p.bc_sku_id,
      plan_category: p.plan_category,
      display_name: p.display_name ?? null,
      sort_order: p.sort_order ?? 0,
      is_active: p.is_active ?? true,
    }))
    const { error: e2 } = await supabase.from('package_plans').upsert(planRows, { onConflict: 'package_id,bc_sku_id' })
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    // 取得新 plan ids（依 bc_sku_id 對應）
    const { data: newPlans } = await supabase.from('package_plans').select('id, bc_sku_id').eq('package_id', np.id)
    const skuToNew = new Map((newPlans || []).map(p => [p.bc_sku_id, p.id]))
    const oldToSku = new Map(plans.map(p => [p.id, p.bc_sku_id]))

    // 3. 複製 package_plan_prices
    const oldPlanIds = plans.map(p => p.id)
    const priceRows: Record<string, unknown>[] = []
    for (let i = 0; i < oldPlanIds.length; i += 300) {
      const { data: prices } = await supabase.from('package_plan_prices').select('*').in('package_plan_id', oldPlanIds.slice(i, i + 300))
      for (const pr of prices || []) {
        const newPlanId = skuToNew.get(oldToSku.get(pr.package_plan_id))
        if (!newPlanId) continue
        priceRows.push({
          package_plan_id: newPlanId,
          copies: pr.copies,
          cost_price: pr.cost_price,
          original_cost_price: pr.original_cost_price ?? null,
          sell_price: pr.sell_price ?? 0,
          price_changed: pr.price_changed ?? false,
        })
      }
    }
    for (let i = 0; i < priceRows.length; i += 100) {
      await supabase.from('package_plan_prices').upsert(priceRows.slice(i, i + 100), { onConflict: 'package_plan_id,copies' })
    }
  }

  return NextResponse.json({ id: np.id, name: np.name })
}
