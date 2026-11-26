import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { getPlanUsage, getAccelerationSkus, createAccelerationOrder } from '@/lib/billionconnect'

// 卡片加購（加速包）：F012 釣出卡的所有訂單 → F015 查可加購方案 → F016 下加購單
//
// GET ?step=orders&iccid=...                     → F012 該卡所有相關訂單
// GET ?step=skus&iccid=...&orderId=...&dayType=.. → F015 該訂單可加購加速包
// POST { orderId, iccid, originalSaleGoodsId, skuId, copies, settlementPrice, dayType, comment? }
//                                                → F016 下加購單（渠道單號系統自動產生）

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const step = searchParams.get('step') || ''
  const iccid = (searchParams.get('iccid') || '').trim()
  if (!iccid) return NextResponse.json({ error: '請提供卡號（ICCID）' }, { status: 400 })

  // Step 1：F012 釣出該卡所有相關訂單
  if (step === 'orders') {
    try {
      const orders = await getPlanUsage({ iccid }) || []
      return NextResponse.json({ orders })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
    }
  }

  // Step 2：F015 查該訂單可加購加速包
  if (step === 'skus') {
    const orderId = (searchParams.get('orderId') || '').trim()
    const dayType = (searchParams.get('dayType') || '0').trim() // 0-單日加速 1-套餐升級 2-總量升級
    if (!orderId) return NextResponse.json({ error: '請選擇要加購的訂單' }, { status: 400 })
    try {
      const result = await getAccelerationSkus({ orderId, iccid, dayType })
      return NextResponse.json({ result })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
    }
  }

  return NextResponse.json({ error: '未知的 step（orders | skus）' }, { status: 400 })
}

// 系統自動產生渠道單號：ACC + yyyymmddHHmmss(UTC+8) + 3 碼亂數
function genChannelOrderId(): string {
  const utc8 = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const ts = utc8.toISOString().replace(/[-:T]/g, '').substring(0, 14)
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `ACC${ts}${rand}`
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))

  const orderId = String(body.orderId || '').trim()
  const iccid = String(body.iccid || '').trim()
  const originalSaleGoodsId = String(body.originalSaleGoodsId || '').trim()
  const skuId = String(body.skuId || '').trim()
  const settlementPrice = String(body.settlementPrice ?? '').trim()
  const dayType = String(body.dayType || '0').trim()
  const copiesNum = Math.max(1, Math.floor(Number(body.copies) || 0))

  if (!orderId) return NextResponse.json({ error: '缺少原訂單號 orderId' }, { status: 400 })
  if (!iccid) return NextResponse.json({ error: '缺少卡號 iccid' }, { status: 400 })
  if (!originalSaleGoodsId) return NextResponse.json({ error: '缺少目前商品 ID（originalSaleGoodsId）' }, { status: 400 })
  if (!skuId) return NextResponse.json({ error: '請選擇加購的加速包' }, { status: 400 })
  if (!settlementPrice) return NextResponse.json({ error: '缺少結算價 settlementPrice' }, { status: 400 })
  if (copiesNum < 1) return NextResponse.json({ error: '份數至少為 1' }, { status: 400 })

  const channelOrderId = genChannelOrderId()
  const channelSubOrderId = `${channelOrderId}-1`
  const totalAmount = (Number(settlementPrice) * copiesNum).toFixed(2)

  try {
    const result = await createAccelerationOrder({
      originalOrderId: orderId,
      originalSaleGoodsId,
      channelOrderId,
      dayType,
      totalAmount,
      discountAmount: '0',
      comment: typeof body.comment === 'string' ? body.comment : undefined,
      subOrderList: [{
        channelSubOrderId,
        iccid,
        skuId,
        copies: String(copiesNum),
        settlementPrice,
      }],
    })
    return NextResponse.json({ ok: true, channelOrderId, channelSubOrderId, totalAmount, result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
