import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDailyTraffic } from '@/lib/billionconnect'

// 方案使用量矩陣（F023 日流量）：日期 × 地區 → 用量(KB)
// GET ?iccid=&begin=&end=&refresh=1
//   refresh=1（或無快取）→ 打 F023 存進 card_usage_daily；否則直接回既存
// 回傳 { dates:[], countries:[{code,name}], cells:{ 'date|code': amount }, rowTotals, colTotals, total }
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const iccid = (sp.get('iccid') || '').trim()
  if (!iccid) return NextResponse.json({ error: 'iccid 必填' }, { status: 400 })
  const supabase = createAdminClient()

  // 只撈方案「啟用～結束」區間：begin＝啟用日（必要），end＝結束日但不超過今天（查不到未來用量）
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const today = fmt(new Date())
  const begin = (sp.get('begin') || '').slice(0, 10)
  let end = (sp.get('end') || '').slice(0, 10) || today
  if (end > today) end = today  // 方案未結束 → 截到今天

  // 沒有啟用日 → 方案尚未啟用，無使用量可查（不打 F023、不預設區間）
  if (!begin) {
    return NextResponse.json({ iccid, begin: null, end: null, dates: [], countries: [], cells: {}, rowTotals: {}, colTotals: {}, total: 0, syncedAt: null, fetchError: null, note: '方案尚未啟用' })
  }

  // 是否已有快取
  const { count } = await supabase.from('card_usage_daily').select('id', { count: 'exact', head: true }).eq('iccid', iccid)
  let fetchError: string | null = null

  if (sp.get('refresh') === '1' || !count) {
    try {
      const items = await getDailyTraffic({ iccid, beginDate: begin, endDate: end })
      const rows = (items || []).map(it => ({
        iccid,
        used_date: (it.usedDate || '').slice(0, 10) || null,
        country: it.country || null,
        country_region_code: it.countryRegionCode || null,
        type: it.type || null,
        used_amount: it.usedAmount != null && it.usedAmount !== '' ? Number(it.usedAmount) : null,
        synced_at: new Date().toISOString(),
      })).filter(r => r.used_date)
      if (rows.length > 0) await supabase.from('card_usage_daily').upsert(rows, { onConflict: 'iccid,used_date,country_region_code' })
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e)
    }
  }

  // 讀出 → 樞紐成矩陣
  const { data } = await supabase.from('card_usage_daily')
    .select('used_date, country, country_region_code, used_amount, synced_at')
    .eq('iccid', iccid).order('used_date', { ascending: true })

  const dateSet = new Set<string>()
  const countryMap = new Map<string, string>()  // code → name
  const cells: Record<string, number> = {}
  let syncedAt: string | null = null
  for (const r of data || []) {
    const d = r.used_date as string
    const code = r.country_region_code || r.country || '—'
    dateSet.add(d)
    if (!countryMap.has(code)) countryMap.set(code, r.country || code)
    const key = `${d}|${code}`
    cells[key] = (cells[key] || 0) + (Number(r.used_amount) || 0)
    if (r.synced_at) syncedAt = r.synced_at
  }
  const dates = [...dateSet].sort()
  const countries = [...countryMap].map(([code, name]) => ({ code, name }))
  const rowTotals: Record<string, number> = {}
  const colTotals: Record<string, number> = {}
  let total = 0
  for (const d of dates) for (const c of countries) {
    const v = cells[`${d}|${c.code}`] || 0
    rowTotals[d] = (rowTotals[d] || 0) + v
    colTotals[c.code] = (colTotals[c.code] || 0) + v
    total += v
  }

  return NextResponse.json({ iccid, begin, end, dates, countries, cells, rowTotals, colTotals, total, syncedAt, fetchError })
}
