import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 新增手動品項
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('shopee_orders').select('id').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })

  const name = (body.name || '').trim()
  const variation = (body.variation || '').trim() || null
  const quantity = Math.max(1, parseInt(body.quantity) || 1)
  const price = Number(body.price) || 0
  const bcSkuId = body.bc_sku_id || null
  const copies = body.matched_copies || null
  const deliveryType = body.delivery_type === 'esim' ? 'esim' : 'sim'

  if (!name) return NextResponse.json({ error: '請輸入品項名稱' }, { status: 400 })

  const { data: inserted, error } = await supabase.from('shopee_order_items').insert({
    shopee_order_id: id,
    shopee_product_name: name,
    shopee_product_id: null,
    shopee_variation_name: variation,
    shopee_variation_id: null,
    shopee_sku_code: null,
    original_price: price,
    sale_price: price,
    quantity,
    bc_sku_id: bcSkuId,
    matched_copies: copies,
    status: bcSkuId ? 'matched' : 'pending',
    is_manual: true,
    delivery_type: deliveryType,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: inserted })
}
