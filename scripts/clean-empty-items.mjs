// 清理空的 shopee_order_items
// Usage:
//   node --env-file=.env.local scripts/clean-empty-items.mjs           # dry-run，只列出
//   node --env-file=.env.local scripts/clean-empty-items.mjs --delete  # 真的刪

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DO_DELETE = process.argv.includes('--delete')

if (!SB_URL || !SB_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
}

async function fetchAll() {
  // 一次撈最多 1000 筆，迴圈分頁
  const all = []
  let from = 0
  const size = 1000
  while (true) {
    const res = await fetch(
      `${SB_URL}/rest/v1/shopee_order_items?select=id,shopee_order_id,shopee_product_name,shopee_sku_code,bc_sku_id,bc_order_id,iccid,is_manual,quantity&order=created_at.desc`,
      { headers: { ...headers, Range: `${from}-${from + size - 1}`, Prefer: 'count=exact' } }
    )
    const data = await res.json()
    all.push(...data)
    if (data.length < size) break
    from += size
  }
  return all
}

function isEmpty(it) {
  const noName = !it.shopee_product_name || String(it.shopee_product_name).trim() === ''
  const noSku = !it.shopee_sku_code || String(it.shopee_sku_code).trim() === ''
  const noBcSku = !it.bc_sku_id
  const noBcOrder = !it.bc_order_id
  const noIccid = !it.iccid || (Array.isArray(it.iccid) && it.iccid.length === 0)
  const notManual = !it.is_manual
  return noName && noSku && noBcSku && noBcOrder && noIccid && notManual
}

const items = await fetchAll()
const empties = items.filter(isEmpty)

console.log(`總明細數：${items.length}`)
console.log(`空明細候選：${empties.length}`)

if (empties.length === 0) {
  console.log('沒有需要清理的空明細')
  process.exit(0)
}

// 依訂單分組顯示
const byOrder = new Map()
for (const e of empties) {
  if (!byOrder.has(e.shopee_order_id)) byOrder.set(e.shopee_order_id, [])
  byOrder.get(e.shopee_order_id).push(e.id)
}

console.log(`\n影響訂單數：${byOrder.size}`)

// 撈每張受影響訂單的狀態，做分布統計
const orderIds = [...byOrder.keys()]
const statusByOrder = new Map()
const chunk = 200
for (let k = 0; k < orderIds.length; k += chunk) {
  const sub = orderIds.slice(k, k + chunk)
  const inList = sub.map(id => `"${id}"`).join(',')
  const res = await fetch(
    `${SB_URL}/rest/v1/shopee_orders?select=id,internal_status,shopee_order_number&id=in.(${inList})`,
    { headers }
  )
  const rows = await res.json()
  for (const r of rows) statusByOrder.set(r.id, r)
}

const dist = new Map()
for (const [orderId] of byOrder) {
  const s = statusByOrder.get(orderId)?.internal_status || '(未知)'
  dist.set(s, (dist.get(s) || 0) + 1)
}
console.log('\n受影響訂單依 internal_status 分布：')
for (const [s, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s}: ${n} 筆`)
}

// 依狀態各取 5 筆樣本檢查
function printOrder(orderId) {
  const o = statusByOrder.get(orderId)
  console.log(`\n──── ${o?.shopee_order_number || orderId} [${o?.internal_status || '?'}] ────`)
  const orderItems = items.filter(it => it.shopee_order_id === orderId)
  for (const it of orderItems) {
    const tag = isEmpty(it) ? '🗑️  空' : '✅ 有'
    const name = it.shopee_product_name ? String(it.shopee_product_name).slice(0, 35) + (it.shopee_product_name.length > 35 ? '…' : '') : '-'
    const sku = it.shopee_sku_code || '-'
    const bcSku = it.bc_sku_id || '-'
    const bcOrder = it.bc_order_id || '-'
    const iccid = Array.isArray(it.iccid) && it.iccid.length > 0 ? it.iccid.join(',') : '-'
    const qty = it.quantity || 1
    const manual = it.is_manual ? '[手動]' : ''
    console.log(`  ${tag} qty=${qty} ${manual} name="${name}" sku=${sku} bcSku=${bcSku} bcOrder=${bcOrder} iccid=${iccid}`)
  }
}

const statuses = ['pending', 'processing', 'completed']
for (const status of statuses) {
  const matched = [...byOrder.keys()].filter(oid => statusByOrder.get(oid)?.internal_status === status).slice(0, 5)
  if (matched.length === 0) continue
  console.log(`\n===== ${status} （取 ${matched.length} 筆樣本）=====`)
  for (const orderId of matched) printOrder(orderId)
}

if (!DO_DELETE) {
  console.log('\n(dry-run，未刪除。加上 --delete 旗標才會真的刪)')
  process.exit(0)
}

// 真的刪
console.log('\n開始刪除…')
const ids = empties.map(e => e.id)
const chunkSize = 100
let deleted = 0
for (let k = 0; k < ids.length; k += chunkSize) {
  const chunk = ids.slice(k, k + chunkSize)
  const inList = chunk.map(id => `"${id}"`).join(',')
  const res = await fetch(`${SB_URL}/rest/v1/shopee_order_items?id=in.(${inList})`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    console.error('刪除失敗：', res.status, await res.text())
    break
  }
  deleted += chunk.length
  process.stdout.write(`\r已刪除 ${deleted}/${ids.length}`)
}
console.log(`\n✓ 刪除完成（${deleted} 筆）`)
