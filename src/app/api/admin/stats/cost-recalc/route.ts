import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 成本重算：把「每日型且日容量 ≥ 1GB」的方案，改成買同區「每日1GB」基礎方案，
//   在日用量超過 1GB 的那幾天，每超 1GB 補 1 個 1GB 加速包（無條件進位），比較採購成本。
//   幣別一律 ¥ CNY（bc_products.prices/cost_price 皆為 BC 結算價）。
// GET ?from=&to=（下單/plan_start 月份範圍，用於趨勢）&exclude_legacy=1
//     &accel_mode=auto|fixed &accel_price=（fixed 或 auto 找不到時的每 1GB 加速包單價 ¥）

const KB_PER_GB = 1024 * 1024

// 從品名抓「每日X GB/MB」（含「每日高速1GB」）→ GB 數（找不到回 null）
function parseDailyGB(name: string): number | null {
  if (!name) return null
  const m = name.match(/每日\s*(?:高速)?\s*([\d.]+)\s*(GB|MB|G|M)/i)
  if (!m) return null
  const v = parseFloat(m[1])
  if (isNaN(v)) return null
  const unit = m[2].toUpperCase()
  return unit.startsWith('G') ? v : v / 1000
}
// 自動家族鍵：與 方案列表 一致（抹每日GB、統一大小寫、去尾綴）— 手動未分組時的 fallback
function autoFamily(name: string): string {
  let s = (name || '').replace(/每日\s*(?:高速)?\s*[\d.]+\s*(GB|MB|G|M)/i, '每日◆')
  s = s.toLowerCase().replace(/-tw专用|-tw專用|-rnr|-专用|-專用/g, '')
  return s.replace(/-{2,}/g, '-').replace(/-$/, '').trim()
}
function familyLabel(name: string): string {
  return (name || '').replace(/每日\s*(?:高速)?\s*[\d.]+\s*(GB|MB|G|M)/i, '每日◆GB')
}
function regionOf(name: string): string {
  return (name || '').split('-')[0] || name || ''
}

interface Tier { copies?: string | number; settlementPrice?: string | number; retailPrice?: string | number }
interface Prod {
  sku_id: string; name: string; plan_type: string | null; type: string | null
  cost_price: number | null; prices: Tier[]; high_flow_size: string | null; capacity: string | null
  rechargeable_product: string | null
}

