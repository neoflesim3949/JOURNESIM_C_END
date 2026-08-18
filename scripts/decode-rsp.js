// 解析 rsp_requests 裡的 ES9+ body（Base64 → ASN.1 DER → 可讀欄位）
// 用法：node scripts/decode-rsp.js
const fs = require('fs')
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
}
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── 極簡 ASN.1 DER 走訪：印出每個節點的 tag/長度，葉節點嘗試印可讀值 ──
function parseLen(buf, o) {
  let len = buf[o++]
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | buf[o++] }
  return { len, o }
}
function bcdSwap(buf) { // ICCID：半位元組對調
  let s = ''
  for (const b of buf) s += (b & 0x0f).toString(16) + ((b >> 4) & 0x0f).toString(16)
  return s.replace(/f+$/i, '')
}
function isPrintable(buf) { return buf.length > 0 && buf.every(b => b >= 0x20 && b <= 0x7e) }

function walk(buf, start, end, depth, out) {
  let o = start
  while (o < end) {
    const tag = buf[o]; const tagPos = o; o++
    const { len, o: o2 } = parseLen(buf, o); o = o2
    const content = buf.subarray(o, o + len)
    const constructed = (tag & 0x20) !== 0
    const pad = '  '.repeat(depth)
    const tagHex = tag.toString(16).padStart(2, '0')
    let label = ''
    if (tag === 0x5a) label = ` ← ICCID: ${bcdSwap(content)}`
    else if (tag === 0x06) label = ` (OID ${content.length}b)`
    else if (!constructed && isPrintable(content) && len < 80) label = ` = "${content.toString('latin1')}"`
    else if (!constructed && len <= 8) label = ` = 0x${content.toString('hex')}`
    out.push(`${pad}[${tagHex}] len=${len}${label}`)
    if (constructed && len > 0) walk(buf, o, o + len, depth + 1, out)
    o += len
  }
}

function decodeB64Der(b64) {
  const buf = Buffer.from(b64, 'base64')
  const out = []
  try { walk(buf, 0, buf.length, 0, out) } catch (e) { out.push('（DER 解析中斷：' + e.message + '）') }
  // 額外：全域掃 ICCID（5A 0A）
  const iccids = []
  for (let i = 0; i + 12 <= buf.length; i++) {
    if (buf[i] === 0x5a && buf[i + 1] === 0x0a) {
      const v = bcdSwap(buf.subarray(i + 2, i + 12))
      if (/^89\d{16,18}$/.test(v)) iccids.push(v)
    }
  }
  return { tree: out.join('\n'), iccids: [...new Set(iccids)], bytes: buf.length }
}

;(async () => {
  const { data } = await sb.from('rsp_requests')
    .select('path, method, body, iccid, created_at')
    .not('body', 'is', null)
    .order('created_at', { ascending: false }).limit(10)

  for (const r of data || []) {
    const action = r.path.split('?')[0].split('/').filter(Boolean).pop()
    console.log('\n' + '═'.repeat(70))
    console.log(`${r.created_at}  ${r.method} …/${action}`)
    let json
    try { json = JSON.parse(r.body) } catch { console.log('body 非 JSON'); continue }
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === 'string' && /^[A-Za-z0-9+/=]{20,}$/.test(v)) {
        const d = decodeB64Der(v)
        console.log(`\n【${k}】(Base64 → DER, ${d.bytes} bytes)${d.iccids.length ? '  ICCID=' + d.iccids.join(',') : ''}`)
        console.log(d.tree.split('\n').slice(0, 40).join('\n'))
      } else {
        console.log(`\n【${k}】= ${v}`)
      }
    }
  }
})()
