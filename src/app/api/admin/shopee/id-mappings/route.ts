import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 取得所有商品ID和規格ID對應
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const [{ data: products }, { data: variations }] = await Promise.all([
    supabase.from('shopee_product_id_mappings').select('*').order('created_at', { ascending: false }),
    supabase.from('shopee_variation_id_mappings').select('*').order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    products: products || [],
    variations: variations || [],
  })
}

// POST — 新增/更新對應
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  if (body.type === 'product') {
    await supabase.from('shopee_product_id_mappings').upsert({
      shopee_product_id: body.shopee_id,
      display_name: body.display_name,
    }, { onConflict: 'shopee_product_id' })
  } else if (body.type === 'variation') {
    await supabase.from('shopee_variation_id_mappings').upsert({
      shopee_variation_id: body.shopee_id,
      display_name: body.display_name,
    }, { onConflict: 'shopee_variation_id' })
  }

  return NextResponse.json({ ok: true })
}

// DELETE — 刪除對應
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { type, id } = await request.json()
  const supabase = createAdminClient()

  if (type === 'product') {
    await supabase.from('shopee_product_id_mappings').delete().eq('id', id)
  } else if (type === 'variation') {
    await supabase.from('shopee_variation_id_mappings').delete().eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
