import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// DELETE — 刪除品項（僅手動品項或未下單品項）
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params
  const supabase = createAdminClient()

  const { data: item } = await supabase.from('shopee_order_items')
    .select('id, bc_order_id, shopee_order_id').eq('id', itemId).single()
  if (!item || item.shopee_order_id !== id) {
    return NextResponse.json({ error: '找不到品項' }, { status: 404 })
  }
  if (item.bc_order_id) {
    return NextResponse.json({ error: '已下 BC 訂單，無法刪除' }, { status: 400 })
  }

  const { error } = await supabase.from('shopee_order_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
