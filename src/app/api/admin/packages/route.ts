import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'


// GET — 列出所有套餐
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: packages } = await supabase
    .from('packages')
    .select('*')
    .order('sort_order')
    .order('created_at', { ascending: false })

  // 計算每個套餐的 BC 商品數和被多少方案引用
  const packageIds = (packages || []).map((p) => p.id)

  let planCounts = new Map<string, number>()
  let productCounts = new Map<string, number>()

  if (packageIds.length > 0) {
    const [{ data: plans }, { data: productPkgs }] = await Promise.all([
      supabase.from('package_plans').select('package_id').in('package_id', packageIds),
      supabase.from('country_packages').select('package_id').in('package_id', packageIds),
    ])

    for (const p of plans || []) {
      planCounts.set(p.package_id, (planCounts.get(p.package_id) || 0) + 1)
    }
    for (const p of productPkgs || []) {
      productCounts.set(p.package_id, (productCounts.get(p.package_id) || 0) + 1)
    }
  }

  // 檢查哪些套餐有價格異動
  const changedPkgIds = new Set<string>()
  if (packageIds.length > 0) {
    const { data: allPlans } = await supabase.from('package_plans').select('id, package_id').in('package_id', packageIds)
    const planIds = (allPlans || []).map((p) => p.id)
    if (planIds.length > 0) {
      const { data: changedPrices } = await supabase.from('package_plan_prices').select('package_plan_id').in('package_plan_id', planIds).eq('price_changed', true)
      const changedPlanIds = new Set((changedPrices || []).map((p) => p.package_plan_id))
      for (const plan of allPlans || []) {
        if (changedPlanIds.has(plan.id)) changedPkgIds.add(plan.package_id)
      }
    }
  }

  const result = (packages || []).map((p) => ({
    ...p,
    _plan_count: planCounts.get(p.id) || 0,
    _product_count: productCounts.get(p.id) || 0,
    _has_price_changes: changedPkgIds.has(p.id),
  }))

  return NextResponse.json(result)
}

// POST — 建立套餐
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase.from('packages').insert({
    name: body.name,
    description: body.description || null,
    product_type: body.product_type || 'esim',
    category: body.category || null,
    tags: Array.isArray(body.tags) && body.tags.length ? body.tags : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — 更新套餐
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createAdminClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.product_type !== undefined) updates.product_type = body.product_type
  if (body.category !== undefined) updates.category = body.category || null
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) && body.tags.length ? body.tags : null
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  await supabase.from('packages').update(updates).eq('id', body.id)
  return NextResponse.json({ ok: true })
}

// DELETE — 刪除套餐（級聯刪除關聯資料）
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  const supabase = createAdminClient()

  // 1. 取得此套餐下的所有 package_plans
  const { data: plans } = await supabase.from('package_plans').select('id').eq('package_id', id)
  const planIds = (plans || []).map((p) => p.id)

  // 2. 刪除 package_plan_prices
  if (planIds.length > 0) {
    await supabase.from('package_plan_prices').delete().in('package_plan_id', planIds)
  }

  // 3. 刪除 package_plans
  await supabase.from('package_plans').delete().eq('package_id', id)

  // 4. 刪除 country_packages 關聯
  await supabase.from('country_packages').delete().eq('package_id', id)

  // 5. 刪除套餐本身
  await supabase.from('packages').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}
