import { createAdminClient } from '@/lib/supabase/admin'

let cache: Map<string, string> | null = null
let cacheTime = 0
const CACHE_TTL = 60 * 1000 // 1 分鐘快取

export async function getSettings(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache

  const supabase = createAdminClient()
  const { data } = await supabase.from('system_settings').select('key, value')

  const map = new Map<string, string>()
  for (const row of data || []) {
    map.set(row.key, row.value)
  }

  cache = map
  cacheTime = Date.now()
  return map
}

export async function getSetting(key: string): Promise<string> {
  const settings = await getSettings()
  return settings.get(key) || ''
}
