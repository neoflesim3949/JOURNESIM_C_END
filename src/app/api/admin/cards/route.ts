import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry, getPlanUsageV2, getDailyTraffic } from '@/lib/billionconnect'


// 依號段產生 ICCID 陣列：將結尾數字部分遞增
function generateRange(start: string, end: string): string[] {
  const s = start.trim(), e = end.trim()
  const m1 = s.match(/^(.*?)(\d+)$/)
  const m2 = e.match(/^(.*?)(\d+)$/)
  if (!m1 || !m2) return []
  const prefix = m1[1]
  if (prefix !== m2[1]) return []
  const n1 = BigInt(m1[2])
  const n2 = BigInt(m2[2])
  if (n2 < n1) return []
  const len = m1[2].length
  const max = BigInt(5000) // 防呆：一次不超過 5000 個
  if (n2 - n1 > max) return []
  const result: string[] = []
  for (let i = n1; i <= n2; i = i + BigInt(1)) {
    result.push(prefix + i.toString().padStart(len, '0'))
  }
  return result
}

// POST — 新增單一/號段 ICCID，或同步 BC F010 資料到本地快取
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  // ─── action=sync：批次同步 BC F010 資料到 manual_iccids 快取 ──
  if (body.action === 'sync') {
    const filterIccids: string[] | undefined = Array.isArray(body.iccids) && body.iccids.length > 0
      ? body.iccids.map((s: unknown) => String(s || '').trim()).filter(Boolean)
      : undefined

    // 撈出要同步的 ICCID 清單
    const allIds: string[] = []
    if (filterIccids) {
      allIds.push(...filterIccids)
    } else {
      let off = 0
      while (true) {
        const { data } = await supabase.from('manual_iccids').select('iccid').range(off, off + 999)
        if (!data || data.length === 0) break
        allIds.push(...data.map(r => r.iccid))
        if (data.length < 1000) break
        off += 1000
      }
    }

    if (allIds.length === 0) return NextResponse.json({ ok: true, total: 0, updated: 0 })

    let updated = 0
    const errors: string[] = []
    const BATCH = 50
    const now = new Date().toISOString()
    for (let i = 0; i < allIds.length; i += BATCH) {
      const slice = allIds.slice(i, i + BATCH)
      try {
        const results = await getCardExpiry(slice).catch((e: unknown) => {
          errors.push(e instanceof Error ? e.message : String(e))
          return [] as Awaited<ReturnType<typeof getCardExpiry>>
        })
        for (const r of results || []) {
          if (!r.iccid) continue
          const { error } = await supabase.from('manual_iccids').update({
            card_type: r.type || null,
            card_status: r.status || null,
            expiration_date: r.expirationDate || null,
            postponed_month: r.postponedMonth || null,
            max_delay_month: r.maxDelayMonth || null,
            usage_count: r.usageCount || null,
            support_upgrade_multi_card: r.supportUpgradeMultiCard || null,
            bc_synced_at: now,
          }).eq('iccid', r.iccid)
          if (!error) updated++
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    return NextResponse.json({ ok: true, total: allIds.length, updated, errors: errors.slice(0, 5) })
  }

  const type = body.type === 'esim' ? 'esim' : 'sim'
  const note = body.note || null
  let iccids: string[] = []

  if (body.mode === 'range') {
    if (!body.start || !body.end) return NextResponse.json({ error: '請填寫起始與結束號段' }, { status: 400 })
    iccids = generateRange(body.start, body.end)
    if (iccids.length === 0) return NextResponse.json({ error: '號段格式不正確或超過 5000 個上限' }, { status: 400 })
  } else if (body.mode === 'bulk') {
    if (!Array.isArray(body.iccids)) return NextResponse.json({ error: 'iccids 必須是陣列' }, { status: 400 })
    iccids = Array.from(new Set((body.iccids as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean)))
    if (iccids.length === 0) return NextResponse.json({ error: '無有效 ICCID' }, { status: 400 })
  } else {
    const single = (body.iccid || '').trim()
    if (!single) return NextResponse.json({ error: '請輸入 ICCID' }, { status: 400 })
    iccids = [single]
  }

  const rows = iccids.map(ic => ({ iccid: ic, type, note }))
  // 分批寫入，避免單次 request 過大
  const BATCH = 1000
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error, count } = await supabase.from('manual_iccids')
      .upsert(slice, { onConflict: 'iccid', ignoreDuplicates: true, count: 'exact' })
    if (error) return NextResponse.json({ error: error.message, insertedBefore: inserted }, { status: 500 })
    inserted += count ?? 0
  }
  return NextResponse.json({ ok: true, total: iccids.length, inserted })
}

