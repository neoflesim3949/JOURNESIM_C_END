import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry } from '@/lib/billionconnect'

// Vercel Cron 或外部呼叫共用端點。
// 需帶 Authorization: Bearer <CRON_SECRET>，Vercel Cron 會自動帶入。
// 1. 到期日快要到 / 已過（前後 7 天）的卡片
// 2. 從未同步過（bc_synced_at IS NULL）的卡片
// 3. 狀態為「已開卡 / 使用中」且超過 12 小時未同步的卡片
// 會呼叫 BC F010（每批 50 筆）並回寫本地快取

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

  // 計算選取範圍
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()

  // 撈出待同步 ICCID
  const targetIds = new Set<string>()

  // (1) 到期日 <= +7 天（含已過期）
  {
    const { data } = await supabase.from('manual_iccids')
      .select('iccid')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', in7days)
    for (const r of data || []) targetIds.add(r.iccid)
  }

  // (2) 從未同步過
  {
    const { data } = await supabase.from('manual_iccids')
      .select('iccid')
      .is('bc_synced_at', null)
      .limit(500)
    for (const r of data || []) targetIds.add(r.iccid)
  }

  // (3) 狀態為已開卡或使用中，且超過 12 小時未同步
  {
    const { data } = await supabase.from('manual_iccids')
      .select('iccid')
      .in('card_status', ['0', '1'])
      .lt('bc_synced_at', twelveHoursAgo)
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

  return NextResponse.json({
    ok: true,
    total: allIds.length,
    updated,
    errors: errors.slice(0, 5),
    duration_ms: Date.now() - startedAt,
  })
}
