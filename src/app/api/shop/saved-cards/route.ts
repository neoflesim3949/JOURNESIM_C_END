import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) return NextResponse.json([])

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('member_cards')
    .select('id, last_four, bin_code, card_type, issuer, is_default, provider, exp_month, exp_year, created_at')
    .eq('member_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function DELETE(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { id } = await request.json()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('member_cards')
    .delete()
    .eq('id', id)
    .eq('member_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
