// 刪除指定日期之前的蝦皮訂單（連帶 shopee_order_items / shopee_settlements 由 CASCADE 自動清）
// Usage:
//   node --env-file=.env.local scripts/delete-old-shopee-orders.mjs           # dry-run
//   node --env-file=.env.local scripts/delete-old-shopee-orders.mjs --delete  # 真的刪

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DO_DELETE = process.argv.includes('--delete')

// 訂單日期門檻（不含這天）：刪除 order_date < CUTOFF 的訂單
const CUTOFF = '2026-04-01'

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
  const all = []
  let from = 0
  const size = 1000
  while (true) {
    const res = await fetch(
      `${SB_URL}/rest/v1/shopee_orders?select=id,shopee_order_number,order_date,internal_status,buyer_account&order_date=lt.${CUTOFF}&order=order_date.asc`,
      { headers: { ...headers, Range: `${from}-${from + size - 1}` } }
    )
    const data = await res.json()
    all.push(...data)
    if (data.length < size) break
    from += size
  }
  return all
}

const orders = await fetchAll()

console.log(`條件：order_date < ${CUTOFF}`)
console.log(`命中：${orders.length} 筆訂單`)

if (orders.length === 0) {
  console.log('無需刪除')
  process.exit(0)
}

// 依 internal_status 分布
const dist = new Map()
for (const o of orders) dist.set(o.internal_status, (dist.get(o.internal_status) || 0) + 1)
console.log('\n依 internal_status 分布：')
for (const [s, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s}: ${n} 筆`)
}

// 日期區間
const dates = orders.map(o => o.order_date).filter(Boolean).sort()
if (dates.length) {
  console.log(`\n日期區間：${String(dates[0]).slice(0, 10)} ~ ${String(dates[dates.length - 1]).slice(0, 10)}`)
}

console.log('\n前 10 筆樣本：')
for (const o of orders.slice(0, 10)) {
  console.log(`  ${o.shopee_order_number} [${o.internal_status}] ${String(o.order_date).slice(0, 10)} ${o.buyer_account || ''}`)
}

if (!DO_DELETE) {
  console.log('\n(dry-run，未刪除。加上 --delete 才會真的刪)')
  process.exit(0)
}

// 真的刪
console.log('\n開始刪除…')
const ids = orders.map(o => o.id)
const chunkSize = 100
let deleted = 0
for (let k = 0; k < ids.length; k += chunkSize) {
  const chunk = ids.slice(k, k + chunkSize)
  const inList = chunk.map(id => `"${id}"`).join(',')
  const res = await fetch(`${SB_URL}/rest/v1/shopee_orders?id=in.(${inList})`, {
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
console.log(`\n✓ 訂單刪除完成（${deleted} 筆）。shopee_order_items / shopee_settlements 由 ON DELETE CASCADE 自動清除。`)
