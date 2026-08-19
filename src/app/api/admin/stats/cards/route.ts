import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCardPlanDetails } from '@/lib/card-plan-detail-sync'

// 統計明細列表：一張卡 × 一方案（card_plans）一列，全平台彙整
// 主體 card_plans（F012 同步）；補：卡狀態(manual_iccids)、成本/蝦皮訂單(shopee_order_items)、售後(bc_aftersales)、安裝(rsp_requests)
export const maxDuration = 300

// POST — 手動觸發方案同步（F012 → card_plans）。候選判斷用 card_plans 自己的資料（synced_at + card_status 快照），
// 完全不看 manual_iccids 的 plan 欄位，與卡片管理互不干擾：
//   規則1（首次一定撈）：card_plans 沒任何紀錄的卡（含無方案的庫存號段，會一直被視為待撈——可接受）
//   規則2（兩者都終態才停）：撈過的卡，只有「快照卡狀態終態(2/3/4/5) AND 無活方案(0/1)」才跳過
//   規則3（久未同步）：撈過的卡要隔 12 小時才再撈
//   規則4：每次限量
const TERMINAL_CARD = new Set(['2', '3', '4', '5'])
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const limit = Math.min(500, Number(body.limit) || 300)
  const supabase = createAdminClient()
  const staleMs = Date.now() - 12 * 3600 * 1000

  // 從 card_plans 聚合每卡狀態（統計自己這份快照）：最新同步時間、是否有活方案、卡狀態快照
  const state = new Map<string, { syncedMs: number; planActive: boolean; cardStatus: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('card_plans').select('iccid, plan_status, card_status, synced_at').range(from, from + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      const cur = state.get(p.iccid) || { syncedMs: 0, planActive: false, cardStatus: null }
      const ms = p.synced_at ? new Date(p.synced_at).getTime() : 0
      if (ms >= cur.syncedMs) { cur.syncedMs = ms; cur.cardStatus = p.card_status }  // 取最新一筆的卡狀態快照
      if (p.plan_status === '0' || p.plan_status === '1') cur.planActive = true
      state.set(p.iccid, cur)
    }
    if (data.length < 1000) break
  }

  // 掃 manual_iccids 母體挑候選：優先「從沒撈過」，再「久未同步且未兩者終態」
  const firstPull: string[] = []
  const restale: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('manual_iccids').select('iccid').range(from, from + 999)
    if (!data || data.length === 0) break
    for (const m of data) {
      const st = state.get(m.iccid)
      if (!st) { if (firstPull.length < limit) firstPull.push(m.iccid); continue }
      if (st.syncedMs >= staleMs) continue                                    // 12h 內不重撈
      const bothTerminal = TERMINAL_CARD.has(st.cardStatus || '') && !st.planActive
      if (!bothTerminal) restale.push(m.iccid)
    }
    if (data.length < 1000) break
    if (firstPull.length >= limit) break
  }
  const iccids = [...firstPull, ...restale].slice(0, limit)
  if (iccids.length === 0) return NextResponse.json({ ok: true, picked: 0, cards: 0, plans: 0, note: '目前沒有待同步的卡' })
  const res = await syncCardPlanDetails(supabase, iccids)
  return NextResponse.json({ ok: true, picked: iccids.length, ...res })
}

interface EnrichMaps {
  refundedIccids: Set<string>
  installByIccid: Map<string, string>
}

// 小表集合（售後/安裝）— 供 SQL 篩選與當頁 enrich，資料量小（不隨 card_plans 成長）
async function loadSmallSets(supabase: ReturnType<typeof createAdminClient>): Promise<EnrichMaps> {
  const refundedIccids = new Set<string>()
  {
    const { data } = await supabase.from('bc_aftersales').select('iccids, status').or('status.is.null,status.not.in.(cancelled,reordered)')
    for (const r of data || []) for (const ic of (Array.isArray(r.iccids) ? r.iccids as string[] : [])) refundedIccids.add(ic)
  }
  const installByIccid = new Map<string, string>()
  {
    const { data } = await supabase.from('rsp_requests').select('iccid, created_at').not('iccid', 'is', null).order('created_at', { ascending: true })
    for (const r of data || []) if (r.iccid && !installByIccid.has(r.iccid)) installByIccid.set(r.iccid, r.created_at)
  }
  return { refundedIccids, installByIccid }
}

