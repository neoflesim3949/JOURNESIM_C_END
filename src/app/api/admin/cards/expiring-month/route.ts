import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 抓出「本月」（台灣時區）即將到期的 ICCID
// 依 manual_iccids.expiration_date（BC F010 快取，文字格式如 "2026-09-14 10:25:19"）
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  // 台灣時區的年-月，例如 2026-07
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).format(new Date())
  const ym = parts.slice(0, 7) // "2026-07"

  // 分頁撈全（PostgREST 單次上限 1000 筆）
  const rows: { iccid: string; expiration_date: string; card_status: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('manual_iccids')
      .select('iccid, expiration_date, card_status')
      .like('expiration_date', `${ym}%`)
      .order('expiration_date')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
  }

  return NextResponse.json({
    label: `${ym} 本月`,
    iccids: rows.map(r => r.iccid),
    rows,
  })
}
