import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('bc_countries')
    .select('mcc, name, continent, flag_url')
    .order('name')

  return NextResponse.json(data || [])
}
