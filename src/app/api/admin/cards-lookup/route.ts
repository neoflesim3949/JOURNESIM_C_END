import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { getCardExpiry, getPlanUsage } from '@/lib/billionconnect'

// POST — 批次查詢 ICCID 對應的卡狀態 (F010) + 套餐使用 (F012)
// body: { iccids: string[] }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const iccids: string[] = Array.isArray(body.iccids)
    ? body.iccids.map((s: unknown) => String(s).trim()).filter(Boolean)
    : []
  if (iccids.length === 0) return NextResponse.json({ error: '請提供 ICCID 清單' }, { status: 400 })
  if (iccids.length > 200) return NextResponse.json({ error: '單次最多 200 筆，請分批查詢' }, { status: 400 })

  // F010 一次查全部卡有效期
  let cardExpiry: { iccid: string; type?: string; status?: string; expirationDate?: string; usageCount?: string }[] = []
  let cardErr: string | null = null
  try {
    cardExpiry = await getCardExpiry(iccids) || []
  } catch (err) {
    cardErr = err instanceof Error ? err.message : String(err)
  }
  const cardMap = new Map(cardExpiry.map(c => [c.iccid, c]))

  // F012 並行（限制 5 個 in-flight，避免打爆 BC）
  const planMap = new Map<string, { ok: boolean; orders?: { orderId?: string; channelOrderId?: string; subOrderList?: { skuName?: string; copies?: string; planStatus?: string; planStartTime?: string | null; planEndTime?: string | null; remainingDays?: string; totalDays?: string; totalTraffic?: string; remainingTraffic?: string; subOrderId?: string; channelSubOrderId?: string }[] }[]; error?: string }>()
  const concurrency = 5
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < iccids.length) {
      const idx = i++
      const ic = iccids[idx]
      try {
        const r = await getPlanUsage({ iccid: ic })
        planMap.set(ic, { ok: true, orders: r as never })
      } catch (err) {
        planMap.set(ic, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }))

  // 整合：以 iccid 為主鍵
  const rows = iccids.map(ic => ({
    iccid: ic,
    card: cardMap.get(ic) || null,
    plan: planMap.get(ic) || { ok: false, error: '未取得套餐資料' },
  }))

  return NextResponse.json({ rows, cardError: cardErr })
}
