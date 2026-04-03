import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET() {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('products')
    .select('id, name, description, country_code, country_name, product_type, scope, sort_order, is_active, icon_url, created_at')
    .order('sort_order')
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const body = await request.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('products')
    .insert({
      name: body.name,
      description: body.description || null,
      country_code: body.country_code,
      country_name: body.country_name,
      product_type: body.product_type || 'esim',
      scope: body.scope || 'local',
      sort_order: body.sort_order || 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const body = await request.json()
  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order
  if (body.country_code !== undefined) updates.country_code = body.country_code
  if (body.country_name !== undefined) updates.country_name = body.country_name
  if (body.icon_url !== undefined) updates.icon_url = body.icon_url
  updates.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', body.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const { id } = await request.json()
  const supabase = createAdminClient()

  // 刪除關聯
  await supabase.from('product_packages').delete().eq('product_id', id)

  const { error } = await supabase.from('products').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

