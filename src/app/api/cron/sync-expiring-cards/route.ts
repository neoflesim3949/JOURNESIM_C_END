import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry } from '@/lib/billionconnect'
import { refreshCardPlanUsage } from '@/lib/card-plan-sync'

// Vercel Cron 或外部呼叫共用端點。
// 需帶 Authorization: Bearer <CRON_SECRET>，Vercel Cron 會自動帶入。
// 1. 到期日在「到期前 7 天 ～ 失效後 3 天」區間的卡片（其餘不再每天同步）
// 2. 從未同步過（bc_synced_at IS NULL）的卡片（初次補撈）
// 會呼叫 BC F010 並回寫本地快取；卡片變動時另由 N002/N003 webhook 即時更新

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // 未設定時允許（本地測試）
  const header = request.headers.get('authorization') || ''
  return header === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

async function runSync() {
  const supabase = createAdminClient()
  const startedAt = Date.now()

  // 計算選取範圍：到期前 7 天 ～ 失效後 3 天
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const past3days = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // 撈出待同步 ICCID
  const targetIds = new Set<string>()
  const windowIds = new Set<string>() // 到期視窗內的卡（另打 F012 同步套餐使用狀況）

  // (1) 到期日在 [失效後3天, 到期前7天]（分頁撈全）
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('manual_iccids')
      .select('iccid')
      .not('expiration_date', 'is', null)
      .gte('expiration_date', past3days)
      .lte('expiration_date', in7days)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data) { targetIds.add(r.iccid); windowIds.add(r.iccid) }
    if (data.length < 1000) break
  }

  // (2) 從未同步過（初次補撈）
  {
    const { data } = await supabase.from('manual_iccids')
      .select('iccid')
      .is('bc_synced_at', null)
      .limit(500)
    for (const r of data || []) targetIds.add(r.iccid)
  }

  const allIds = Array.from(targetIds)
  if (allIds.length === 0) {
    return NextResponse.json({ ok: true, total: 0, updated: 0, duration_ms: Date.now() - startedAt })
  }

  let updated = 0
  const errors: string[] = []
  const BATCH = 50
  const syncedAt = new Date().toISOString()
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
          bc_synced_at: syncedAt,
        }).eq('iccid', r.iccid)
        if (!error) updated++
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // F012：同步到期視窗內卡片的套餐使用狀況（判斷「到期未使用」用）
  let planUpdated = 0
  try {
    planUpdated = await refreshCardPlanUsage(supabase, Array.from(windowIds))
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return NextResponse.json({
    ok: true,
    total: allIds.length,
    updated,
    plan_updated: planUpdated,
    errors: errors.slice(0, 5),
    duration_ms: Date.now() - startedAt,
  })
}
