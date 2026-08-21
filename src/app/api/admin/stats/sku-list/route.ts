import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 方案列表：把「方案統計明細列表」用到的所有 SKU 拉出來，檢核有無沒對到 bc_products 的、標註「吃到飽」，
//   並可把同系列 SKU 手動分為一組、指定該組「1GB 基礎方案」（供成本重算）。
// GET  ?search=&only=missing|unlimited|untagged|grouped|ungrouped
// PATCH { sku_id, is_unlimited, sku_name? }                          — 單筆標吃到飽
//   or  { group: { family_id, members:[sku_id], base_sku_id, names?:{sku_id:name} } }  — 整組儲存＋指定基礎

// 品名解析每日GB（含「每日高速1GB」）
function parseDailyGB(name: string): number | null {
  const m = (name || '').match(/每日\s*(?:高速)?\s*([\d.]+)\s*(GB|MB|G|M)/i)
  if (!m) return null
  const v = parseFloat(m[1]); if (isNaN(v)) return null
  return m[2].toUpperCase().startsWith('G') ? v : v / 1000
}
// 自動群組建議鍵：抹掉每日GB、統一大小寫、去掉常見尾綴（-TW专用/-RNR/-专用）
function autoFamily(name: string): string {
  let s = (name || '').replace(/每日\s*(?:高速)?\s*[\d.]+\s*(GB|MB|G|M)/i, '每日◆')
  s = s.toLowerCase().replace(/-tw专用|-tw專用|-rnr|-专用|-專用/g, '')
  return s.replace(/-{2,}/g, '-').replace(/-$/,'').trim()
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const supabase = createAdminClient()

  // 加速包選項（供人工挑選）：F056 同步下來的 accel_prices，可用關鍵字篩
  if (sp.get('accel_options')) {
    const q = (sp.get('q') || '').trim()
    let query = supabase.from('accel_prices').select('sku_id, name, accelerate_price, high_flow_size').not('accelerate_price', 'is', null).order('name').limit(80)
    if (q) query = query.ilike('name', `%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message, options: [] })
    return NextResponse.json({ options: data || [] })
  }

  const search = (sp.get('search') || '').trim().toLowerCase()
  const only = sp.get('only') || ''
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  // card_plans 依 sku 彙總
  const agg = new Map<string, { name: string; plans: number; cards: Set<string>; planType: string | null }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans').select('sku_id, sku_name, iccid, plan_type').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      if (p.iccid && legacy.has(p.iccid)) continue        // 排除舊SIMPOMATION卡
      const id = p.sku_id || p.sku_name || '未知'
      let a = agg.get(id)
      if (!a) { a = { name: p.sku_name || id, plans: 0, cards: new Set(), planType: p.plan_type }; agg.set(id, a) }
      a.plans++; if (p.iccid) a.cards.add(p.iccid); if (p.plan_type != null) a.planType = p.plan_type
    }
    if (data.length < 1000) break
  }

  // bc_products（有對照＝有被拉過來），優先用 bc_products 名稱
  const inBc = new Map<string, { plan_type: string | null; name: string }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_products').select('sku_id, name, plan_type').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) inBc.set(r.sku_id, { plan_type: r.plan_type, name: r.name })
    if (data.length < 1000) break
  }

  // sku_meta（吃到飽標註＋分組＋加速包選定）；欄位缺（093/095 未跑）時自動降級，避免整頁歸零
  const meta = new Map<string, { is_unlimited: boolean; family_id: string | null; is_base: boolean; accel_sku_id: string | null }>()
  let cols = 'sku_id, is_unlimited, family_id, is_base, accel_sku_id'
  if ((await supabase.from('sku_meta').select(cols).limit(1)).error) cols = 'sku_id, is_unlimited, family_id, is_base'
  if ((await supabase.from('sku_meta').select(cols).limit(1)).error) cols = 'sku_id, is_unlimited'
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('sku_meta').select(cols).range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data as unknown as Record<string, unknown>[]) {
      meta.set(r.sku_id as string, { is_unlimited: !!r.is_unlimited, family_id: (r.family_id as string) || null, is_base: !!r.is_base, accel_sku_id: (r.accel_sku_id as string) || null })
    }
    if (data.length < 1000) break
  }

  // accel_prices（供顯示已選加速包的名稱/報價）
  const accelMap = new Map<string, { name: string; price: number }>()
  for (let f = 0; ; f += 1000) {
    const { data, error } = await supabase.from('accel_prices').select('sku_id, name, accelerate_price').range(f, f + 999)
    if (error || !data || data.length === 0) break
    for (const r of data) accelMap.set(r.sku_id as string, { name: (r.name as string) || '', price: Number(r.accelerate_price) })
    if (data.length < 1000) break
  }

  const PLAN_TYPE: Record<string, string> = { '0': '總量型', '1': '單日型' }
  let rows = [...agg].map(([sku_id, a]) => {
    const bc = inBc.get(sku_id)
    const nm = bc?.name || a.name
    const pt = a.planType ?? bc?.plan_type ?? null
    const m = meta.get(sku_id)
    const auto = autoFamily(nm)
    const accelSku = m?.accel_sku_id ?? null
    const accel = accelSku ? accelMap.get(accelSku) : undefined
    return {
      sku_id, sku_name: nm, plans: a.plans, cards: a.cards.size,
      plan_type: pt, plan_type_label: pt != null ? (PLAN_TYPE[pt] || pt) : null,
      in_bc: !!bc,
      is_unlimited: m?.is_unlimited ?? false,
      tagged: !!m,
      name_hint_unlimited: /无限|無限|吃到饱|吃到飽|unlimited/i.test(nm),
      daily_gb: parseDailyGB(nm),
      family_id: m?.family_id ?? null,          // 已存的手動分組
      family_auto: auto,                        // 自動建議鍵
      family_eff: m?.family_id ?? auto,         // 有效分組（手動優先）
      is_base: m?.is_base ?? false,
      accel_sku_id: accelSku,                   // 人工選定的加速包 sku
      accel_name: accel?.name ?? null,
      accel_price: accel?.price ?? null,
    }
  }).sort((x, y) => y.plans - x.plans)

  const totalSkus = rows.length
  const missingInBc = rows.filter(r => !r.in_bc).length
  const unlimitedCount = rows.filter(r => r.is_unlimited).length
  if (search) rows = rows.filter(r => r.sku_name.toLowerCase().includes(search) || r.sku_id.toLowerCase().includes(search))
  if (only === 'missing') rows = rows.filter(r => !r.in_bc)
  else if (only === 'unlimited') rows = rows.filter(r => r.is_unlimited)
  else if (only === 'untagged') rows = rows.filter(r => !r.tagged)
  else if (only === 'grouped') rows = rows.filter(r => !!r.family_id)
  else if (only === 'ungrouped') rows = rows.filter(r => !r.family_id && !r.is_unlimited)

  return NextResponse.json({ rows, total_skus: totalSkus, missing_in_bc: missingInBc, unlimited_count: unlimitedCount })
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as {
    sku_id?: string; sku_name?: string; is_unlimited?: boolean
    group?: { family_id: string; members: string[]; base_sku_id?: string | null; names?: Record<string, string> }
    assign?: { sku_id: string; family_id: string; is_base?: boolean; sku_name?: string | null }[]
    accel?: { sku_id: string; accel_sku_id: string | null; sku_name?: string | null }
  }
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // 為某基礎方案人工選定加速包 SKU（accel_sku_id 空＝清除）
  if (body.accel) {
    if (!body.accel.sku_id) return NextResponse.json({ error: '缺少 sku_id' }, { status: 400 })
    const { error } = await supabase.from('sku_meta').upsert({
      sku_id: body.accel.sku_id, sku_name: body.accel.sku_name ?? null,
      accel_sku_id: body.accel.accel_sku_id || null, updated_at: now,
    }, { onConflict: 'sku_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 逐列指派：每個 SKU 各自的 family_id / is_base（family_id 空＝清除分組）
  if (body.assign) {
    const rows = body.assign.filter(a => a.sku_id)
    if (rows.length === 0) return NextResponse.json({ error: '缺少 assign 資料' }, { status: 400 })
    const payload = rows.map(a => {
      const fid = (a.family_id || '').trim()
      return { sku_id: a.sku_id, sku_name: a.sku_name ?? null, family_id: fid || null, is_base: fid ? !!a.is_base : false, updated_at: now }
    })
    const { error } = await supabase.from('sku_meta').upsert(payload, { onConflict: 'sku_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: payload.length })
  }

  // 整組儲存：把 members 的 family_id 設為同值、指定 base
  if (body.group) {
    const g = body.group
    if (!g.family_id || !Array.isArray(g.members) || g.members.length === 0) return NextResponse.json({ error: '缺少 family_id 或 members' }, { status: 400 })
    const payload = g.members.map(sku => ({
      sku_id: sku, sku_name: g.names?.[sku] ?? null,
      family_id: g.family_id, is_base: sku === g.base_sku_id, updated_at: now,
    }))
    const { error } = await supabase.from('sku_meta').upsert(payload, { onConflict: 'sku_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: payload.length })
  }

  // 單筆吃到飽標註
  if (!body.sku_id) return NextResponse.json({ error: '缺少 sku_id' }, { status: 400 })
  const { error } = await supabase.from('sku_meta').upsert({
    sku_id: body.sku_id, sku_name: body.sku_name ?? null, is_unlimited: !!body.is_unlimited, updated_at: now,
  }, { onConflict: 'sku_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
