import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const [{ data: countries }, { data: products }] = await Promise.all([
    supabase.from('bc_countries').select('*').order('name'),
    supabase.from('bc_products').select('id, sku_id, name, type, sales_method, days, capacity, plan_type, created_at').order('name'),
  ])

  return NextResponse.json({
    countries: countries || [],
    products: products || [],
  })
}
