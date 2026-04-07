import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 批次取得多筆訂單詳情（用於批次列印）
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: '未選擇訂單' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: orders } = await supabase.from('shopee_orders').select('*').in('id', ids)
  if (!orders || orders.length === 0) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })

  const { data: items } = await supabase.from('shopee_order_items').select('*').in('shopee_order_id', ids).order('created_at')

  // 組合每筆訂單的 items
  const itemsByOrder = new Map<string, typeof items>()
  for (const item of items || []) {
    const list = itemsByOrder.get(item.shopee_order_id) || []
    list.push(item)
    itemsByOrder.set(item.shopee_order_id, list)
  }

  const result = orders.map(o => ({
    order: o,
    items: itemsByOrder.get(o.id) || [],
  }))

  return NextResponse.json(result)
}
