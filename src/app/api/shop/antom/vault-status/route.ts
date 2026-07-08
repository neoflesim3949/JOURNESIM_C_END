import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET ?rid=<vaultingRequestId> — 查綁卡結果（供結帳「綁卡→扣款」輪詢）
// 回 { status: pending|success|fail, card_id }
export async function GET(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const rid = new URL(request.url).searchParams.get('rid') || ''
  if (!rid) return NextResponse.json({ error: '缺少 vaultingRequestId' }, { status: 400 })

  const supabase = createAdminClient()
  const { data } = await supabase.from('antom_vaulting_requests')
    .select('status, card_id, member_id').eq('vaulting_request_id', rid).single()
  if (!data || data.member_id !== user.id) return NextResponse.json({ status: 'pending', card_id: null })
  return NextResponse.json({ status: data.status, card_id: data.card_id })
}
