'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Package } from 'lucide-react'

interface CountryWithCount {
  mcc: string
  name: string
  continent: string
  flag_url: string | null
  product_count: number
}

export default function AdminProductsPage() {
  const [countries, setCountries] = useState<CountryWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')

  useEffect(() => {
    fetch('/api/admin/products/countries')
      .then((r) => r.json())
      .then(setCountries)
      .finally(() => setLoading(false))
  }, [])

  const continents = useMemo(() => {
    return [...new Set(countries.map((c) => c.continent).filter(Boolean))].sort()
  }, [countries])

  const filtered = useMemo(() => {
    return countries.filter((c) => {
      if (continentFilter && c.continent !== continentFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !c.mcc.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [countries, search, continentFilter])

  const withProducts = filtered.filter((c) => c.product_count > 0)
  const withoutProducts = filtered.filter((c) => c.product_count === 0)

  return (
    <div>
      <h1 className="text-2xl font-bold">商品管理</h1>
      <p className="mt-1 text-sm text-gray-500">選擇國家來建立和管理商品方案</p>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜尋國家名稱或代碼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <select
          value={continentFilter}
          onChange={(e) => setContinentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">全部洲別</option>
          {continents.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">載入中...</p>
      ) : (
        <>
          {/* Countries with products */}
          {withProducts.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">已建立商品（{withProducts.length}）</h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {withProducts.map((c) => (
                  <CountryCard key={c.mcc} country={c} />
                ))}
              </div>
            </div>
          )}

          {/* Countries without products */}
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">尚未建立商品（{withoutProducts.length}）</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {withoutProducts.map((c) => (
                <CountryCard key={c.mcc} country={c} />
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="mt-8 text-center text-gray-500">找不到符合的國家，請先至「BC 同步」同步國家資料</p>
          )}
        </>
      )}
    </div>
  )
}

function CountryCard({ country }: { country: CountryWithCount }) {
  return (
    <Link
      href={`/admin/products/${country.mcc}`}
      className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
    >
      {country.flag_url ? (
        <Image src={country.flag_url} alt={country.name} width={32} height={24} className="rounded shadow-sm flex-shrink-0" />
      ) : (
        <div className="w-8 h-6 bg-gray-100 rounded flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{country.name}</div>
        <div className="text-xs text-gray-400">{country.mcc} · {country.continent}</div>
      </div>
      {country.product_count > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
          <Package className="w-3 h-3" />
          {country.product_count}
        </div>
      )}
    </Link>
  )
}
