import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 到期分佈提醒：卡片效期（manual_iccids.expiration_date）到期倒數
// GET ?today=&card_status=（預設排除 已用盡/失效/報廢）&card_type=
const CARD_STATUS: Record<string, string> = { '0': '已開卡', '1': '使用中', '2': '已用盡', '3': '失效', '4': '續期', '5': '報廢' }
const DEAD = new Set(['2', '3', '5'])   // 預設不提醒：已用盡 / 失效 / 報廢

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const cardStatus = sp.get('card_status') || ''
  const cardType = sp.get('card_type') || ''
  const includeDead = sp.get('include_dead') === '1'
  const todayISO = sp.get('today') || new Date().toISOString().slice(0, 10)
  const today = new Date(todayISO + 'T00:00:00Z')
  const supabase = createAdminClient()

  interface Card { iccid: string; card_status: string | null; card_type: string | null; expiration_date: string | null }
  const cards: Card[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('manual_iccids').select('iccid, card_status, card_type, expiration_date')
    if (cardStatus) q = q.eq('card_status', cardStatus)
    if (cardType) q = q.eq('card_type', cardType)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    cards.push(...(data as Card[]))
    if (data.length < 1000) break
  }

  const daysBetween = (d: string) => Math.floor((new Date(d.slice(0, 10) + 'T00:00:00Z').getTime() - today.getTime()) / 86400000)

  const buckets = [
    { key: 'expired', label: '已過期', lo: -Infinity, hi: -1, plans: 0 },
    { key: 'd7', label: '≤ 7 天', lo: 0, hi: 7, plans: 0 },
    { key: 'd30', label: '8–30 天', lo: 8, hi: 30, plans: 0 },
    { key: 'd90', label: '31–90 天', lo: 31, hi: 90, plans: 0 },
    { key: 'd90p', label: '> 90 天', lo: 91, hi: Infinity, plans: 0 },
    { key: 'none', label: '無效期', lo: 0, hi: 0, plans: 0 },
  ]
  const monthly = new Map<string, number>()
  const upcoming: { iccid: string; card_status: string | null; card_type: string | null; expiration_date: string; days: number }[] = []

  // 篩選：預設排除 dead 狀態（除非指定狀態或 include_dead）
  const pool = cards.filter(c => cardStatus || includeDead ? true : !DEAD.has(c.card_status || ''))
  for (const c of pool) {
    if (!c.expiration_date) { buckets[5].plans++; continue }
    const d = daysBetween(c.expiration_date)
    const b = d < 0 ? buckets[0] : d <= 7 ? buckets[1] : d <= 30 ? buckets[2] : d <= 90 ? buckets[3] : buckets[4]
    b.plans++
    if (d >= 0) {
      const m = c.expiration_date.slice(0, 7)
      monthly.set(m, (monthly.get(m) || 0) + 1)
      if (d <= 30) upcoming.push({ iccid: c.iccid, card_status: c.card_status, card_type: c.card_type, expiration_date: c.expiration_date.slice(0, 10), days: d })
    }
  }
  upcoming.sort((a, b) => a.days - b.days)

  return NextResponse.json({
    today: todayISO,
    total: pool.length,
    buckets: buckets.map(b => ({ key: b.key, label: b.label, plans: b.plans,
      pct: pool.length > 0 ? Math.round((b.plans / pool.length) * 1000) / 10 : 0 })),
    monthly: [...monthly].sort((a, b) => a[0].localeCompare(b[0])).map(([month, plans]) => ({ month, plans })),
    upcoming: upcoming.slice(0, 500),
    upcoming_total: upcoming.length,
    status_labels: CARD_STATUS,
  })
}
