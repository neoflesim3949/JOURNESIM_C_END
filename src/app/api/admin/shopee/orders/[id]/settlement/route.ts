import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH — 為手動訂單手動寫入金流結算（主要用於 wallet_amount）
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('shopee_orders')
    .select('id, is_manual, shopee_order_number').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })
  if (!order.is_manual) return NextResponse.json({ error: '僅手動訂單可手動編輯金流結算' }, { status: 400 })

  const allowed = [
    'wallet_amount', 'refund_amount', 'wallet_date',
    'ams_fee', 'transaction_fee', 'other_service_fee', 'processing_fee',
    'processing_rate', 'original_price', 'seller_coupon',
    'buyer_shipping_fee', 'return_shipping_fee', 'payment_method',
    'damage_compensation',
  ]
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k] === '' ? null : body[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '無有效欄位' }, { status: 400 })
  }

  // 若已有結算紀錄則 update，否則 insert
  const { data: existing } = await supabase.from('shopee_settlements')
    .select('id').eq('shopee_order_id', id).maybeSingle()

  if (existing) {
    const { error } = await supabase.from('shopee_settlements').update(updates).eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('shopee_settlements').insert({
      shopee_order_number: order.shopee_order_number,
      shopee_order_id: id,
      ...updates,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
