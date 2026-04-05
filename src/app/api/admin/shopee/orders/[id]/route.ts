import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 蝦皮訂單詳情
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('shopee_orders').select('*').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })

  const { data: items } = await supabase.from('shopee_order_items').select('*').eq('shopee_order_id', id).order('created_at')
  const { data: settlements } = await supabase.from('shopee_settlements').select('*').eq('shopee_order_id', id).order('created_at')
  return NextResponse.json({ order, items: items || [], settlements: settlements || [] })
}

// PATCH — 更新訂單明細（對應商品、回填 ICCID、更新狀態）
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  // 更新明細項
  if (body.item_id) {
    const updates: Record<string, unknown> = {}
    if (body.matched_package_id !== undefined) updates.matched_package_id = body.matched_package_id
    if (body.matched_plan_id !== undefined) updates.matched_plan_id = body.matched_plan_id
    if (body.matched_copies !== undefined) updates.matched_copies = body.matched_copies
    if (body.bc_sku_id !== undefined) updates.bc_sku_id = body.bc_sku_id
    if (body.iccid !== undefined) updates.iccid = body.iccid
    if (body.status !== undefined) updates.status = body.status
    await supabase.from('shopee_order_items').update(updates).eq('id', body.item_id)

    // 如果有對應 + shopee_sku_code，自動記錄到 mappings
    if (body.save_mapping && body.shopee_sku_code && (body.matched_package_id || body.bc_sku_id)) {
      await supabase.from('shopee_product_mappings').upsert({
        shopee_sku_code: body.shopee_sku_code,
        shopee_product_id: body.shopee_product_id || null,
        shopee_variation_id: body.shopee_variation_id || null,
        shopee_product_name: body.shopee_product_name || null,
        shopee_variation_name: body.shopee_variation_name || null,
        package_id: body.matched_package_id || null,
        package_plan_id: body.matched_plan_id || null,
        copies: body.matched_copies || null,
        bc_sku_id: body.bc_sku_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shopee_sku_code' })
    }

    return NextResponse.json({ ok: true })
  }

  // 更新訂單層級欄位（狀態、使用期限、標籤設定）
  if (body.internal_status || body.expiry_date !== undefined || body.label_settings) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.internal_status) updates.internal_status = body.internal_status
    if (body.expiry_date !== undefined) updates.expiry_date = body.expiry_date || null
    if (body.label_settings) updates.label_settings = body.label_settings
    await supabase.from('shopee_orders').update(updates).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效操作' }, { status: 400 })
}
