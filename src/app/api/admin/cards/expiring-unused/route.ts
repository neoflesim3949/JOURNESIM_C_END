import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 近七天（今天 ~ 今天+7）到期且套餐未使用（plan_unused=true）的卡片數量
// 供 /admin 各頁提醒彈窗使用。日期以台北時區計算。
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const now = new Date()
  const todayStr = fmt.format(now)
  const in7Str = fmt.format(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))

  const { count, error } = await supabase
    .from('manual_iccids')
    .select('iccid', { count: 'exact', head: true })
    .eq('plan_unused', true)
    .not('expiration_date', 'is', null)
    .gte('expiration_date', todayStr)
    .lte('expiration_date', `${in7Str} 23:59:59`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ count: count || 0, from: todayStr, to: in7Str })
}
