import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// GET — 取得該國家方案已加入的套餐
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { mcc } = await params
  const supabase = createAdminClient()

  // 取得該國家的方案
  const { data: products } = await supabase
    .from('products')
    .select('id, name, product_type, is_active')
    .eq('country_code', mcc)

  if (!products || products.length === 0) return NextResponse.json([])

  // 取得方案關聯的套餐
  const productIds = products.map((p) => p.id)
  const { data: links } = await supabase
    .from('product_packages')
    .select('product_id, package_id')
    .in('product_id', productIds)

  const packageIds = [...new Set((links || []).map((l) => l.package_id))]

  let packages: Record<string, unknown>[] = []
  if (packageIds.length > 0) {
    const { data } = await supabase
      .from('packages')
      .select('id, name, product_type, is_active')
      .in('id', packageIds)
    packages = data || []
  }

  const pkgMap = new Map(packages.map((p) => [p.id as string, p]))

  // 組裝結果
  const result = products.map((product) => {
    const linkedPkgIds = (links || []).filter((l) => l.product_id === product.id).map((l) => l.package_id)
    return {
      ...product,
      packages: linkedPkgIds.map((pkgId) => pkgMap.get(pkgId)).filter(Boolean),
    }
  })

  return NextResponse.json(result)
}

// POST — 加入套餐到方案
export async function POST(
  request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, package_id } = await request.json()
  const supabase = createAdminClient()

  const { error } = await supabase.from('product_packages').upsert({
    product_id,
    package_id,
  }, { onConflict: 'product_id,package_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — 從方案移除套餐
export async function DELETE(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, package_id } = await request.json()
  const supabase = createAdminClient()

  await supabase.from('product_packages').delete()
    .eq('product_id', product_id)
    .eq('package_id', package_id)

  return NextResponse.json({ ok: true })
}
