import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { getDailyTraffic } from '@/lib/billionconnect'

// GET — 查單張 ICCID 的日流量（F023）
// 預設查近 30 天
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const iccid = (searchParams.get('iccid') || '').trim()
  if (!iccid) return NextResponse.json({ error: 'iccid 必填' }, { status: 400 })

  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const endDate = searchParams.get('end_date') || fmt(today)
  const beginDate = searchParams.get('begin_date') || fmt(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000))

  try {
    const items = await getDailyTraffic({ iccid, beginDate, endDate })
    return NextResponse.json({ iccid, beginDate, endDate, items: items || [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `F023 失敗：${msg}` }, { status: 500 })
  }
}
