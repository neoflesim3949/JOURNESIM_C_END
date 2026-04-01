import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase.from('system_settings').select('*').order('key')

  return NextResponse.json(data || [])
}

export async function PATCH(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { updates } = await request.json() as { updates: { key: string; value: string }[] }
  const supabase = createAdminClient()

  for (const u of updates) {
    await supabase
      .from('system_settings')
      .update({ value: u.value, updated_at: new Date().toISOString() })
      .eq('key', u.key)
  }

  return NextResponse.json({ ok: true })
}
