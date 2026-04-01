import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('payments')
    .select('raw_response, tappay_trade_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(3)

  return NextResponse.json(data || [])
}
