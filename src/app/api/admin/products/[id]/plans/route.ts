import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  return token === process.env.ADMIN_PASSWORD
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  if (body.type === 'daily') {
    const { error } = await supabase.from('daily_plans').insert({
      product_id: id,
      speed_label: body.speed_label,
      daily_capacity_mb: body.daily_capacity_mb,
      price_per_day: body.price_per_day,
      bc_sku_id: body.bc_sku_id,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.type === 'fixed') {
    const { error } = await supabase.from('fixed_plans').insert({
      product_id: id,
      label: body.label,
      capacity_gb: body.capacity_gb,
      days: body.days,
      price: body.price,
      bc_sku_id: body.bc_sku_id,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: Request,
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createAdminClient()

  const table = body.type === 'daily' ? 'daily_plans' : 'fixed_plans'
  const { error } = await supabase.from(table).delete().eq('id', body.plan_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
