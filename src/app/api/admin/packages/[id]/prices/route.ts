import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// PATCH — 批量更新 copies 售價
export async function PATCH(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { updates } = await request.json() as { updates: { id: string; sell_price: number }[] }
  const supabase = createAdminClient()

  for (const u of updates) {
    await supabase.from('package_plan_prices').update({ sell_price: u.sell_price }).eq('id', u.id)
  }

  return NextResponse.json({ ok: true, updated: updates.length })
}

// DELETE — 移除套餐中的 BC 商品
export async function DELETE(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan_id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('package_plans').delete().eq('id', plan_id)
  return NextResponse.json({ ok: true })
}
