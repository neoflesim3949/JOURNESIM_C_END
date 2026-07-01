import { getPlanUsage } from './billionconnect'

// 依 ICCID 打 BC F012 取得套餐使用狀況，回寫 manual_iccids 快取
// plan_unused = 任一 subOrder 的 planStatus === '0'（未使用）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function refreshCardPlanUsage(supabase: any, iccids: string[]): Promise<number> {
  const uniq = [...new Set(iccids.map(s => String(s || '').trim()).filter(Boolean))]
  if (uniq.length === 0) return 0
  const syncedAt = new Date().toISOString()
  let updated = 0

  const concurrency = 5
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < uniq.length) {
      const ic = uniq[i++]
      try {
        const orders = await getPlanUsage({ iccid: ic })
        const statuses = new Set<string>()
        for (const o of orders || []) {
          for (const s of o.subOrderList || []) {
            if (s.planStatus != null && s.planStatus !== '') statuses.add(String(s.planStatus))
          }
        }
        const planUnused = statuses.has('0')
        const { error } = await supabase.from('manual_iccids').update({
          plan_status: statuses.size ? [...statuses].sort().join(',') : null,
          plan_unused: planUnused,
          plan_synced_at: syncedAt,
        }).eq('iccid', ic)
        if (!error) updated++
      } catch {
        // 單筆失敗略過，不阻斷整批
      }
    }
  }))
  return updated
}
