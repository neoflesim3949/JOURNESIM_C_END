import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const supabase = createAdminClient()

  const { data: country } = await supabase
    .from('bc_countries')
    .select('name, name_zh')
    .eq('mcc', countryCode)
    .single()

  const name = country?.name_zh || country?.name || countryCode

  return {
    title: `${name} eSIM / SIM 卡上網方案`,
    description: `${name}旅遊上網方案，eSIM 即買即用、SIM 卡宅配到府。多種流量天數選擇，最低價格一覽。`,
    openGraph: {
      title: `${name} eSIM / SIM 卡 — FLESIM`,
      description: `${name}旅遊上網方案，eSIM 即買即用、SIM 卡宅配到府。`,
    },
  }
}

export default function CountryLayout({ children }: { children: React.ReactNode }) {
  return children
}
