import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flesim.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient()

  // 靜態頁面
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/guide`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ]

  // 國家頁面（本地）
  const { data: countries } = await supabase
    .from('bc_countries')
    .select('mcc, scope')
    .or('scope.eq.local,scope.is.null')

  const countryPages: MetadataRoute.Sitemap = (countries || []).map((c) => ({
    url: `${BASE_URL}/shop/${c.mcc}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // 區域/全球分組頁面
  const { data: groups } = await supabase
    .from('bc_countries')
    .select('mcc')
    .in('scope', ['regional', 'global'])

  const groupPages: MetadataRoute.Sitemap = (groups || []).map((g) => ({
    url: `${BASE_URL}/shop/${g.mcc}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // 套餐詳情頁（每個國家 × 套餐組合）
  const { data: links } = await supabase.from('country_packages').select('mcc, package_id')
  const { data: packages } = await supabase.from('packages').select('id').eq('is_active', true)
  const activeIds = new Set((packages || []).map((p) => p.id))

  const packagePages: MetadataRoute.Sitemap = (links || [])
    .filter((l) => activeIds.has(l.package_id))
    .map((l) => ({
      url: `${BASE_URL}/shop/${l.mcc}/${l.package_id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  return [...staticPages, ...countryPages, ...groupPages, ...packagePages]
}
