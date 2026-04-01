'use client'

import { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { Search } from 'lucide-react'
import { CountryModal } from '@/components/shop/country-modal'

interface BCCountry {
  mcc: string
  name: string
  continent: string
  flag_url: string | null
}

interface ProductSummary {
  id: string
  name: string
  product_type: string
  lowest_price: number | null
}

export default function ShopPage() {
  const [countries, setCountries] = useState<BCCountry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')

  // Modal
  const [selectedCountry, setSelectedCountry] = useState<BCCountry | null>(null)
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  useEffect(() => {
    fetch('/api/countries')
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

  const grouped = useMemo(() => {
    const map = new Map<string, BCCountry[]>()
    for (const c of filtered) {
      const key = c.continent || '其他'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return map
  }, [filtered])

  const groupKeys = useMemo(() => Array.from(grouped.keys()).sort(), [grouped])

  async function openCountry(country: BCCountry) {
    setSelectedCountry(country)
    setProducts([])
    setProductsLoading(true)
    const res = await fetch(`/api/shop/country-products?mcc=${country.mcc}`)
    if (res.ok) setProducts(await res.json())
    setProductsLoading(false)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold">選擇目的地</h1>
        <p className="mt-2 text-muted-foreground">搜尋你要前往的國家或地區</p>

        <div className="mt-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜尋國家名稱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* Continent Filter */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => setContinentFilter('')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !continentFilter ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-border'
          }`}
        >
          全部
        </button>
        {continents.map((c) => (
          <button
            key={c}
            onClick={() => setContinentFilter(c)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              continentFilter === c ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-border'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-12 text-center text-muted-foreground">載入中...</p>
      ) : (
        <>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            共 {filtered.length} 個國家/地區
          </p>

          <div className="mt-8 space-y-8">
            {groupKeys.map((continent) => (
              <div key={continent}>
                <h2 className="text-lg font-bold text-primary border-b border-border pb-2">{continent}</h2>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {grouped.get(continent)!.map((country) => (
                    <button
                      key={country.mcc}
                      onClick={() => openCountry(country)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:shadow-sm transition-all text-left"
                    >
                      {country.flag_url ? (
                        <Image src={country.flag_url} alt={country.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover shadow-sm flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 bg-muted rounded-full flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{country.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="mt-12 text-center text-muted-foreground">找不到符合的國家</div>
          )}
        </>
      )}

      {/* Country Modal */}
      {selectedCountry && (
        <CountryModal
          country={selectedCountry}
          products={products}
          loading={productsLoading}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  )
}
