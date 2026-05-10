// 全量重算 shopee_orders.internal_status（同 GET /api/admin/shopee/orders/[id] 的邏輯）
// Usage:
//   node --env-file=.env.local scripts/recompute-shopee-status.mjs           # dry-run
//   node --env-file=.env.local scripts/recompute-shopee-status.mjs --update  # 真的更新

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DO_UPDATE = process.argv.includes('--update')

if (!SB_URL || !SB_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
}

async function fetchAll(endpoint) {
  const all = []
  let from = 0
  const size = 1000
  while (true) {
    const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
      headers: { ...headers, Range: `${from}-${from + size - 1}` },
    })
    const data = await res.json()
    all.push(...data)
    if (data.length < size) break
    from += size
  }
  return all
}

const orders = await fetchAll('shopee_orders?select=id,shopee_order_number,order_status,internal_status')
const items = await fetchAll('shopee_order_items?select=shopee_order_id,delivery_type,iccid,lpa_code,qr_code_url,cost_cny,cost_twd,bc_order_id')

const itemsByOrder = new Map()
for (const it of items) {
  if (!itemsByOrder.has(it.shopee_order_id)) itemsByOrder.set(it.shopee_order_id, [])
  itemsByOrder.get(it.shopee_order_id).push(it)
}

function isItemReady(i) {
  const hasCost = (i.cost_cny != null && i.cost_cny > 0) || (i.cost_twd != null && i.cost_twd > 0)
  if (!hasCost) return false
  const hasIccid = !!(i.iccid && Array.isArray(i.iccid) && i.iccid.length > 0)
  if (i.delivery_type === 'esim') return hasIccid || !!i.lpa_code || !!i.qr_code_url
  return hasIccid
}

function expectedStatus(order, itemsArr) {
  if (order.order_status === '不成立') return '不成立'
  const allDone = itemsArr.length > 0 && itemsArr.every(isItemReady)
  const someProcessing = itemsArr.some(i => i.bc_order_id || isItemReady(i))
  return allDone ? 'completed' : someProcessing ? 'processing' : 'pending'
}

const transitions = []
for (const o of orders) {
  const its = itemsByOrder.get(o.id) || []
  const expected = expectedStatus(o, its)
  if (o.internal_status !== expected) {
    transitions.push({ id: o.id, num: o.shopee_order_number, from: o.internal_status, to: expected, count: its.length })
  }
}

console.log(`總訂單：${orders.length}`)
console.log(`需要更新：${transitions.length}`)

if (transitions.length === 0) {
  console.log('所有狀態都正確，無需更新')
  process.exit(0)
}

const transDist = new Map()
for (const t of transitions) {
  const key = `${t.from} → ${t.to}`
  transDist.set(key, (transDist.get(key) || 0) + 1)
}
console.log('\n變化分布：')
for (const [k, n] of [...transDist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${n} 筆`)
}

console.log('\n前 15 筆樣本：')
for (const t of transitions.slice(0, 15)) {
  console.log(`  ${t.num} [${t.from} → ${t.to}] (items=${t.count})`)
}

if (!DO_UPDATE) {
  console.log('\n(dry-run，未更新。加上 --update 才會真的寫入)')
  process.exit(0)
}

console.log('\n開始更新…')
const now = new Date().toISOString()
let done = 0
const chunk = 50
for (let k = 0; k < transitions.length; k += chunk) {
  const sub = transitions.slice(k, k + chunk)
  // 依目標狀態分組做 batch update
  const byTo = new Map()
  for (const t of sub) {
    if (!byTo.has(t.to)) byTo.set(t.to, [])
    byTo.get(t.to).push(t.id)
  }
  for (const [to, ids] of byTo) {
    const inList = ids.map(id => `"${id}"`).join(',')
    const res = await fetch(`${SB_URL}/rest/v1/shopee_orders?id=in.(${inList})`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ internal_status: to, updated_at: now }),
    })
    if (!res.ok) {
      console.error('\n更新失敗：', res.status, await res.text())
      process.exit(1)
    }
    done += ids.length
  }
  process.stdout.write(`\r已更新 ${done}/${transitions.length}`)
}
console.log(`\n✓ 狀態更新完成（${done} 筆）`)
