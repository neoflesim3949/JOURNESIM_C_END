import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 獲取當前用戶的推薦與點數資訊
 */
export async function GET() {
  const supabaseServer = await createClient()
  const { data: { user } } = await supabaseServer.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // 1. 獲取用戶基础資料 (點數, 推薦碼)
  const { data: member } = await supabase
    .from('members')
    .select('id, email, points, referral_code, referrer_id')
    .eq('id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Member profile not found' }, { status: 404 })

  // 2. 獲取推薦統計 (總人數)
  const { count: referralCount } = await supabase
    .from('referral_logs')
    .select('id', { count: 'exact', head: true })
    .eq('l1_referrer_id', user.id)

  // 3. 獲取點數日誌 (最新 50 筆)
  const { data: logs } = await supabase
    .from('point_logs')
    .select('*')
    .eq('member_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    member,
    referral_count: referralCount || 0,
    point_logs: logs || [],
  })
}
