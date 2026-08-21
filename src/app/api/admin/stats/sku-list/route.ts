import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 方案列表：把「方案統計明細列表」用到的所有 SKU 拉出來，檢核有無沒對到 bc_products 的，並可標註「吃到飽」
// GET  ?search=&only=missing|unlimited|untagged
// PATCH { sku_id, is_unlimited, sku_name? }
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const search = (sp.get('search') || '').trim().toLowerCase()
  const only = sp.get('only') || ''
  const supabase = createAdminClient()

  // card_plans 依 sku 彙總
  const agg = new Map<string, { name: string; plans: number; cards: Set<string>; planType: string | null }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans').select('sku_id, sku_name, iccid, plan_type').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      const id = p.sku_id || p.sku_name || '未知'
      let a = agg.get(id)
      if (!a) { a = { name: p.sku_name || id, plans: 0, cards: new Set(), planType: p.plan_type }; agg.set(id, a) }
      a.plans++; if (p.iccid) a.cards.add(p.iccid); if (p.plan_type != null) a.planType = p.plan_type
    }
    if (data.length < 1000) break
  }

  // bc_products（有對照＝有被拉過來）
  const inBc = new Map<string, { plan_type: string | null; name: string }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_products').select('sku_id, name, plan_type').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) inBc.set(r.sku_id, { plan_type: r.plan_type, name: r.name })
    if (data.length < 1000) break
  }

  // sku_meta（吃到飽標註）
  const meta = new Map<string, boolean>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('sku_meta').select('sku_id, is_unlimited').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) meta.set(r.sku_id, !!r.is_unlimited)
    if (data.length < 1000) break
  }

  const PLAN_TYPE: Record<string, string> = { '0': '總量型', '1': '單日型' }
  let rows = [...agg].map(([sku_id, a]) => {
    const bc = inBc.get(sku_id)
    const pt = a.planType ?? bc?.plan_type ?? null
    return {
      sku_id, sku_name: a.name, plans: a.plans, cards: a.cards.size,
      plan_type: pt, plan_type_label: pt != null ? (PLAN_TYPE[pt] || pt) : null,
      in_bc: !!bc,
      is_unlimited: meta.has(sku_id) ? meta.get(sku_id)! : false,
      tagged: meta.has(sku_id),
      name_hint_unlimited: /无限|無限|吃到饱|吃到飽|unlimited/i.test(a.name),   // 名稱疑似吃到飽
    }
  }).sort((x, y) => y.plans - x.plans)

  const totalSkus = rows.length
  const missingInBc = rows.filter(r => !r.in_bc).length
  const unlimitedCount = rows.filter(r => r.is_unlimited).length
  if (search) rows = rows.filter(r => r.sku_name.toLowerCase().includes(search) || r.sku_id.toLowerCase().includes(search))
  if (only === 'missing') rows = rows.filter(r => !r.in_bc)
  else if (only === 'unlimited') rows = rows.filter(r => r.is_unlimited)
  else if (only === 'untagged') rows = rows.filter(r => !r.tagged)

  return NextResponse.json({ rows, total_skus: totalSkus, missing_in_bc: missingInBc, unlimited_count: unlimitedCount })
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { sku_id?: string; sku_name?: string; is_unlimited?: boolean }
  if (!body.sku_id) return NextResponse.json({ error: '缺少 sku_id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('sku_meta').upsert({
    sku_id: body.sku_id, sku_name: body.sku_name ?? null, is_unlimited: !!body.is_unlimited, updated_at: new Date().toISOString(),
  }, { onConflict: 'sku_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
