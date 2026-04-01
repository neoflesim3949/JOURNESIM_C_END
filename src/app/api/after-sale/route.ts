import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAfterSale } from '@/lib/billionconnect'

export async function POST(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const body = await request.json()
  const { order_id, reason } = body

  if (!order_id || !reason) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 驗證訂單屬於此用戶
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('order_number', order_id)
    .eq('member_id', user.id)
    .single()

  if (!order) {
    return NextResponse.json({ error: '訂單不存在或非您的訂單' }, { status: 404 })
  }

  // 取得 ICCID
  const { data: items } = await supabase
    .from('order_items')
    .select('iccid')
    .eq('order_id', order.id)

  const iccids = (items || []).flatMap((i) => i.iccid || [])

  // 建立售後申請
  const { data: afterSale, error } = await supabase
    .from('after_sales')
    .insert({
      order_id: order.id,
      member_id: user.id,
      reason,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: '建立售後申請失敗' }, { status: 500 })
  }

  // 嘗試向 BC 提交售後
  if (order.bc_order_id && iccids.length > 0) {
    try {
      const result = await createAfterSale({
        channelOrderId: order.order_number,
        reason,
        iccid: iccids,
        refundType: '0',
      })

      await supabase
        .from('after_sales')
        .update({ bc_after_sale_id: result.afterSaleId, status: 'processing' })
        .eq('id', afterSale.id)
    } catch (err) {
      console.error('BC after-sale failed:', err)
    }
  }

  return NextResponse.json({ id: afterSale.id })
}
