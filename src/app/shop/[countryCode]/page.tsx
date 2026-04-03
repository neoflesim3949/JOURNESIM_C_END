'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ChevronRight, ImageIcon } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface CountryInfo {
  name: string; continent?: string; flag_url: string | null; icon_url?: string | null
}

interface PackageSummary {
  id: string; name: string; description: string | null; product_type: string; lowest_price: number | null
}

export default function CountryPage() {
  const { countryCode } = useParams() as { countryCode: string }
  const [info, setInfo] = useState<CountryInfo | null>(null)
  const [packages, setPackages] = useState<PackageSummary[]>([])
  const [loading, setLoading] = useState(true)

  const isCustomGroup = countryCode.startsWith('regional_') || countryCode.startsWith('global_')

  useEffect(() => {
    async function load() {
      if (isCustomGroup) {
        // 區域/全球方案：從 products 取資訊
        const scope = countryCode.startsWith('global_') ? 'global' : 'regional'
        const [groupsRes, pkgRes] = await Promise.all([
          fetch(`/api/shop/groups?scope=${scope}`).then((r) => r.json()),
          fetch(`/api/shop/country-products?mcc=${countryCode}`).then((r) => r.json()),
        ])
        const group = (groupsRes as { name: string; icon_url: string | null; country_code: string }[])
          .find((g) => g.country_code === countryCode)
        if (group) {
          setInfo({ name: group.name, icon_url: group.icon_url, flag_url: null })
        }
        setPackages(pkgRes)
      } else {
        // 本地方案
        const [countryRes, pkgRes] = await Promise.all([
          fetch(`/api/countries`).then((r) => r.json()),
          fetch(`/api/shop/country-products?mcc=${countryCode}`).then((r) => r.json()),
        ])
        const c = (countryRes as { mcc: string; name: string; continent: string; flag_url: string | null }[])
          .find((c) => c.mcc === countryCode)
        if (c) setInfo({ name: c.name, continent: c.continent, flag_url: c.flag_url })
        setPackages(pkgRes)
      }
      setLoading(false)
    }
    load()
  }, [countryCode, isCustomGroup])

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  if (!info) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">找不到此國家</h1>
        <Link href="/shop" className="mt-4 inline-block text-primary hover:underline">&larr; 返回</Link>
      </div>
    )
  }

  const displayImage = info.flag_url || info.icon_url

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回選擇目的地
      </Link>

      <div className="mt-6 flex items-center gap-4">
        {displayImage ? (
          <Image src={displayImage} alt={info.name} width={64} height={48}
            className={`shadow ${isCustomGroup ? 'rounded-lg w-16 h-12 object-cover' : 'rounded'}`} />
        ) : (
          <div className="w-16 h-12 bg-muted rounded-lg flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{info.name}</h1>
          {info.continent && <p className="text-muted-foreground">{info.continent}</p>}
        </div>
      </div>

      <div className="mt-8">
        {packages.length === 0 ? (
          <div className="text-center py-16 bg-muted rounded-xl">
            <p className="text-muted-foreground">尚無上架套餐</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <Link key={pkg.id} href={`/shop/${countryCode}/${pkg.id}`}
                className="flex items-center justify-between p-5 border border-border rounded-xl hover:border-primary hover:shadow-sm transition-all">
                <div>
                  <div className="text-lg font-semibold">{pkg.name}</div>
                  {pkg.description && <div className="text-sm text-muted-foreground mt-0.5">{pkg.description}</div>}
                  {pkg.lowest_price && pkg.lowest_price > 0 && (
                    <div className="text-sm text-muted-foreground mt-1">起價 {formatPrice(pkg.lowest_price)}</div>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
