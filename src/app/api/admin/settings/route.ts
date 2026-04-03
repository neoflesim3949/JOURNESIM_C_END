import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'


export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase.from('system_settings').select('*').order('key')

  return NextResponse.json(data || [])
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { updates } = await request.json() as { updates: { key: string; value: string }[] }
  const supabase = createAdminClient()

  for (const u of updates) {
    await supabase
      .from('system_settings')
      .upsert({
        key: u.key,
        value: u.value,
        description: '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
  }

  return NextResponse.json({ ok: true })
}
