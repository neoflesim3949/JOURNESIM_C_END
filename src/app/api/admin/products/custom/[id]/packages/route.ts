import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// GET — 取得方案已加入的套餐
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from('product_packages')
    .select('package_id')
    .eq('product_id', id)

  if (!links || links.length === 0) return NextResponse.json([])

  const pkgIds = links.map((l) => l.package_id)
  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, product_type, is_active')
    .in('id', pkgIds)

  return NextResponse.json(packages || [])
}

// POST — 加入套餐
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { package_id } = await request.json()
  const supabase = createAdminClient()

  await supabase.from('product_packages').upsert(
    { product_id: id, package_id },
    { onConflict: 'product_id,package_id' }
  )

  return NextResponse.json({ ok: true })
}

// DELETE — 移除套餐
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { package_id } = await request.json()
  const supabase = createAdminClient()

  await supabase.from('product_packages').delete()
    .eq('product_id', id)
    .eq('package_id', package_id)

  return NextResponse.json({ ok: true })
}
