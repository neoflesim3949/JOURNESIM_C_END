import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST { order_number, email } — 就地更新「未付款」訂單的 email。
// 結帳頁採進頁即載付款元件（先以訪客佔位信箱建單）；顧客填妥 email 後僅更新訂單、
// 不重建 Payment Element（金額未變無需新 session），省去 3~5 秒重載。
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const orderNumber = String(body.order_number || '').trim()
  const email = String(body.email || '').trim()
  if (!orderNumber || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('orders')
    .update({ email })
    .eq('order_number', orderNumber)
    .eq('status', 'pending_payment')   // 僅未付款訂單可改（已付款不可竄改交付信箱）
    .select('id').maybeSingle()
  if (error || !data) return NextResponse.json({ error: '更新失敗' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
