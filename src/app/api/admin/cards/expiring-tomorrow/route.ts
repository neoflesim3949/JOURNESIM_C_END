import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 抓出今天 + 明天（台灣時區）即將到期的 ICCID
// 依 manual_iccids.expiration_date 欄位（BC F010 快取，文字格式如 "2026-09-14 10:25:19"）
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const tw = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
  const today = tw.format(new Date())
  const tomorrow = tw.format(new Date(Date.now() + 24 * 3600 * 1000))

  // expiration_date 開頭就是日期，用 or() 一次查兩天
  const { data, error } = await supabase
    .from('manual_iccids')
    .select('iccid, expiration_date, card_status')
    .or(`expiration_date.like.${today}%,expiration_date.like.${tomorrow}%`)
    .order('expiration_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    dates: [today, tomorrow],
    iccids: (data || []).map(r => r.iccid),
    rows: data || [],
  })
}
