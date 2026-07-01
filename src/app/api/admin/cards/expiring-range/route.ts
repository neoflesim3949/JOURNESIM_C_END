import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — 查詢到期日在區間內的卡片 ICCID
// 依 manual_iccids.expiration_date（文字格式 "2026-09-14 10:25:19"，可用字典序比較）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const from = (searchParams.get('from') || '').trim()
  const to = (searchParams.get('to') || '').trim()
  if (!from || !to) return NextResponse.json({ error: '請選擇起訖日期' }, { status: 400 })
  const supabase = createAdminClient()

  const rows: { iccid: string; expiration_date: string; card_status: string | null }[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await supabase
      .from('manual_iccids')
      .select('iccid, expiration_date, card_status')
      .not('expiration_date', 'is', null)
      .gte('expiration_date', from)
      .lte('expiration_date', `${to} 23:59:59`)
      .order('expiration_date')
      .range(f, f + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
  }

  return NextResponse.json({
    label: `${from} ~ ${to}`,
    iccids: rows.map(r => r.iccid),
    rows,
  })
}
