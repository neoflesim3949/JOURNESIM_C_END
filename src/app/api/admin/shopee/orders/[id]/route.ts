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

  // 自動修正訂單狀態
  const allDone = (items || []).length > 0 && (items || []).every(i => i.bc_order_id && i.iccid && (i.iccid as string[]).length > 0)
  const expectedStatus = allDone ? 'completed' : (items || []).some(i => i.bc_order_id) ? 'processing' : 'pending'
  if (order.internal_status !== expectedStatus) {
    await supabase.from('shopee_orders').update({ internal_status: expectedStatus, updated_at: new Date().toISOString() }).eq('id', id)
    order.internal_status = expectedStatus
  }

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
    if (body.bc_order_id !== undefined) updates.bc_order_id = body.bc_order_id
    if (body.bc_sub_order_id !== undefined) updates.bc_sub_order_id = body.bc_sub_order_id
    if (body.cost_cny !== undefined) updates.cost_cny = body.cost_cny
    if (body.cost_twd !== undefined) updates.cost_twd = body.cost_twd
    if (body.status !== undefined) updates.status = body.status
    if (body.delivery_type !== undefined) updates.delivery_type = body.delivery_type
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

  // 更新訂單層級欄位
  const orderFields = [
    'internal_status', 'expiry_date', 'label_settings',
    'buyer_account', 'order_date', 'order_status', 'return_status', 'shopee_account_id',
    'recipient_name', 'recipient_phone', 'shipping_address', 'shopee_tracking_code',
    'pickup_store_id', 'city', 'district', 'zip_code', 'shipping_method',
    'fulfillment_method', 'payment_method', 'buyer_note', 'seller_note',
    'product_total', 'buyer_shipping_fee', 'shopee_shipping_subsidy', 'return_shipping_fee',
    'buyer_total_payment', 'seller_coupon', 'transaction_fee', 'other_service_fee',
    'payment_processing_fee', 'payment_processing_rate',
  ]
  const hasAny = orderFields.some(k => body[k] !== undefined)
  if (hasAny) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of orderFields) {
      if (body[k] !== undefined) updates[k] = body[k] === '' ? null : body[k]
    }
    const { error } = await supabase.from('shopee_orders').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效操作' }, { status: 400 })
}

// DELETE — 刪除訂單（僅手動訂單）
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('shopee_orders').select('id, is_manual').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })
  if (!order.is_manual) return NextResponse.json({ error: '只能刪除手動建立的訂單' }, { status: 400 })

  // 檢查是否已下 BC 訂單
  const { data: bcOrdered } = await supabase.from('shopee_order_items')
    .select('id').eq('shopee_order_id', id).not('bc_order_id', 'is', null).limit(1)
  if (bcOrdered && bcOrdered.length > 0) {
    return NextResponse.json({ error: '訂單內已有送出 BC 的商品，請先取消 BC 訂單' }, { status: 400 })
  }

  // shopee_order_items 有 ON DELETE CASCADE，會自動清掉
  const { error } = await supabase.from('shopee_orders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
