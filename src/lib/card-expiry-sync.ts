import { getCardExpiry } from './billionconnect'

// 依 ICCID 打 BC F010 取得最新卡狀態/有效期，回寫 manual_iccids 快取
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function refreshCardExpiry(supabase: any, iccids: string[]): Promise<number> {
  const uniq = [...new Set(iccids.map(s => String(s || '').trim()).filter(Boolean))]
  if (uniq.length === 0) return 0
  const results = await getCardExpiry(uniq).catch(() => [] as Awaited<ReturnType<typeof getCardExpiry>>)
  const syncedAt = new Date().toISOString()
  let updated = 0
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
  return updated
}
