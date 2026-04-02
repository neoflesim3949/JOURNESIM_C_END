import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// GET — 取得所有匯率
export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase.from('exchange_rates').select('*').order('currency')

  return NextResponse.json(data || [])
}

// POST — 設定匯率
export async function POST(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { currency, rate } = await request.json()

  if (!currency || !rate || rate <= 0) {
    return NextResponse.json({ error: '請輸入有效的匯率' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase.from('exchange_rates').upsert({
    currency: currency.toUpperCase(),
    rate,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'currency' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
