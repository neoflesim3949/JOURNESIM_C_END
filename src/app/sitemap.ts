import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flesim.com'

// Vercel build 階段不預先產生 sitemap（避免 60s 逾時）
// 改為 runtime 生成 + 1 小時快取
export const dynamic = 'force-dynamic'
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient()

  // 靜態頁面
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/guide`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ]

  // 並行查詢，避免序列等待造成 build 逾時
  const [countriesRes, groupsRes, linksRes, packagesRes] = await Promise.all([
    supabase.from('bc_countries').select('mcc, scope').or('scope.eq.local,scope.is.null'),
    supabase.from('bc_countries').select('mcc').in('scope', ['regional', 'global']),
    supabase.from('country_packages').select('mcc, package_id'),
    supabase.from('packages').select('id').eq('is_active', true),
  ])

  const countryPages: MetadataRoute.Sitemap = (countriesRes.data || []).map((c) => ({
    url: `${BASE_URL}/shop/${c.mcc}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const groupPages: MetadataRoute.Sitemap = (groupsRes.data || []).map((g) => ({
    url: `${BASE_URL}/shop/${g.mcc}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const activeIds = new Set((packagesRes.data || []).map((p) => p.id))
  const packagePages: MetadataRoute.Sitemap = (linksRes.data || [])
    .filter((l) => activeIds.has(l.package_id))
    .map((l) => ({
      url: `${BASE_URL}/shop/${l.mcc}/${l.package_id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  return [...staticPages, ...countryPages, ...groupPages, ...packagePages]
}
