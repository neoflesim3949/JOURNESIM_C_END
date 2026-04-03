'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Search, ChevronRight, ImageIcon } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface BCCountry {
  mcc: string; name: string; continent: string; flag_url: string | null; lowest_price: number | null
}

interface GroupItem {
  name: string; icon_url: string | null; country_code: string; lowest_price: number | null
}

type ScopeTab = 'local' | 'regional' | 'global'

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>}>
      <ShopContent />
    </Suspense>
  )
}

function ShopContent() {
  const searchParams = useSearchParams()
  const initialScope = (searchParams.get('scope') as ScopeTab) || 'local'

  const [scopeTab, setScopeTab] = useState<ScopeTab>(initialScope)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')

  // Local
  const [countries, setCountries] = useState<BCCountry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(true)

  // Regional / Global
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  useEffect(() => {
    fetch('/api/countries')
      .then((r) => r.json())
      .then(setCountries)
      .finally(() => setLoadingLocal(false))
  }, [])

  useEffect(() => {
    if (scopeTab === 'local') return
    setLoadingGroups(true)
    fetch(`/api/shop/groups?scope=${scopeTab}`)
      .then((r) => r.json())
      .then(setGroups)
      .finally(() => setLoadingGroups(false))
  }, [scopeTab])

  const continents = useMemo(() =>
    [...new Set(countries.map((c) => c.continent).filter(Boolean))].sort(), [countries])

  const filtered = useMemo(() =>
    countries.filter((c) => {
      if (continentFilter && c.continent !== continentFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !c.mcc.toLowerCase().includes(q)) return false
      }
      return true
    }), [countries, search, continentFilter])

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

  const filteredGroups = useMemo(() => {
    if (!search) return groups
    const q = search.toLowerCase()
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, search])

  const scopeLabels: Record<ScopeTab, string> = { local: '本地', regional: '區域', global: '全球' }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold">選擇目的地</h1>
        <p className="mt-2 text-muted-foreground">搜尋你要前往的國家或地區</p>

        <div className="mt-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input type="text" placeholder="搜尋國家名稱" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>

        {/* Scope Tabs */}
        <div className="mt-5 flex rounded-xl overflow-hidden border border-border w-fit mx-auto">
          {(['local', 'regional', 'global'] as ScopeTab[]).map((tab) => (
            <button key={tab}
              onClick={() => { setScopeTab(tab); setContinentFilter(''); setSearch('') }}
              className={`px-6 py-2.5 text-sm font-semibold transition-colors ${
                scopeTab === tab ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'
              }`}>
              {scopeLabels[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Local Tab */}
      {scopeTab === 'local' && (
        <>
          {/* Continent Filter */}
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            <button onClick={() => setContinentFilter('')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${!continentFilter ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-border'}`}>
              全部
            </button>
            {continents.map((c) => (
              <button key={c} onClick={() => setContinentFilter(c)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${continentFilter === c ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-border'}`}>
                {c}
              </button>
            ))}
          </div>

          {loadingLocal ? (
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
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {grouped.get(continent)!.map((country) => (
                        <Link key={country.mcc} href={`/shop/${country.mcc}`}
                          className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:shadow-sm transition-all">
                          <div className="flex items-center gap-3">
                            {country.flag_url ? (
                              <Image src={country.flag_url} alt={country.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover shadow-sm flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded-full flex-shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold">{country.name}</div>
                              {country.lowest_price && country.lowest_price > 0 && (
                                <div className="text-xs text-muted-foreground">起價 {formatPrice(country.lowest_price)}</div>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        </Link>
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
        </>
      )}

      {/* Regional / Global Tab */}
      {(scopeTab === 'regional' || scopeTab === 'global') && (
        loadingGroups ? (
          <p className="mt-12 text-center text-muted-foreground">載入中...</p>
        ) : filteredGroups.length === 0 ? (
          <div className="mt-12 text-center text-muted-foreground">
            尚無{scopeLabels[scopeTab]}方案
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredGroups.map((g) => (
              <Link key={g.country_code} href={`/shop/${g.country_code}`}
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  {g.icon_url ? (
                    <Image src={g.icon_url} alt={g.name} width={40} height={40} className="w-10 h-10 rounded-lg object-cover shadow-sm flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    {g.lowest_price && g.lowest_price > 0 && (
                      <div className="text-xs text-muted-foreground">起價 {formatPrice(g.lowest_price)}</div>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
