// 舊 SIMPOMATION 卡（Excel 匯入，無 F023 逐日資料）——統計要排除時用
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLegacyIccids(supabase: any): Promise<Set<string>> {
  const set = new Set<string>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('manual_iccids').select('iccid').ilike('note', '%舊SIMPOMATION%').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) set.add(r.iccid)
    if (data.length < 1000) break
  }
  return set
}
