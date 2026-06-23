import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'


// PATCH — 批量更新售價 或 方案名稱/排序
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createAdminClient()

  // 更新售價
  if (body.updates) {
    const updates = body.updates as { id: string; sell_price?: number; ref_price?: number | null }[]
    for (const u of updates) {
      const upd: Record<string, unknown> = {}
      if (u.sell_price !== undefined) { upd.sell_price = u.sell_price; upd.price_changed = false }
      if (u.ref_price !== undefined) upd.ref_price = (u.ref_price === null || Number.isNaN(u.ref_price)) ? null : u.ref_price
      if (Object.keys(upd).length) await supabase.from('package_plan_prices').update(upd).eq('id', u.id)
    }
    return NextResponse.json({ ok: true, updated: updates.length })
  }

  // 更新方案名稱/排序
  if (body.plan_updates) {
    const planUpdates = body.plan_updates as { id: string; display_name?: string; sort_order?: number; is_unlimited?: boolean; bc_name_snapshot?: string }[]
    for (const u of planUpdates) {
      const upd: Record<string, unknown> = {}
      if (u.display_name !== undefined) upd.display_name = u.display_name || null
      if (u.sort_order !== undefined) upd.sort_order = u.sort_order
      if (u.is_unlimited !== undefined) upd.is_unlimited = !!u.is_unlimited
      if (u.bc_name_snapshot !== undefined) upd.bc_name_snapshot = u.bc_name_snapshot || null
      if (Object.keys(upd).length) await supabase.from('package_plans').update(upd).eq('id', u.id)
    }
    return NextResponse.json({ ok: true, updated: planUpdates.length })
  }

  return NextResponse.json({ error: '缺少 updates 或 plan_updates' }, { status: 400 })
}

// DELETE — 移除套餐中的 BC 商品
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan_id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('package_plans').delete().eq('id', plan_id)
  return NextResponse.json({ ok: true })
}