// DELETE — 刪除手動新增的 ICCID
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const iccid = searchParams.get('iccid')
  if (!iccid) return NextResponse.json({ error: '缺少 iccid' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('manual_iccids').delete().eq('iccid', iccid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') // list | expiry | usage | traffic
  const iccid = searchParams.get('iccid')

  const supabase = createAdminClient()

  // ─── list：列出所有 ICCID（從 order_skus 收集）──────────────
  if (action === 'list' || !action) {
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')

    interface CardRow {
      iccid: string; type: 'esim' | 'sim'; note: string | null; status: string
      card_type?: string | null; card_status?: string | null; expiration_date?: string | null
      postponed_month?: string | null; max_delay_month?: string | null; usage_count?: string | null
      bc_synced_at?: string | null
      activation_start_time?: string | null; activation_end_time?: string | null
    }
    const allCards: CardRow[] = []

    // 只從 manual_iccids 讀取 + 快取欄位；分批拉取避免 Supabase 預設 1000 筆上限
    let mf = 0
    while (true) {
      const { data: batch } = await supabase.from('manual_iccids')
        .select('iccid, type, note, card_type, card_status, expiration_date, postponed_month, max_delay_month, usage_count, bc_synced_at, activation_start_time, activation_end_time')
        .range(mf, mf + 999)
      if (!batch || batch.length === 0) break
      for (const m of batch) {
        allCards.push({
          iccid: m.iccid,
          type: (m.type === 'esim' ? 'esim' : 'sim') as 'esim' | 'sim',
          note: m.note,
          status: 'manual',
          card_type: m.card_type,
          card_status: m.card_status,
          expiration_date: m.expiration_date,
          postponed_month: m.postponed_month,
          max_delay_month: m.max_delay_month,
          usage_count: m.usage_count,
          bc_synced_at: m.bc_synced_at,
          activation_start_time: m.activation_start_time,
          activation_end_time: m.activation_end_time,
        })
      }
      if (batch.length < 1000) break
      mf += 1000
    }

    // 篩選
    const cardType = searchParams.get('card_type') || ''
    const cardStatus = searchParams.get('card_status') || ''
    const expireFrom = searchParams.get('expire_from') || ''
    const expireTo = searchParams.get('expire_to') || ''

    let filtered = allCards
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((c) =>
        c.iccid.toLowerCase().includes(q) ||
        (c.note || '').toLowerCase().includes(q)
      )
    }
    if (cardType) filtered = filtered.filter(c => (c.card_type || '') === cardType)
    if (cardStatus) filtered = filtered.filter(c => (c.card_status || '') === cardStatus)
    if (expireFrom) filtered = filtered.filter(c => (c.expiration_date || '') >= expireFrom)
    if (expireTo) filtered = filtered.filter(c => (c.expiration_date || '') <= expireTo + ' 23:59:59')

    // 分頁
    const total = filtered.length
    const start = (page - 1) * pageSize
    const paged = filtered.slice(start, start + pageSize)

    return NextResponse.json({ data: paged, total })
  }

  // ─── expiry：F010 卡片有效期 ──────────────────────────────
  if (action === 'expiry' && iccid) {
    try {
      const result = await getCardExpiry([iccid])
      return NextResponse.json({ expiry: Array.isArray(result) ? result[0] || null : null })
    } catch {
      return NextResponse.json({ expiry: null })
    }
  }

  // ─── usage：F046 套餐使用資訊（帶 channelOrderId 查特定訂單）──
  if (action === 'usage' && iccid) {
    const channelOrderId = searchParams.get('channelOrderId') || ''
    try {
      const result = await getPlanUsageV2({ iccid, ...(channelOrderId ? { channelOrderId } : {}) })
      return NextResponse.json({ usage: result })
    } catch {
      return NextResponse.json({ usage: null })
    }
  }

  // ─── traffic：F023 日流量 ─────────────────────────────────
  if (action === 'traffic' && iccid) {
    const beginDate = searchParams.get('beginDate') || ''
    const endDate = searchParams.get('endDate') || ''
    if (!beginDate || !endDate) return NextResponse.json({ traffic: [] })

    try {
      const raw = await getDailyTraffic({ iccid, beginDate, endDate }).catch(() => [])
      const items = Array.isArray(raw) ? raw : []

      const mccs = [...new Set(items.map((t) => t.countryRegionCode).filter(Boolean))]
      let countryMap = new Map<string, string>()
      if (mccs.length > 0) {
        const { data: countries } = await supabase.from('bc_countries').select('mcc, name_zh, name').in('mcc', mccs)
        for (const c of countries || []) countryMap.set(c.mcc, c.name_zh || c.name)
      }

      const traffic = items.map((t) => ({
        usedDate: t.usedDate,
        country: countryMap.get(t.countryRegionCode) || t.country,
        usedAmountKB: parseFloat(t.usedAmount) || 0,
      }))

      return NextResponse.json({ traffic })
    } catch {
      return NextResponse.json({ traffic: [] })
    }
  }

  // ─── sku：從 bc_products 查詢套餐詳情 ────────────────────
  if (action === 'sku') {
    const skuId = searchParams.get('skuId')
    if (!skuId) return NextResponse.json({ sku: null })
    const { data } = await supabase.from('bc_products')
      .select('sku_id, name, type, plan_type, high_flow_size, limit_flow_speed, capacity, hotspot_support, acceleration_support, point_contact_type, time_zone, desc, country_data')
      .eq('sku_id', skuId)
      .single()
    return NextResponse.json({ sku: data || null })
  }

  return NextResponse.json({ error: '無效 action' }, { status: 400 })
}
