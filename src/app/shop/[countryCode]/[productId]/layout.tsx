import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flesim.com'

interface Props {
  params: Promise<{ countryCode: string; productId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode, productId } = await params
  const supabase = createAdminClient()

  const [{ data: pkg }, { data: country }] = await Promise.all([
    supabase.from('packages').select('name, description, product_type').eq('id', productId).single(),
    supabase.from('bc_countries').select('name, name_zh').eq('mcc', countryCode).single(),
  ])

  const countryName = country?.name_zh || country?.name || countryCode
  const pkgName = pkg?.name || '上網方案'
  const title = `${pkgName} — ${countryName}`
  const desc = pkg?.description || `${countryName} ${pkg?.product_type === 'sim' ? 'SIM 卡' : 'eSIM'} 上網方案，多種流量天數可選。`

  // 取最低價
  const { data: plans } = await supabase.from('package_plans').select('id').eq('package_id', productId)
  const planIds = (plans || []).map((p) => p.id)
  let lowestPrice: number | null = null
  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('package_plan_prices').select('sell_price').in('package_plan_id', planIds).gt('sell_price', 0).order('sell_price').limit(1)
    lowestPrice = prices?.[0]?.sell_price || null
  }

  return {
    title,
    description: desc,
    openGraph: {
      title: `${title} | FLESIM`,
      description: desc,
      type: 'website',
      url: `${BASE_URL}/shop/${countryCode}/${productId}`,
    },
    twitter: { card: 'summary', title, description: desc },
    other: lowestPrice ? {
      // JSON-LD 結構化資料（放在 other 中，由 layout 渲染）
      'product:price:amount': String(lowestPrice),
      'product:price:currency': 'TWD',
    } : {},
  }
}

export default function ProductLayout({ children, params }: { children: React.ReactNode; params: Promise<{ countryCode: string; productId: string }> }) {
  return (
    <>
      <ProductJsonLd params={params} />
      {children}
    </>
  )
}

// JSON-LD 結構化資料（Server Component）
async function ProductJsonLd({ params }: { params: Promise<{ countryCode: string; productId: string }> }) {
  const { countryCode, productId } = await params
  const supabase = createAdminClient()

  const [{ data: pkg }, { data: country }] = await Promise.all([
    supabase.from('packages').select('name, description, product_type').eq('id', productId).single(),
    supabase.from('bc_countries').select('name, name_zh, flag_url').eq('mcc', countryCode).single(),
  ])

  if (!pkg) return null

  const countryName = country?.name_zh || country?.name || countryCode

  // 取最低價
  const { data: plans } = await supabase.from('package_plans').select('id').eq('package_id', productId)
  const planIds = (plans || []).map((p) => p.id)
  let lowestPrice: number | null = null
  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('package_plan_prices').select('sell_price').in('package_plan_id', planIds).gt('sell_price', 0).order('sell_price').limit(1)
    lowestPrice = prices?.[0]?.sell_price || null
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${pkg.name} — ${countryName}`,
    description: pkg.description || `${countryName} ${pkg.product_type === 'sim' ? 'SIM 卡' : 'eSIM'} 上網方案`,
    image: country?.flag_url || undefined,
    brand: { '@type': 'Brand', name: 'FLESIM' },
    offers: lowestPrice ? {
      '@type': 'Offer',
      priceCurrency: 'TWD',
      price: lowestPrice,
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/shop/${countryCode}/${productId}`,
    } : undefined,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
