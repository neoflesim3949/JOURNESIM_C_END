'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
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
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type') as 'esim' | 'sim' | null

  const [info, setInfo] = useState<CountryInfo | null>(null)
  const [packages, setPackages] = useState<PackageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isGroup, setIsGroup] = useState(false)
  const [activeTab, setActiveTab] = useState<'esim' | 'sim'>(typeParam || 'esim')

  useEffect(() => {
    async function load() {
      try {
        const [infoRes, pkgRes] = await Promise.all([
          fetch(`/api/shop/info?mcc=${countryCode}`).then((r) => r.json()),
          fetch(`/api/shop/country-products?mcc=${countryCode}`).then((r) => r.json()),
        ])
        if (infoRes && !infoRes.error) { setInfo(infoRes); setIsGroup(!!infoRes.is_group) }
        setPackages(Array.isArray(pkgRes) ? pkgRes : [])
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    load()
  }, [countryCode])

  const esimPackages = useMemo(() => packages.filter((p) => p.product_type === 'esim'), [packages])
  const simPackages = useMemo(() => packages.filter((p) => p.product_type === 'sim'), [packages])
  const displayPackages = activeTab === 'esim' ? esimPackages : simPackages

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
          <Image src={displayImage} alt={info.name} width={64} height={64}
            className="w-16 h-16 rounded-full object-cover shadow" />
        ) : (
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{info.name}</h1>
          {info.continent && <p className="text-muted-foreground">{info.continent}</p>}
        </div>
      </div>

      {/* eSIM / SIM Tab */}
      <div className="mt-6 flex rounded-xl overflow-hidden border border-border w-fit">
        <button onClick={() => setActiveTab('esim')}
          className={`px-6 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'esim' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}>
          eSIM
        </button>
        <button onClick={() => setActiveTab('sim')}
          className={`px-6 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'sim' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}>
          SIM 卡
        </button>
      </div>

      <div className="mt-6">
        {displayPackages.length === 0 ? (
          <div className="text-center py-16 bg-muted rounded-xl">
            <p className="text-muted-foreground">暫無{activeTab === 'esim' ? 'eSIM' : 'SIM 卡'}方案</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayPackages.map((pkg) => (
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