// 取某方案在指定份數(copies)的結算價；找不到對應 tier → cost_price × copies；再不行 → null
function settleAt(p: Prod, copies: number): number | null {
  const tiers = Array.isArray(p.prices) ? p.prices : []
  const t = tiers.find(x => Number(x.copies) === copies)
  if (t && t.settlementPrice != null && t.settlementPrice !== '') { const n = Number(t.settlementPrice); if (!isNaN(n)) return n }
  if (p.cost_price != null) { const n = Number(p.cost_price); if (!isNaN(n)) return n * copies }
  const t1 = tiers.find(x => Number(x.copies) === 1)
  if (t1 && t1.settlementPrice != null) { const n = Number(t1.settlementPrice); if (!isNaN(n)) return n * copies }
  return null
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  // pack＝1GB基礎＋超量補加速包；volume＝每GB價×實際總用量
  const mode = sp.get('mode') === 'volume' ? 'volume' : 'pack'
  // volume 每GB價基準：pergb_days>0＝只取「第N天那一檔」(價÷天)；pergb_avg_days>0＝「1~N天平均」(Σ價÷Σ天GB)；皆無＝全階梯平均
  const pergbDays = Math.max(0, Number(sp.get('pergb_days')) || 0)
  const pergbAvgDays = Math.max(0, Number(sp.get('pergb_avg_days')) || 0)
  // pergb_basis=global：全域每GB價＝所有「非吃到飽」方案 總量/總價；globalall＝連吃到飽方案也算進去
  const pergbBasis = sp.get('pergb_basis') || ''
  const pergbGlobal = pergbBasis === 'global' || pergbBasis === 'globalall'
  const inclUnlimited = pergbBasis === 'globalall'
  const supabase = createAdminClient()
  const legacyFlag = sp.get('exclude_legacy') === '1'

  // 版本鍵：每個成本重算子頁一個快照
  const variant = mode === 'pack' ? 'pack'
    : pergbBasis === 'globalall' ? 'volume-globalall'
    : pergbBasis === 'global' ? 'volume-global'
    : pergbDays > 0 ? `volume-${pergbDays}`
    : pergbAvgDays > 0 ? `volume-avg${pergbAvgDays}`
    : 'volume-avg'

  // 讀快取：打開頁面直接看最近一次結果，不重算
  if (sp.get('cached')) {
    const { data } = await supabase.from('cost_recalc_snapshots').select('payload, opts, computed_at').eq('variant', variant).maybeSingle()
    if (!data || !data.payload) return NextResponse.json({ empty: true, variant })
    return NextResponse.json({ ...(data.payload as object), snapshot: { variant, computed_at: data.computed_at, opts: data.opts } })
  }

  // 存快照並回傳
  const snapScope = (from || to) ? 'range' : 'all'
  const opts = { from, to, exclude_legacy: legacyFlag, scope: snapScope }
  const saveSnap = async (payload: object) => {
    const computed_at = new Date().toISOString()
    try { await supabase.from('cost_recalc_snapshots').upsert({ variant, payload, opts, computed_at }, { onConflict: 'variant' }) } catch { /* 快照失敗不影響回傳 */ }
    return NextResponse.json({ ...payload, snapshot: { variant, computed_at, opts } })
  }

  const legacy = legacyFlag ? await getLegacyIccids(supabase) : new Set<string>()

  // 1) 產品：建家族索引
  const prodBySku = new Map<string, Prod>()
  const famToGb = new Map<string, Map<number, Prod>>()   // familyKey → (gb → 方案)
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_products')
      .select('sku_id, name, plan_type, type, cost_price, prices, high_flow_size, capacity, rechargeable_product')
      .range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data as unknown as Prod[]) {
      if (!r.sku_id) continue
      prodBySku.set(r.sku_id, r)
      // 單日型才進自動家族索引
      if (r.plan_type === '1') {
        const gb = parseDailyGB(r.name)
        if (gb != null) {
          const fk = autoFamily(r.name)
          if (!famToGb.has(fk)) famToGb.set(fk, new Map())
          const m = famToGb.get(fk)!
          if (!m.has(gb)) m.set(gb, r)   // 同 gb 取先出現者
        }
      }
    }
    if (data.length < 1000) break
  }
  const autoBase1Gb = (ak: string): Prod | null => {
    const m = famToGb.get(ak); if (!m) return null
    for (const [gb, p] of m) if (Math.abs(gb - 1) < 0.01) return p
    return null
  }

  // 1b) 加速包報價（F056 同步到 accel_prices）：sku → acceleratePrice，供「人工選定的加速包 SKU」查價
  const accelBySku = new Map<string, number>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('accel_prices').select('sku_id, accelerate_price').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) { const price = Number(r.accelerate_price); if (!isNaN(price) && price > 0 && r.sku_id) accelBySku.set(r.sku_id as string, price) }
    if (data.length < 1000) break
  }

  // 2) sku_meta：吃到飽（排除）＋手動分組 family_id / is_base ＋人工選定的加速包 accel_sku_id
  const unlimited = new Set<string>()
  const familyOf = new Map<string, string>()          // sku → 手動 family_id
  const manualBase = new Map<string, string>()        // family_id → 基礎 sku
  const manualAccel = new Map<string, string>()       // sku → 人工選定的加速包 sku
  let metaCols = 'sku_id, is_unlimited, family_id, is_base, accel_sku_id'
  const probe = await supabase.from('sku_meta').select(metaCols).limit(1)
  if (probe.error) metaCols = 'sku_id, is_unlimited, family_id, is_base'   // 095 未跑 → 降級
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('sku_meta').select(metaCols).range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data as unknown as Record<string, unknown>[]) {
      const sku = r.sku_id as string
      if (r.is_unlimited) unlimited.add(sku)
      if (r.family_id) { familyOf.set(sku, r.family_id as string); if (r.is_base) manualBase.set(r.family_id as string, sku) }
      if (r.accel_sku_id) manualAccel.set(sku, r.accel_sku_id as string)
    }
    if (data.length < 1000) break
  }

  // 3) 每卡取主方案（單日型、非吃到飽、原SKU在bc_products；已手動分組 或 名稱解析日容量≥1GB）：同 iccid 取 total_days 最大者
  interface CardPlan { sku_id: string; sku_name: string; copies: number; days: number; gb: number | null; start: string | null }
  const cardOf = new Map<string, CardPlan>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans')
      .select('iccid, sku_id, sku_name, copies, total_days, plan_type, plan_start_time')
      .range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const ic = r.iccid as string
      if (!ic || legacy.has(ic)) continue
      if (r.plan_type !== '1') continue
      const sku = (r.sku_id as string) || ''
      const prod = prodBySku.get(sku)
      if (!prod) continue                       // 原 SKU 不在 bc_products（多為舊SIMPOMATION）→ 不納入比較
      const nm = prod.name || (r.sku_name as string) || ''
      const gb = parseDailyGB(nm)
      const grouped = familyOf.has(sku)
      const isUnl = unlimited.has(sku)
      // 已分組：組內「日容量≥1GB 或 已勾吃到飽」都納入（吃到飽卡也用 1GB 基礎＋加速包重算）
      // 未分組：僅名稱日容量≥1GB 且非吃到飽（走自動家族 fallback）
      const inScope = grouped ? (isUnl || (gb != null && gb >= 1)) : (!isUnl && gb != null && gb >= 1)
      if (!inScope) continue
      const days = Number(r.total_days) || 0
      const copies = Number(r.copies) || days || 1
      const prev = cardOf.get(ic)
      if (!prev || days > prev.days) {
        cardOf.set(ic, { sku_id: sku, sku_name: nm, copies, days, gb, start: (r.plan_start_time as string) || null })
      }
    }
    if (data.length < 1000) break
  }

  // 4) 用量：只取在範圍內卡片，每 (iccid,date) 加總 KB → 算超量加速包數
  const scope = new Set(cardOf.keys())
  const dailyKb = new Map<string, Map<string, number>>()   // iccid → (date → kb)
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_usage_daily').select('iccid, used_date, used_amount').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const ic = r.iccid as string
      if (!scope.has(ic)) continue
      const amt = Number(r.used_amount) || 0
      if (amt <= 0) continue
      let m = dailyKb.get(ic); if (!m) { m = new Map(); dailyKb.set(ic, m) }
      const d = r.used_date as string
      m.set(d, (m.get(d) || 0) + amt)
    }
    if (data.length < 1000) break
  }

  const inRange = (ym: string) => (!from || ym >= from.slice(0, 7)) && (!to || ym <= to.slice(0, 7))
  const round = (n: number) => Math.round(n * 100) / 100
  const baseOfCard = (c: { sku_id: string }, prod: Prod): Prod | null => {
    const mfam = familyOf.get(c.sku_id)
    if (mfam) { const bsku = manualBase.get(mfam); return bsku ? (prodBySku.get(bsku) || null) : null }
    return autoBase1Gb(autoFamily(prod.name))
  }

  // ============ 依方案流量：每個原始 SKU 一列；同家族共用「基礎方案平均每GB價」 ============
  if (mode === 'volume') {
    // 每個基礎方案算一次每GB價：pergbDays=0 → 全階梯 Σ結算價/ΣGB(N天=N GB)；pergbDays>0 → 該天數檔結算價 ÷ 天數
    const perGbCache = new Map<string, number | null>()
    const avgPerGb = (base: Prod): number | null => {
      const hit = perGbCache.get(base.sku_id); if (hit !== undefined) return hit
      let v: number | null
      if (pergbDays > 0) {
        const price = settleAt(base, pergbDays)          // 只取第 N 天那一檔的總結算價
        v = price != null && price > 0 ? price / pergbDays : null   // ÷ 天數GB（1GB/天）
      } else {
        // pergbAvgDays>0：只平均 1~N 天的階梯；否則平均全部階梯
        let sumP = 0, sumGb = 0
        for (const t of (Array.isArray(base.prices) ? base.prices : [])) {
          const p = Number(t.settlementPrice), cp = Number(t.copies)
          if (isNaN(p) || isNaN(cp) || cp <= 0) continue
          if (pergbAvgDays > 0 && cp > pergbAvgDays) continue
          sumP += p; sumGb += cp
        }
        if (sumGb === 0 && base.cost_price != null) { sumP = Number(base.cost_price); sumGb = 1 }
        v = sumGb > 0 ? sumP / sumGb : null
      }
      perGbCache.set(base.sku_id, v); return v
    }

    // 全域每GB價：所有非吃到飽方案，Σ(各階梯結算價) / Σ(份數 × 每份GB(high_flow_size))
    let globalPerGb: number | null = null
    if (pergbGlobal) {
      let sumP = 0, sumGb = 0
      for (const p of prodBySku.values()) {
        if (!inclUnlimited && (unlimited.has(p.sku_id) || /无限|無限|吃到饱|吃到飽|unlimited/i.test(p.name || ''))) continue
        const hfsGb = Number(p.high_flow_size) > 0 ? Number(p.high_flow_size) / KB_PER_GB : 0
        if (hfsGb <= 0) continue
        for (const t of (Array.isArray(p.prices) ? p.prices : [])) {
          const pr = Number(t.settlementPrice), cp = Number(t.copies)
          if (!isNaN(pr) && pr > 0 && !isNaN(cp) && cp > 0) { sumP += pr; sumGb += cp * hfsGb }
        }
      }
      globalPerGb = sumGb > 0 ? sumP / sumGb : null
    }

    interface SAgg { name: string; region: string; gb: number | null; base: Prod | null; perGb: number | null; cards: number; old: number; nw: number; usedGb: number; noUsage: number }
    const agg = new Map<string, SAgg>()
    const months = new Map<string, { old: number; nw: number }>()
    let sCards = 0, sOld = 0, sNew = 0, sNoUsage = 0, pendCards = 0, pendOld = 0
    const pendSku = new Set<string>()

    for (const [ic, c] of cardOf) {
      const ym = c.start ? String(c.start).slice(0, 7) : ''
      if (ym && from && to && !inRange(ym)) continue
      const prod = prodBySku.get(c.sku_id)!
      const base = baseOfCard(c, prod)
      const perGb = pergbGlobal ? globalPerGb : (base ? avgPerGb(base) : null)
      const oldCost = settleAt(prod, c.copies) ?? 0
      const dm = dailyKb.get(ic); const hasUsage = !!dm && dm.size > 0
      let totalKb = 0; if (dm) for (const kb of dm.values()) totalKb += kb
      const usedGb = totalKb / KB_PER_GB
      const eligible = perGb != null && (pergbGlobal || base != null)
      const newCost = eligible ? usedGb * (perGb as number) : 0

      let a = agg.get(c.sku_id)
      if (!a) { a = { name: prod.name, region: regionOf(prod.name), gb: c.gb, base, perGb, cards: 0, old: 0, nw: 0, usedGb: 0, noUsage: 0 }; agg.set(c.sku_id, a) }
      a.cards++; a.old += oldCost; a.usedGb += usedGb; if (!hasUsage) a.noUsage++
      if (eligible) {
        a.nw += newCost
        sCards++; sOld += oldCost; sNew += newCost; if (!hasUsage) sNoUsage++
        if (ym) { const mo = months.get(ym) || { old: 0, nw: 0 }; mo.old += oldCost; mo.nw += newCost; months.set(ym, mo) }
      } else { pendCards++; pendOld += oldCost; pendSku.add(c.sku_id) }
    }

    const famRows = Array.from(agg.entries()).map(([sku, a]) => {
      const el = a.base != null && a.perGb != null
      const nw = el ? a.nw : a.old
      return {
        family: a.name, region: a.region, cards: a.cards,
        gbs: a.gb != null ? (a.gb >= 1 ? `${a.gb}G` : `${Math.round(a.gb * 1000)}M`) : '—',
        old_cost: round(a.old), new_cost: round(nw),
        savings: el ? round(a.old - nw) : 0, savings_pct: el && a.old > 0 ? Math.round((1 - nw / a.old) * 1000) / 10 : 0,
        eligible: el, base_found: a.base != null, base_sku: a.base?.sku_id || '', base_name: a.base?.name || '',
        used_gb: Math.round(a.usedGb * 10) / 10, mb_price: a.perGb != null ? Math.round((a.perGb / 1024) * 100000) / 100000 : 0,
        no_usage: a.noUsage, sku_id: sku,
      }
    }).sort((x, y) => (y.eligible ? 1 : 0) - (x.eligible ? 1 : 0) || y.savings - x.savings)

    const monthRows = Array.from(months.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([ym, v]) => ({ ym, old: round(v.old), nw: round(v.nw), savings: round(v.old - v.nw) }))

    return saveSnap({
      summary: {
        cards: sCards, pending_cards: pendCards, pending_old: round(pendOld), pending_no_base: pendSku.size, no_usage_cards: sNoUsage,
        old_cost: round(sOld), new_cost: round(sNew), savings: round(sOld - sNew), savings_pct: sOld > 0 ? Math.round((1 - sNew / sOld) * 1000) / 10 : 0,
      },
      months: monthRows,
      families: famRows,
      params: { mode },
    })
  }

  // 5) Pass 1（依方案）：逐卡算舊成本／基準成本／超量包數，累到家族；原SKU無基準者另計
  interface Rec { fk: string; ym: string; old: number; base: number; packs: number }
  interface Fam { family: string; region: string; sampleSku: string; basep: Prod | null; cards: number; old: number; base: number; packs: number; overDays: number; baseFound: boolean; baseSku: string; baseName: string; noUsage: number; gbs: Set<number> }
  const fams = new Map<string, Fam>()
  const recs: Rec[] = []

  for (const [ic, c] of cardOf) {
    const ym = c.start ? String(c.start).slice(0, 7) : ''
    if (ym && from && to && !inRange(ym)) continue   // 有指定範圍才用 plan_start 過濾
    const prod = prodBySku.get(c.sku_id)!             // pass3 已保證存在
    // 家族／基礎：手動分組優先，未分組用自動家族
    let fk: string, base: Prod | null
    const mfam = familyOf.get(c.sku_id)
    if (mfam) { fk = 'M:' + mfam; const bsku = manualBase.get(mfam); base = bsku ? (prodBySku.get(bsku) || null) : null }
    else { const ak = autoFamily(prod.name); fk = 'A:' + ak; base = autoBase1Gb(ak) }
    const region = regionOf((base || prod).name)
    const oldCost = settleAt(prod, c.copies) ?? 0
    const baseFound = !!base
    const baseCost = base ? (settleAt(base, c.copies) ?? 0) : 0

    let packs = 0, overDays = 0
    const dm = dailyKb.get(ic)
    const hasUsage = !!dm && dm.size > 0
    if (dm) for (const kb of dm.values()) { const gb = kb / KB_PER_GB; if (gb > 1) { packs += Math.ceil(gb - 1); overDays++ } }

    let fam = fams.get(fk)
    if (!fam) { fam = { family: familyLabel((base || prod).name), region, sampleSku: base?.sku_id || c.sku_id, basep: base, cards: 0, old: 0, base: 0, packs: 0, overDays: 0, baseFound, baseSku: base?.sku_id || '', baseName: base?.name || '', noUsage: 0, gbs: new Set() }; fams.set(fk, fam) }
    fam.cards++; fam.old += oldCost; fam.base += baseCost; fam.packs += packs; fam.overDays += overDays; if (c.gb != null) fam.gbs.add(c.gb)
    if (!hasUsage) fam.noUsage++
    recs.push({ fk, ym, old: oldCost, base: baseCost, packs })
  }

  // 6) 每家族加速包單價：優先「人工在方案列表為基礎方案選定的加速包 SKU」→ 其 F056 acceleratePrice；
  //    沒選則用「加1天1GB＝多買1份1GB基礎」的基礎單日結算價當估值
  function accelPriceForFam(f: Fam): { price: number | null; source: string } {
    const accelSku = f.baseSku ? manualAccel.get(f.baseSku) : undefined
    if (accelSku) { const p = accelBySku.get(accelSku); if (p != null) return { price: p, source: '選定' } }
    const basePrice = f.basep ? settleAt(f.basep, 1) : null
    if (basePrice != null && basePrice > 0) return { price: basePrice, source: '基礎日價' }
    return { price: null, source: '無' }
  }
  // 家族可重算條件：有 1GB 基準；且（無超量 → 免加速包，或 有超量 → 有加速包價）
  const famAccel = new Map<string, { price: number | null; source: string }>()
  for (const [fk, f] of fams) {
    if (!f.baseFound) { famAccel.set(fk, { price: null, source: '無基準' }); continue }
    if (f.packs === 0) { famAccel.set(fk, { price: 0, source: '無超量' }); continue }
    famAccel.set(fk, accelPriceForFam(f))
  }
  const eligible = (fk: string, baseFound: boolean) => baseFound && famAccel.get(fk)!.price != null

  // 7) Pass 3：套加速包單價 → 匯總（只算可重算家族；其餘列為待處理）
  const months = new Map<string, { old: number; nw: number }>()
  let sCards = 0, sOld = 0, sBase = 0, sAccel = 0, sPacks = 0, sNoUsage = 0
  let pendCards = 0, pendOld = 0, pendNoBase = 0, pendNoAccel = 0
  for (const r of recs) {
    const f = fams.get(r.fk)!
    if (!eligible(r.fk, f.baseFound)) {
      pendCards++; pendOld += r.old
      continue
    }
    const ap = famAccel.get(r.fk)!.price || 0
    const accelCost = r.packs * ap
    sCards++; sOld += r.old; sBase += r.base; sAccel += accelCost; sPacks += r.packs
    if (r.ym) { const mo = months.get(r.ym) || { old: 0, nw: 0 }; mo.old += r.old; mo.nw += r.base + accelCost; months.set(r.ym, mo) }
  }
  for (const [fk, f] of fams) {
    const el = eligible(fk, f.baseFound)
    if (el) sNoUsage += f.noUsage
    else if (!f.baseFound) pendNoBase++
    else pendNoAccel++
  }

  const famRows = Array.from(fams.entries()).map(([fk, f]) => {
    const ap = famAccel.get(fk)!
    const el = eligible(fk, f.baseFound)
    const accel = el ? f.packs * (ap.price || 0) : 0
    const nw = el ? f.base + accel : f.old
    return {
      family: f.family, region: f.region, cards: f.cards,
      gbs: Array.from(f.gbs).sort((a, b) => a - b).map(g => g >= 1 ? `${g}G` : `${g * 1000}M`).join('/'),
      old_cost: round(f.old), new_cost: round(nw), base_cost: round(f.base), accel_cost: round(accel),
      savings: el ? round(f.old - nw) : 0, savings_pct: el && f.old > 0 ? Math.round((1 - nw / f.old) * 1000) / 10 : 0,
      packs: f.packs, over_days: f.overDays, eligible: el, base_found: f.baseFound, base_sku: f.baseSku, base_name: f.baseName,
      accel_price: ap.price != null ? round(ap.price) : null, accel_source: ap.source, no_usage: f.noUsage,
    }
  }).sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0) || b.savings - a.savings)

  const monthRows = Array.from(months.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([ym, v]) => ({ ym, old: round(v.old), nw: round(v.nw), savings: round(v.old - v.nw) }))

  const sNew = sBase + sAccel
  return saveSnap({
    summary: {
      cards: sCards, pending_cards: pendCards, pending_old: round(pendOld),
      pending_no_base: pendNoBase, pending_no_accel: pendNoAccel, no_usage_cards: sNoUsage,
      old_cost: round(sOld), new_cost: round(sNew), base_cost: round(sBase), accel_cost: round(sAccel),
      savings: round(sOld - sNew), savings_pct: sOld > 0 ? Math.round((1 - sNew / sOld) * 1000) / 10 : 0,
      total_packs: sPacks,
    },
    months: monthRows,
    families: famRows,
    params: { accel_priced: accelBySku.size, mode },
  })
}
