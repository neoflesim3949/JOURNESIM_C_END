// 在 systest@flesim.com 會員底下建立一筆「真實」的已完成 eSIM 訂單（含可掃描 QR）
// 執行：node --env-file=.env.local scripts/seed-systest-order.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('缺少 SUPABASE 環境變數'); process.exit(1) }
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const EMAIL = 'systest@flesim.com'
const DEFAULT_PW = 'Flesim@Test2026'

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => (x.email || '').toLowerCase() === email.toLowerCase())
    if (u) return u
    if (data.users.length < 200) break
  }
  return null
}

async function ensureMember() {
  // 1) members 表已有？
  const { data: m } = await sb.from('members').select('id, email').eq('email', EMAIL).maybeSingle()
  if (m) return { id: m.id, created: false }

  // 2) auth 有此 user？
  let user = await findAuthUser(EMAIL)
  let createdPw = null
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email: EMAIL, password: DEFAULT_PW, email_confirm: true, user_metadata: { display_name: 'System Test' } })
    if (error) throw error
    user = data.user
    createdPw = DEFAULT_PW
  }
  // 3) 補 members row（id = auth uid）
  await sb.from('members').upsert({ id: user.id, email: EMAIL, display_name: 'System Test', auth_provider: 'email' }, { onConflict: 'id' })
  return { id: user.id, created: true, password: createdPw }
}

async function main() {
  const member = await ensureMember()
  console.log('會員 id：', member.id, member.password ? `（新建，密碼：${member.password}）` : '（既有）')

  const now = new Date()
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '')
  const orderNumber = `FL${stamp}E${now.getTime().toString().slice(-5)}`

  const iccid = '89886019000000123456'
  const activation = `FL${stamp}ESIMACT001`
  const smdp = 'flesim-smdp.bc'
  const lpa = `LPA:1$${smdp}$${activation}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lpa)}`

  // 1) orders
  const { data: order, error: oErr } = await sb.from('orders').insert({
    member_id: member.id,
    email: EMAIL,
    order_number: orderNumber,
    status: 'completed',
    total_amount: 450,
    payment_method: 'credit_card',
    tappay_trade_id: `TP${now.getTime()}`,
    bc_order_id: `BC${stamp}0001`,
  }).select('id, order_number').single()
  if (oErr) throw oErr

  // 2) order_items
  const { data: item, error: iErr } = await sb.from('order_items').insert({
    order_id: order.id,
    product_id: '00000000-0000-0000-0000-0000000000jp'.replace(/[^0-9a-f-]/g, '0'),
    product_name: '日本 eSIM · 每日高速 3GB 吃到飽',
    plan_type: 'daily',
    plan_label: '5 天 · 每日 3GB 高速吃到飽',
    days: 5,
    quantity: 1,
    unit_price: 450,
    subtotal: 450,
    bc_sku_id: 'JP-5G-DAILY-3GB',
    iccid: [iccid],
    plan_status: 'active',
  }).select('id').single()
  if (iErr) throw iErr

  // 3) esim_profiles（真實可掃描 QR）
  const { error: eErr } = await sb.from('esim_profiles').insert({
    order_item_id: item.id,
    iccid,
    qr_code_url: qrUrl,
    qr_code_data: lpa,
    sm_dp_address: smdp,
    activation_code: activation,
    status: 'active',
  })
  if (eErr) throw eErr

  console.log('✅ 已建立訂單：', order.order_number, '→ 訂單 id：', order.id)
  console.log('   前台網址：/orders  以及  /orders/' + order.id)
}

main().catch(e => { console.error('❌ 失敗：', e.message || e); process.exit(1) })
