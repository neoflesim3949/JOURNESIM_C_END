import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// GET — 列出所有套餐
export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      supabase.from('product_packages').select('package_id').in('package_id', packageIds),
    ])

    for (const p of plans || []) {
      planCounts.set(p.package_id, (planCounts.get(p.package_id) || 0) + 1)
    }
    for (const p of productPkgs || []) {
      productCounts.set(p.package_id, (productCounts.get(p.package_id) || 0) + 1)
    }
  }

  const result = (packages || []).map((p) => ({
    ...p,
    _plan_count: planCounts.get(p.id) || 0,
    _product_count: productCounts.get(p.id) || 0,
  }))

  return NextResponse.json(result)
}

// POST — 建立套餐
export async function POST(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase.from('packages').insert({
    name: body.name,
    description: body.description || null,
    product_type: body.product_type || 'esim',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — 更新套餐
export async function PATCH(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createAdminClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.product_type !== undefined) updates.product_type = body.product_type

  await supabase.from('packages').update(updates).eq('id', body.id)
  return NextResponse.json({ ok: true })
}

// DELETE — 刪除套餐
export async function DELETE(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('packages').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
