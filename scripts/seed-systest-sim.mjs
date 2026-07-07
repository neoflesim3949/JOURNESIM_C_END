// 在 systest@flesim.com 下建立一筆「實體 SIM」訂單（含收件地址與物流追蹤）
// 執行：node --env-file=.env.local scripts/seed-systest-sim.mjs
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMAIL = 'systest@flesim.com'

const main = async () => {
  const { data: m } = await sb.from('members').select('id').eq('email', EMAIL).maybeSingle()
  if (!m) { console.error('member not found'); process.exit(1) }
  const now = new Date(); const stamp = now.toISOString().slice(0, 10).replace(/-/g, '')
  const orderNumber = `FL${stamp}S${now.getTime().toString().slice(-5)}`

  const { data: order, error: oErr } = await sb.from('orders').insert({
    member_id: m.id, email: EMAIL, order_number: orderNumber, status: 'shipping', total_amount: 490,
    payment_method: 'credit_card', tappay_trade_id: `TP${now.getTime()}`, bc_order_id: `BC${stamp}0002`,
    shipping_name: '王小明', shipping_phone: '0912-345-678',
    shipping_address: '桃園市蘆竹區南崁路 265 號 6 樓之 6',
  }).select('id, order_number').single()
  if (oErr) throw oErr

  const { data: item, error: iErr } = await sb.from('order_items').insert({
    order_id: order.id, product_id: '00000000-0000-0000-0000-000000000000',
    product_name: '日本 5G SIM 卡 · 每日高速 3GB 吃到飽', plan_type: 'daily', plan_label: '5 天 · 每日 3GB 高速吃到飽',
    days: 5, quantity: 1, unit_price: 490, subtotal: 490, bc_sku_id: 'JP-5G-SIM-DAILY-3GB',
    iccid: ['89886019000000129999'], plan_status: 'active',
  }).select('id').single()
  if (iErr) throw iErr

  // 子訂單（實體 SIM，含物流追蹤）
  const { error: sErr } = await sb.from('sub_orders').insert({
    order_id: order.id, sub_order_number: `${orderNumber}-01`, category: 'sim', status: 'shipping',
    subtotal: 490, tracking_number: '9012-3456-7890', shipping_status: 'shipping',
  })
  if (sErr) console.log('sub_orders 註記略過：', sErr.message)

  console.log('✅ 實體 SIM 訂單：', order.order_number, '→', order.id)
}
main().catch(e => { console.error('❌', e.message || e); process.exit(1) })
