// 探測 BC F017 是否接受 orderId / subOrderId（而不是 channelOrderId / channelSubOrderId）
// 故意用不存在的 ICCID，確保即使參數被接受也不會真的建立售後單
// Usage: node --env-file=.env.local scripts/probe-bc-f017.mjs

import crypto from 'crypto'

const BC_URL = process.env.BILLIONCONNECT_URL
const APP_KEY = process.env.BILLIONCONNECT_APP_KEY
const APP_SECRET = process.env.BILLIONCONNECT_APP_SECRET

if (!BC_URL || !APP_KEY || !APP_SECRET) {
  console.error('Missing BC env')
  process.exit(1)
}

function ts() {
  const utc8 = new Date(Date.now() + 8 * 3600 * 1000)
  return utc8.toISOString().replace('T', ' ').substring(0, 19)
}

async function callF017(label, tradeData) {
  const body = { tradeType: 'F017', tradeTime: ts(), tradeData }
  const sign = crypto.createHash('md5').update(APP_SECRET + JSON.stringify(body), 'utf8').digest('hex')
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
  const text = await res.text()
  console.log(`\n========== ${label} ==========`)
  console.log('送出:', JSON.stringify(tradeData, null, 2))
  console.log('HTTP:', res.status)
  try { console.log('回應:', JSON.stringify(JSON.parse(text), null, 2)) }
  catch { console.log('回應(非 JSON):', text) }
}

// 從之前 F011 探測拿到的真實 BC 訂單
// FL260508C2ZXTAS → orderId: 2778172113423350, subOrderId: 1778172113429351
//                   channelSubOrderId: FL260508C2ZXTAS1
const ORDER_ID = '2778172113423350'
const SUB_ORDER_ID = '1778172113429351'
const CHANNEL_ORDER_ID = 'FL260508C2ZXTAS'
const CHANNEL_SUB_ORDER_ID = 'FL260508C2ZXTAS1'
const FAKE_ICCID = '00000000000000000000' // 確保 BC 不會真的處理

// Test 1：純 channelOrderId（baseline，應該通過參數驗證但被 ICCID 擋下）
await callF017('1) channelOrderId + channelSubOrderId（標準）', {
  channelOrderId: CHANNEL_ORDER_ID,
  channelSubOrderId: CHANNEL_SUB_ORDER_ID,
  reason: '20',
  iccid: [FAKE_ICCID],
  refundType: '0',
  unSubscribeFlow: '1',
  returnCardOrNot: '0',
  receivingState: '1',
})

// Test 2：只用 orderId（看是否被接受）
await callF017('2) orderId（取代 channelOrderId）', {
  orderId: ORDER_ID,
  reason: '20',
  iccid: [FAKE_ICCID],
  refundType: '0',
  unSubscribeFlow: '1',
  returnCardOrNot: '0',
  receivingState: '1',
})

// Test 3：orderId + subOrderId
await callF017('3) orderId + subOrderId', {
  orderId: ORDER_ID,
  subOrderId: SUB_ORDER_ID,
  reason: '20',
  iccid: [FAKE_ICCID],
  refundType: '0',
  unSubscribeFlow: '1',
  returnCardOrNot: '0',
  receivingState: '1',
})

// Test 4：兩種一起送（看 BC 優先用哪個）
await callF017('4) channelOrderId + orderId 都帶', {
  channelOrderId: CHANNEL_ORDER_ID,
  orderId: ORDER_ID,
  reason: '20',
  iccid: [FAKE_ICCID],
  refundType: '0',
  unSubscribeFlow: '1',
  returnCardOrNot: '0',
  receivingState: '1',
})
