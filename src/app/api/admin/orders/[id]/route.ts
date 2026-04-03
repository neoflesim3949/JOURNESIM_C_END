import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'


// GET — 取得訂單完整 L1/L2/L3 結構
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('orders').select('*').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })

  // L2: 子訂單
  const { data: subOrders } = await supabase.from('sub_orders')
    .select('*').eq('order_id', id).order('created_at')

  // L3: SKU 單號
  const subIds = (subOrders || []).map((s) => s.id)
  const { data: orderSkus } = subIds.length > 0
    ? await supabase.from('order_skus').select('*').in('sub_order_id', subIds).order('created_at')
    : { data: [] }

  // 組裝
  const result = (subOrders || []).map((sub) => ({
    ...sub,
    skus: (orderSkus || []).filter((s) => s.sub_order_id === sub.id),
  }))

  return NextResponse.json({ order, sub_orders: result })
}

// PATCH — 更新子訂單或 SKU（ICCID 回填、物流、狀態）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  // 更新子訂單（物流、狀態）
  if (body.sub_order_id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.status !== undefined) updates.status = body.status
    if (body.tracking_number !== undefined) updates.tracking_number = body.tracking_number
    if (body.shipping_status !== undefined) updates.shipping_status = body.shipping_status
    if (body.bc_order_id !== undefined) updates.bc_order_id = body.bc_order_id

    await supabase.from('sub_orders').update(updates).eq('id', body.sub_order_id)
    return NextResponse.json({ ok: true })
  }

  // 更新 SKU（ICCID 回填）
  if (body.sku_id) {
    const updates: Record<string, unknown> = {}
    if (body.sim_iccid !== undefined) updates.sim_iccid = body.sim_iccid
    if (body.iccid !== undefined) updates.iccid = body.iccid
    if (body.qr_code_url !== undefined) updates.qr_code_url = body.qr_code_url
    if (body.lpa_code !== undefined) updates.lpa_code = body.lpa_code
    if (body.status !== undefined) updates.status = body.status
    if (body.bc_sub_order_id !== undefined) updates.bc_sub_order_id = body.bc_sub_order_id

    await supabase.from('order_skus').update(updates).eq('id', body.sku_id)
    return NextResponse.json({ ok: true })
  }

  // 更新主訂單狀態
  if (body.order_status) {
    await supabase.from('orders').update({ status: body.order_status, updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效操作' }, { status: 400 })
}
