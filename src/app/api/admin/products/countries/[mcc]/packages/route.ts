import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

// GET — 取得該 MCC 已加入的套餐
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const { mcc } = await params
  const supabase = createAdminClient()

  const { data: links } = await supabase.from('country_packages').select('package_id').eq('mcc', mcc)
  const packageIds = (links || []).map((l) => l.package_id)
  if (packageIds.length === 0) return NextResponse.json([])

  const { data: packages } = await supabase.from('packages').select('id, name, description, product_type, is_active').in('id', packageIds)
  return NextResponse.json(packages || [])
}

// POST — 加入套餐
export async function POST(
  request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const { mcc } = await params
  const { package_id } = await request.json()
  const supabase = createAdminClient()

  const { error } = await supabase.from('country_packages').upsert({ mcc, package_id }, { onConflict: 'mcc,package_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — 移除套餐
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const { mcc } = await params
  const { package_id } = await request.json()
  const supabase = createAdminClient()

  await supabase.from('country_packages').delete().eq('mcc', mcc).eq('package_id', package_id)
  return NextResponse.json({ ok: true })
}
