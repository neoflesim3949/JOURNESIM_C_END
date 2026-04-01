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
    .select('id, last_four, bin_code, card_type, issuer, is_default, created_at')
    .eq('member_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}
