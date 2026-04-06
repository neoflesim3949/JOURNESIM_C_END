import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 商品對應列表
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const supabase = createAdminClient()

  let query = supabase.from('shopee_product_mappings').select('*').order('updated_at', { ascending: false })
  if (search) query = query.or(`shopee_product_name.ilike.%${search}%,shopee_variation_name.ilike.%${search}%,shopee_sku_code.ilike.%${search}%`)

  const { data } = await query
  return NextResponse.json(data || [])
}

// POST — 新增/更新商品對應
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  const { error } = await supabase.from('shopee_product_mappings').upsert({
    shopee_sku_code: body.shopee_sku_code,
    shopee_product_id: body.shopee_product_id || null,
    shopee_variation_id: body.shopee_variation_id || null,
    shopee_product_name: body.shopee_product_name || null,
    shopee_variation_name: body.shopee_variation_name || null,
    package_id: body.package_id || null,
    package_plan_id: body.package_plan_id || null,
    copies: body.copies || null,
    bc_sku_id: body.bc_sku_id || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'shopee_sku_code' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH — 只更新名稱欄位（不覆蓋對應關係）
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  const update: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if (body.shopee_product_name !== undefined) update.shopee_product_name = body.shopee_product_name || null
  if (body.shopee_variation_name !== undefined) update.shopee_variation_name = body.shopee_variation_name || null

  await supabase.from('shopee_product_mappings').update(update).eq('shopee_sku_code', body.shopee_sku_code)
  return NextResponse.json({ ok: true })
}

// DELETE — 刪除商品對應
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('shopee_product_mappings').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
