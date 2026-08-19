import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 卡片生命週期：狀態分佈 / 啟用漏斗 / 啟用時長 / 號段分析
// GET ?card_type=&seglen=（號段前綴長度，預設 10）
const CARD_STATUS: Record<string, string> = { '0': '已開卡', '1': '使用中', '2': '已用盡', '3': '失效', '4': '續期', '5': '報廢' }
const DEAD = new Set(['3', '5'])   // 失效 / 報廢

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const cardType = sp.get('card_type') || ''
  const seglen = Math.min(Math.max(Number(sp.get('seglen')) || 10, 4), 18)
  const supabase = createAdminClient()

  interface Card { iccid: string; card_status: string | null; card_type: string | null; activation_start_time: string | null; activation_end_time: string | null; created_at: string | null }
  const cards: Card[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('manual_iccids').select('iccid, card_status, card_type, activation_start_time, activation_end_time, created_at')
    if (cardType) q = q.eq('card_type', cardType)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    cards.push(...(data as Card[]))
    if (data.length < 1000) break
  }

  // 狀態分佈
  const statusDist = new Map<string, number>()
  let activated = 0, dead = 0
  // 啟用時長分佈（activation_end - activation_start，天）
  const spanBuckets = [
    { key: 's3', label: '≤ 3 天', lo: -1, hi: 3, plans: 0 },
    { key: 's7', label: '4–7 天', lo: 3, hi: 7, plans: 0 },
    { key: 's15', label: '8–15 天', lo: 7, hi: 15, plans: 0 },
    { key: 's30', label: '16–30 天', lo: 15, hi: 30, plans: 0 },
    { key: 's30p', label: '> 30 天', lo: 30, hi: Infinity, plans: 0 },
  ]
  const spanByDay = new Array(31).fill(0)   // 0~30 天逐日
  // 號段分析
  const segMap = new Map<string, { cards: number; activated: number; dead: number; status: Map<string, number> }>()

  const dayDiff = (a: string, b: string) => Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)

  for (const c of cards) {
    const st = c.card_status || '—'
    statusDist.set(st, (statusDist.get(st) || 0) + 1)
    if (c.activation_start_time) activated++
    if (DEAD.has(st)) dead++

    if (c.activation_start_time && c.activation_end_time) {
      const d = dayDiff(c.activation_end_time, c.activation_start_time)
      for (const b of spanBuckets) if (d > b.lo && d <= b.hi) { b.plans++; break }
      if (d >= 0 && d <= 30) spanByDay[d]++
    }

    const seg = c.iccid.slice(0, seglen)
    let s = segMap.get(seg)
    if (!s) { s = { cards: 0, activated: 0, dead: 0, status: new Map() }; segMap.set(seg, s) }
    s.cards++
    if (c.activation_start_time) s.activated++
    if (DEAD.has(st)) s.dead++
    s.status.set(st, (s.status.get(st) || 0) + 1)
  }

  const total = cards.length
  const segments = [...segMap].map(([prefix, s]) => ({
    prefix,
    cards: s.cards,
    activated: s.activated,
    activated_pct: s.cards > 0 ? Math.round((s.activated / s.cards) * 1000) / 10 : 0,
    dead: s.dead,
    dead_pct: s.cards > 0 ? Math.round((s.dead / s.cards) * 1000) / 10 : 0,
    status: [...s.status].map(([k, v]) => ({ status: k, label: CARD_STATUS[k] || k, count: v })).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.cards - a.cards)

  return NextResponse.json({
    total,
    activated,
    activated_pct: total > 0 ? Math.round((activated / total) * 1000) / 10 : 0,
    dead,
    dead_pct: total > 0 ? Math.round((dead / total) * 1000) / 10 : 0,
    status_dist: [...statusDist].map(([status, count]) => ({ status, label: CARD_STATUS[status] || status, count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 })).sort((a, b) => Number(a.status) - Number(b.status)),
    span_total: spanBuckets.reduce((s, b) => s + b.plans, 0),
    span_buckets: spanBuckets.map(b => ({ key: b.key, label: b.label, plans: b.plans })),
    span_by_day: spanByDay.map((plans, day) => ({ day, plans })),
    seglen,
    segments: segments.slice(0, 300),
    segment_total: segments.length,
  })
}
