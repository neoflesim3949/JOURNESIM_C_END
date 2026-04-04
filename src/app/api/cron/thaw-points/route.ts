import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 點數解凍排程
 * 每天運行一次，將已過鎖定期(available_at)的點數轉為可用
 */
export async function GET(request: Request) {
  // 可以增加密鑰驗證，防止外部調用
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  if (key !== process.env.CRON_KEY && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // 1. 找出所有待解凍的 Pending 點數
  const { data: logs } = await supabase
    .from('point_logs')
    .select('*')
    .eq('status', 'pending')
    .lte('available_at', now)

  if (!logs || logs.length === 0) {
    return NextResponse.json({ message: '無待處理點數' })
  }

  const results = []
  
  // 2. 逐筆處理 (這裡用個簡單的 loop，實際生產環境建議用 RPC 交易)
  for (const log of logs) {
    try {
      // 更新記錄狀態
      await supabase.from('point_logs').update({ status: 'confirmed' }).eq('id', log.id)
      
      // 更新用戶餘額
      const { data: member } = await supabase.from('members').select('points').eq('id', log.member_id).single()
      if (member) {
        await supabase.from('members').update({ 
          points: (Number(member.points) || 0) + Number(log.amount) 
        }).eq('id', log.member_id)
      }
      
      results.push({ id: log.id, success: true })
    } catch (err) {
      console.error('解凍點數失敗:', log.id, err)
      results.push({ id: log.id, success: false })
    }
  }

  return NextResponse.json({ 
    processed_count: logs.length,
    results 
  })
}
