'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface Country {
  mcc: string; name: string; continent: string; flag_url: string | null
}

interface PackageSummary {
  id: string; name: string; description: string | null; product_type: string; lowest_price: number | null
}

export default function CountryPage() {
  const { countryCode } = useParams() as { countryCode: string }
  const [country, setCountry] = useState<Country | null>(null)
  const [packages, setPackages] = useState<PackageSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [countryRes, pkgRes] = await Promise.all([
        fetch(`/api/countries`).then((r) => r.json()),
        fetch(`/api/shop/country-products?mcc=${countryCode}`).then((r) => r.json()),
      ])
      const c = (countryRes as Country[]).find((c) => c.mcc === countryCode)
      setCountry(c || null)
      setPackages(pkgRes)
      setLoading(false)
    }
    load()
  }, [countryCode])

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  if (!country) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">找不到此國家</h1>
        <Link href="/shop" className="mt-4 inline-block text-primary hover:underline">&larr; 返回國家列表</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回國家列表
      </Link>

      <div className="mt-6 flex items-center gap-4">
        {country.flag_url ? (
          <Image src={country.flag_url} alt={country.name} width={64} height={48} className="rounded shadow" />
        ) : (
          <div className="w-16 h-12 bg-muted rounded" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{country.name}</h1>
          <p className="text-muted-foreground">{country.continent}</p>
        </div>
      </div>

      <div className="mt-8">
        {packages.length === 0 ? (
          <div className="text-center py-16 bg-muted rounded-xl">
            <p className="text-muted-foreground">此國家尚無上架套餐</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <Link
                key={pkg.id}
                href={`/shop/${countryCode}/${pkg.id}`}
                className="flex items-center justify-between p-5 border border-border rounded-xl hover:border-primary hover:shadow-sm transition-all"
              >
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
