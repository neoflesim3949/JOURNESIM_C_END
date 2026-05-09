// 一次性：透過 F011 查 channelOrderId，印出原始回應，並寫入 bc_api_logs（讓後台 Log 頁可看）
// Usage: node --env-file=.env.local scripts/probe-bc-f011.mjs

import crypto from 'crypto'

const BC_URL = process.env.BILLIONCONNECT_URL
const APP_KEY = process.env.BILLIONCONNECT_APP_KEY
const APP_SECRET = process.env.BILLIONCONNECT_APP_SECRET
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BC_URL || !APP_KEY || !APP_SECRET) {
  console.error('Missing BILLIONCONNECT_URL / APP_KEY / APP_SECRET in env')
  process.exit(1)
}

function getTradeTime() {
  const utc8 = new Date(Date.now() + 8 * 3600 * 1000)
  return utc8.toISOString().replace('T', ' ').substring(0, 19)
}

async function logToSupabase(entry) {
  if (!SB_URL || !SB_KEY) return
  try {
    await fetch(`${SB_URL}/rest/v1/bc_api_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(entry),
    })
  } catch (e) {
    console.error('[supabase log] failed:', e)
  }
}

async function f011(channelOrderId) {
  const body = {
    tradeType: 'F011',
    tradeTime: getTradeTime(),
    tradeData: { channelOrderId },
  }
  const sign = crypto.createHash('md5').update(APP_SECRET + JSON.stringify(body), 'utf8').digest('hex')

  const start = Date.now()
  const res = await fetch(BC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'x-channel-id': APP_KEY,
      'x-sign-method': 'md5',
      'x-sign-value': sign,
    },
    body: JSON.stringify(body),
  })
  const duration = Date.now() - start
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch {}

  const status = parsed?.tradeCode === '1000' ? 'success' : 'error'
  await logToSupabase({
    trade_type: 'F011',
    direction: 'outgoing',
    request_body: body,
    response_body: parsed ?? { raw: text },
    status,
    error_message: status === 'error' ? `[${parsed?.tradeCode}] ${parsed?.tradeMsg || 'HTTP ' + res.status}` : null,
    duration_ms: duration,
  })

  console.log(`\n========== ${channelOrderId} ==========`)
  console.log('HTTP:', res.status, '·', duration + 'ms')
  console.log(parsed ? JSON.stringify(parsed, null, 2) : text)
}

const ids = ['FL260508C2ZXTAS', 'FS1778184064235115']
for (const id of ids) {
  await f011(id)
}
console.log('\n✓ 已寫入 bc_api_logs，可至後台 BC API Log 頁面查看（類型 F011，方向 發送）')
