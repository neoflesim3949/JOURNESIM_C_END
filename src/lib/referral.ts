import { SupabaseClient } from '@supabase/supabase-js'

/**
 * 綁定推薦人邏輯
 * 規則：僅限新用戶（無訂單紀錄），且驗證推薦碼有效
 */
export async function bindReferrer(
  supabase: SupabaseClient,
  userId: string,
  referralCode: string
) {
  if (!referralCode) return { success: false, error: '缺少推薦碼' }

  // 1. 檢查用戶是否已有推薦人
  const { data: member } = await supabase
    .from('members')
    .select('id, referrer_id')
    .eq('id', userId)
    .single()

  if (!member) return { success: false, error: '用戶不存在' }
  if (member.referrer_id) return { success: false, error: '用戶已綁定過推薦人' }

  // 2. 搜尋推薦人 (L1)
  const { data: l1Referrer } = await supabase
    .from('members')
    .select('id, referrer_id')
    .eq('referral_code', referralCode)
    .single()

  if (!l1Referrer) return { success: false, error: '無效的推薦碼' }
  if (l1Referrer.id === userId) return { success: false, error: '不能推薦自己' }

  // 3. 獲取 L2 推薦人 (推薦人的推薦人)
  const l2ReferrerId = l1Referrer.referrer_id

  // 4. 更新用戶的基礎推薦資訊
  await supabase
    .from('members')
    .update({ referrer_id: l1Referrer.id })
    .eq('id', userId)

  // 5. 寫入 Referral_Log 建立永久兩級關係
  const { error: logError } = await supabase
    .from('referral_logs')
    .upsert({
      user_id: userId,
      l1_referrer_id: l1Referrer.id,
      l2_referrer_id: l2ReferrerId || null,
    }, { onConflict: 'user_id' })

  if (logError) return { success: false, error: logError.message }

  // 6. 發放註冊禮 (例如 $50 優惠券 - 這裡暫時以 Logs 紀錄或未來對接優惠券系統)
  // 點數發放
  await supabase.from('point_logs').insert({
    member_id: userId,
    amount: 50,
    point_type: 'signup',
    status: 'confirmed', // 註冊禮直接生效
    available_at: new Date().toISOString()
  })

  return { success: true }
}

/**
 * 計算與分發點數獎勵
 * 觸發時機：訂單狀態轉為 Completed
 */
export async function calculateOrderRewards(
  supabase: SupabaseClient,
  orderId: string
) {
  // 1. 獲取推薦配置 (從 system_settings 讀取)
  const { data: settings } = await supabase.from('system_settings').select('key, value')
  const settingMap = new Map((settings || []).map(s => [s.key, Number(s.value)]))
  
  const l1Percent = settingMap.get('referral_l1_percent') || 0.05
  const l2Percent = settingMap.get('referral_l2_percent') || 0.02
  const l1FirstBuyBonus = settingMap.get('referral_l1_bonus') || 50
  const minSpend = settingMap.get('referral_min_spend') || 100
  const lockDays = settingMap.get('referral_lock_days') || 14

  // 2. 獲取訂單詳情
  const { data: order } = await supabase
    .from('orders')
    .select('id, member_id, total_amount, status, created_at')
    .eq('id', orderId)
    .single()

  if (!order || order.status !== 'completed') return { success: false, error: '訂單未完成' }

  // 3. 獲取推薦關係
  const { data: refLog } = await supabase
    .from('referral_logs')
    .select('*')
    .eq('user_id', order.member_id)
    .single()

  if (!refLog) return { success: true, message: '無推薦關係' }

  const rewards = []
  const availableAt = new Date()
  availableAt.setDate(availableAt.getDate() + lockDays)

  const { count: previousOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', order.member_id)
    .eq('status', 'completed')
  
  const isFirstBuy = (previousOrders || 0) <= 1 // 本次是第一筆 Completed

  // 4. L1 獎勵計算
  if (refLog.l1_referrer_id) {
    // 首購加碼點數 (需滿門檻)
    if (isFirstBuy && order.total_amount >= minSpend) {
      rewards.push({
        member_id: refLog.l1_referrer_id,
        source_order_id: orderId,
        amount: l1FirstBuyBonus,
        point_type: 'first_buy',
        status: 'pending',
        available_at: availableAt.toISOString()
      })
    }
    // 5% 分潤
    const l1Comm = Math.floor(order.total_amount * l1Percent)
    if (l1Comm > 0) {
      rewards.push({
        member_id: refLog.l1_referrer_id,
        source_order_id: orderId,
        amount: l1Comm,
        point_type: 'l1_commission',
        status: 'pending',
        available_at: availableAt.toISOString()
      })
    }
  }

  // 5. L2 獎勵計算 (2% 分潤)
  if (refLog.l2_referrer_id) {
    const l2Comm = Math.floor(order.total_amount * l2Percent)
    if (l2Comm > 0) {
      rewards.push({
        member_id: refLog.l2_referrer_id,
        source_order_id: orderId,
        amount: l2Comm,
        point_type: 'l2_commission',
        status: 'pending',
        available_at: availableAt.toISOString()
      })
    }
  }

  if (rewards.length > 0) {
    const { error } = await supabase.from('point_logs').insert(rewards)
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * 追回點數 (Refund Clawback)
 * 觸發條件：訂單退款 (Refunded)
 */
export async function reverseRewards(
  supabase: SupabaseClient,
  orderId: string
) {
  // 1. 找出所有與此訂單相關的 Pending 或 Confirmed 點數
  const { data: logs } = await supabase
    .from('point_logs')
    .select('*')
    .eq('source_order_id', orderId)
    .neq('status', 'void')

  if (!logs || logs.length === 0) return { success: true }

  for (const log of logs) {
    // 建立一筆負向的 Clawback 記錄
    await supabase.from('point_logs').insert({
      member_id: log.member_id,
      source_order_id: orderId,
      amount: -log.amount,
      point_type: 'clawback',
      status: 'confirmed', // 扣除立即生效
      available_at: new Date().toISOString()
    })

    // 更新原始記錄狀態為已作廢
    await supabase.from('point_logs').update({ status: 'void' }).eq('id', log.id)

    // TODO: 如果已轉為可用 (Confirmed)，需要同步扣除 members.points 餘額 (或依賴 Cron 累加)
    // 這裡我們採用「即時扣除」策略
    const { data: member } = await supabase.from('members').select('points').eq('id', log.member_id).single()
    if (member) {
      await supabase.from('members').update({ points: member.points - log.amount }).eq('id', log.member_id)
    }
  }

  return { success: true }
}

/**
 * 生成隨機推薦碼
 */
export function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
