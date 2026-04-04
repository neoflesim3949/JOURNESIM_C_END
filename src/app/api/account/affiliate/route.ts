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

  // 1. 獲取用戶基础資料 (點數, 推薦碼, 等級)
  let { data: member } = await supabase
    .from('members')
    .select(`
      id, email, points, referral_code, referrer_id, tier_id,
      member_tiers(name, l1_rate, l2_rate)
    `)
    .eq('id', user.id)
    .single()

  // 🛠️ 自動修復邏輯：如果沒有會員資料或推薦碼，自動建立
  if (!member || !member.referral_code) {
    const { generateReferralCode } = require('@/lib/referral')
    const { data: silverTier } = await supabase.from('member_tiers').select('id').eq('name', '白銀會員').single()
    
    const newCode = generateReferralCode()
    const { data: updated } = await supabase.from('members').upsert({
      id: user.id,
      email: user.email,
      referral_code: newCode,
      tier_id: silverTier?.id || null,
      points: member?.points || 0
    }).select().single()
    
    // 重新抓取包含關聯表的資料
    const { data: refetched } = await supabase
        .from('members')
        .select('id, email, points, referral_code, referrer_id, tier_id, member_tiers(name, l1_rate, l2_rate)')
        .eq('id', user.id)
        .single()
    member = refetched
  }

  if (!member) return NextResponse.json({ error: 'Member profile failed to initialize' }, { status: 500 })

  // 2. 獲取推薦統計與好友名單
  const { data: friends, count: referralCount } = await supabase
    .from('members')
    .select('email, created_at', { count: 'exact' })
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false })

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
    friends: friends || [],
    point_logs: logs || [],
  })
}
