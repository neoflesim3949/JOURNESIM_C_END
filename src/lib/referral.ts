import { SupabaseClient } from '@supabase/supabase-js'

/**
 * 綁定推薦人邏輯 (永久綁定)
 */
export async function bindReferrer(supabase: SupabaseClient, userId: string, referralCode: string) {
  if (!referralCode) return { success: false, error: '缺少推薦碼' }

  const { data: member } = await supabase.from('members').select('id, referrer_id').eq('id', userId).single()
  if (!member) return { success: false, error: '用戶不存在' }
  if (member.referrer_id) return { success: false, error: '用戶已綁定過推薦人' }

  const { data: l1Referrer } = await supabase.from('members').select('id, referrer_id').eq('referral_code', referralCode).single()
  if (!l1Referrer) return { success: false, error: '無效的推薦碼' }
  if (l1Referrer.id === userId) return { success: false, error: '不能推薦自己' }

  await supabase.from('members').update({ referrer_id: l1Referrer.id }).eq('id', userId)
  
  await supabase.from('referral_logs').upsert({
    user_id: userId,
    l1_referrer_id: l1Referrer.id,
    l2_referrer_id: l1Referrer.referrer_id || null,
  }, { onConflict: 'user_id' })

  // 發放註冊禮 F Point (50 點)
  await supabase.from('point_logs').insert({
    member_id: userId,
    amount: 50,
    point_type: 'signup',
    status: 'confirmed',
    available_at: new Date().toISOString()
  })

  return { success: true }
}

/**
 * 級差獎金計算邏輯 (Differential Logic)
 * 當訂單 Completed 時，根據鏈條發放分潤
 */
export async function calculateOrderRewards(supabase: SupabaseClient, orderId: string) {
  // 1. 取得訂單與會員資料
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (!order || order.status !== 'completed') return { success: false, error: '訂單未完成' }

  // 2. 獲取所有等級配置
  const { data: tiers } = await supabase.from('member_tiers').select('*').order('sort_order', { ascending: true })
  const tierMap = new Map((tiers || []).map(t => [t.id, t]))
  
  // 3. 獲取系統基礎設定 (如鎖定期)
  const { data: settings } = await supabase.from('system_settings').select('key, value')
  const settingMap = new Map((settings || []).map(s => [s.key, Number(s.value)]))
  const lockDays = settingMap.get('referral_lock_days') || 14
  const availableAt = new Date()
  availableAt.setDate(availableAt.getDate() + lockDays)

  // 4. 計算分潤鏈 (Ancestors Chain)
  // 獲取購買者的直接上級
  const chain: any[] = []
  let currentId = order.member_id
  
  // 獲取購買者的資訊（決定是否首購）
  const { count: previousOrders } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('member_id', order.member_id).eq('status', 'completed')
  const isFirstBuy = (previousOrders || 0) <= 1

  // 追溯上級 (最多往上追 10 級以防死循環)
  for (let i = 0; i < 10; i++) {
    const { data: member } = await supabase.from('members').select('id, referrer_id, tier_id').eq('id', currentId).single()
    if (!member || !member.referrer_id) break
    const { data: parent } = await supabase.from('members').select('id, referrer_id, tier_id').eq('id', member.referrer_id).single()
    if (!parent) break
    chain.push(parent)
    currentId = parent.id
  }

  const rewards: any[] = []

  // 🧪 級差計算規則：
  // L1 總支出上限 6% (最高等級)，L2 總支出上限 3% (最高等級)
  let paidL1Rate = 0
  let paidL2Rate = 0

  // 鏈條： purchaser -> chain[0](Parent) -> chain[1](Grandparent) -> ...
  for (let level = 0; level < chain.length; level++) {
    const member = chain[level]
    const tier = tierMap.get(member.tier_id)
    if (!tier) continue

    // 🏆 一級獎金 (直接或差額遞補)
    if (paidL1Rate < 0.06) {
      const currentRate = Number(tier.l1_rate) || 0
      const diff = Math.max(0, currentRate - paidL1Rate)
      if (diff > 0) {
        rewards.push({
          member_id: member.id,
          source_order_id: orderId,
          amount: Math.floor(order.total_amount * diff),
          point_type: level === 0 ? 'l1_commission' : 'l1_commission_diff', // 標註是首層還是級差
          status: 'pending',
          available_at: availableAt.toISOString()
        })
        paidL1Rate = currentRate
      }
    }

    // 🏆 二級獎金 (從 Grandparent 開始計算，支援級差)
    if (level >= 1 && paidL2Rate < 0.03) {
      const currentRate = Number(tier.l2_rate) || 0
      const diff = Math.max(0, currentRate - paidL2Rate)
      if (diff > 0) {
        rewards.push({
          member_id: member.id,
          source_order_id: orderId,
          amount: Math.floor(order.total_amount * diff),
          point_type: level === 1 ? 'l2_commission' : 'l2_commission_diff',
          status: 'pending',
          available_at: availableAt.toISOString()
        })
        paidL2Rate = currentRate
      }
    }

    // 🏆 首購加碼 (僅限直接推薦人 L1)
    if (level === 0 && isFirstBuy) {
        const bonus = settingMap.get('referral_l1_bonus') || 50
        if (bonus > 0) {
            rewards.push({
                member_id: member.id,
                source_order_id: orderId,
                amount: bonus,
                point_type: 'first_buy',
                status: 'pending',
                available_at: availableAt.toISOString()
            })
        }
    }
  }

  if (rewards.length > 0) {
    await supabase.from('point_logs').insert(rewards)
  }

  return { success: true }
}

/**
 * 追回點數 (Clawback Logic)
 */
export async function reverseRewards(supabase: SupabaseClient, orderId: string) {
  const { data: logs } = await supabase.from('point_logs').select('*').eq('source_order_id', orderId).neq('status', 'void')
  if (!logs || logs.length === 0) return { success: true }

  for (const log of logs) {
    await supabase.from('point_logs').insert({
      member_id: log.member_id,
      source_order_id: orderId,
      amount: -log.amount,
      point_type: 'clawback',
      status: 'confirmed',
      available_at: new Date().toISOString()
    })
    await supabase.from('point_logs').update({ status: 'void' }).eq('id', log.id)
    
    // 扣除份數
    const { data: member } = await supabase.from('members').select('points').eq('id', log.member_id).single()
    if (member) {
      await supabase.from('members').update({ points: Number(member.points) - Number(log.amount) }).eq('id', log.member_id)
    }
  }
  return { success: true }
}

export function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 移除容易混淆的字元
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
