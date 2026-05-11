import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 從 invoices 表反推目前已用的字軌統計
// 依 (期別, 字軌前綴, tax_type) 分群
function periodOf(dateStr: string): string {
  // dateStr e.g. "2026-05-11"
  const d = new Date(dateStr)
  const m = d.getMonth() + 1
  const rocYear = d.getFullYear() - 1911
  // 台灣發票期別：1-2 / 3-4 / 5-6 / 7-8 / 9-10 / 11-12
  const periodStart = m % 2 === 0 ? m - 1 : m
  const periodEnd = periodStart + 1
  return `${rocYear}年${periodStart}-${periodEnd}月`
}

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  // 撈最近 12 個月避免無限大資料；可依需求調整
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 12)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number, invoice_date, invoice_time, tax_type, intype, status')
    .gte('invoice_date', cutoffStr)
    .order('invoice_date', { ascending: false })
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 分組
  const groups = new Map<string, {
    period: string
    track: string
    intype: string | null
    tax_type: string | null
    used_count: number
    cancelled_count: number
    voided_count: number
    min_num: string
    max_num: string
    latest_num: string
    latest_at: string
  }>()
  for (const r of data || []) {
    if (!r.invoice_number) continue
    const period = periodOf(r.invoice_date)
    const track = r.invoice_number.slice(0, 2) // 前 2 碼字軌
    const key = `${period}|${track}|${r.intype || ''}|${r.tax_type || ''}`
    let g = groups.get(key)
    if (!g) {
      g = {
        period, track,
        intype: r.intype, tax_type: r.tax_type,
        used_count: 0, cancelled_count: 0, voided_count: 0,
        min_num: r.invoice_number, max_num: r.invoice_number,
        latest_num: r.invoice_number, latest_at: `${r.invoice_date} ${r.invoice_time || ''}`,
      }
      groups.set(key, g)
    }
    g.used_count++
    if (r.status === 'cancelled') g.cancelled_count++
    if (r.status === 'voided') g.voided_count++
    if (r.invoice_number < g.min_num) g.min_num = r.invoice_number
    if (r.invoice_number > g.max_num) {
      g.max_num = r.invoice_number
      g.latest_num = r.invoice_number
      g.latest_at = `${r.invoice_date} ${r.invoice_time || ''}`
    }
  }

  const rows = [...groups.values()].sort((a, b) =>
    a.period === b.period ? a.track.localeCompare(b.track) : b.period.localeCompare(a.period)
  )

  return NextResponse.json({ rows })
}