// 只對「當頁」的 ICCID 撈成本/蝦皮訂單（jsonb 陣列用 contains 逐一 OR），不掃全表
async function loadOrderForPage(supabase: ReturnType<typeof createAdminClient>, iccids: string[]): Promise<Map<string, { costTwd: number | null; orderNumber: string | null }>> {
  const map = new Map<string, { costTwd: number | null; orderNumber: string | null; orderId: string | null }>()
  const uniq = [...new Set(iccids)]
  if (uniq.length === 0) return new Map()
  const orderIds = new Set<string>()
  // shopee_order_items.iccid 是 jsonb 陣列 → 用 or(cs) 條件比對當頁卡號
  const orExpr = uniq.map(ic => `iccid.cs.["${ic}"]`).join(',')
  const { data } = await supabase.from('shopee_order_items').select('iccid, cost_twd, shopee_order_id').or(orExpr)
  for (const it of data || []) {
    if (it.shopee_order_id) orderIds.add(it.shopee_order_id)
    for (const ic of (Array.isArray(it.iccid) ? it.iccid as string[] : []))
      if (uniq.includes(ic)) map.set(ic, { costTwd: it.cost_twd, orderNumber: null, orderId: it.shopee_order_id })
  }
  if (orderIds.size > 0) {
    const { data: ord } = await supabase.from('shopee_orders').select('id, shopee_order_number').in('id', [...orderIds])
    const num = new Map((ord || []).map(o => [o.id, o.shopee_order_number]))
    for (const v of map.values()) if (v.orderId) v.orderNumber = num.get(v.orderId) || null
  }
  return new Map([...map].map(([k, v]) => [k, { costTwd: v.costTwd, orderNumber: v.orderNumber }]))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function composeRow(p: any, sets: EnrichMaps, orderMap: Map<string, { costTwd: number | null; orderNumber: string | null }>) {
  const ic = p.iccid as string
  const ord = orderMap.get(ic)
  const countries = Array.isArray(p.countries) ? p.countries as string[] : []
  return {
    iccid: ic,
    card_status: p.card_status ?? null,   // card_plans 自己的快照（不掃 manual_iccids）
    plan_status: p.plan_status,
    plan_start_time: p.plan_start_time,
    plan_end_time: p.plan_end_time,
    countries,
    country_label: countries.length === 0 ? null : countries.length === 1 ? countries[0] : `多國（${countries.length}）`,
    bc_order_id: p.order_id || null,
    bc_sku_name: p.sku_name || null,
    copies: p.copies || null,
    total_days: p.total_days ?? null,
    cost_twd: ord?.costTwd ?? null,
    order_number: ord?.orderNumber ?? null,
    aftersale: sets.refundedIccids.has(ic),
    installed_at: sets.installByIccid.get(ic) || null,
  }
}

// 全部篩選走 SQL（含 card_status 快照欄、售後/安裝用小集合的 in/not-in）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseQuery(supabase: ReturnType<typeof createAdminClient>, sp: URLSearchParams, sets: EnrichMaps): any {
  let q = supabase.from('card_plans')
    .select('iccid, sub_order_id, order_id, sku_name, copies, total_days, plan_status, plan_start_time, plan_end_time, countries, card_status', { count: 'exact' })
  const search = (sp.get('search') || '').trim()
  if (search) q = q.ilike('iccid', `%${search}%`)
  const ps = sp.get('plan_status'); if (ps) q = q.eq('plan_status', ps)
  const cs = sp.get('card_status'); if (cs) q = q.eq('card_status', cs)
  const refunded = [...sets.refundedIccids]
  const af = sp.get('aftersale')
  if (af === '1') q = refunded.length ? q.in('iccid', refunded) : q.eq('iccid', '__none__')
  else if (af === '0' && refunded.length) q = q.not('iccid', 'in', `(${refunded.join(',')})`)
  const installed = [...sets.installByIccid.keys()]
  const inst = sp.get('installed')
  if (inst === '1') q = installed.length ? q.in('iccid', installed) : q.eq('iccid', '__none__')
  else if (inst === '0' && installed.length) q = q.not('iccid', 'in', `(${installed.join(',')})`)
  return q.order('plan_start_time', { ascending: false, nullsFirst: false })
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const supabase = createAdminClient()

  const { count: planCount } = await supabase.from('card_plans').select('id', { count: 'exact', head: true })
  if (!planCount) return NextResponse.json({ data: [], total: 0, needSync: true })

  const sets = await loadSmallSets(supabase)

  // 匯出：套 SQL 篩選後分批串出（只此路徑會掃較多列，屬下載行為）
  if (sp.get('action') === 'export') {
    const cols = ['iccid', 'card_status', 'plan_status', 'plan_start_time', 'plan_end_time', 'countries', 'bc_order_id', 'bc_sku_name', 'copies', 'total_days', 'cost_twd', 'order_number', 'aftersale', 'installed_at']
    const head = 'ICCID,卡片狀態,套餐狀態,啟用時間,到期時間,國家,BC單號,套餐(BC),份數,總天數,成本,蝦皮訂單,售後,安裝時間'
    const esc = (v: unknown) => { const s = Array.isArray(v) ? v.join(' / ') : (v == null ? '' : String(v)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines: string[] = [head]
    for (let from = 0; ; from += 500) {
      const { data } = await baseQuery(supabase, sp, sets).range(from, from + 499)
      if (!data || data.length === 0) break
      const orderMap = await loadOrderForPage(supabase, data.map((p: { iccid: string }) => p.iccid))
      for (const p of data) lines.push(cols.map(c => esc((composeRow(p, sets, orderMap) as Record<string, unknown>)[c])).join(','))
      if (data.length < 500) break
    }
    return new NextResponse('﻿' + lines.join('\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="card-plans.csv"' },
    })
  }

  // 一般分頁：SQL 分頁只取當頁，再對當頁 ~50 筆 enrich
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const pageSize = Math.min(200, Number(sp.get('pageSize')) || 50)
  const { data, count } = await baseQuery(supabase, sp, sets).range((page - 1) * pageSize, page * pageSize - 1)
  const orderMap = await loadOrderForPage(supabase, (data || []).map((p: { iccid: string }) => p.iccid))
  return NextResponse.json({ data: (data || []).map((p: unknown) => composeRow(p, sets, orderMap)), total: count || 0 })
}
