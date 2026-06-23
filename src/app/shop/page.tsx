'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Search, ChevronRight, ImageIcon } from 'lucide-react'
import { useCurrency } from '@/lib/currency'
import { CountryModal } from '@/components/shop/country-modal'

interface BCCountry {
  mcc: string; name: string; continent: string; flag_url: string | null; lowest_price: number | null
}

interface GroupItem {
  name: string; continent: string; icon_url: string | null; country_code: string; lowest_price: number | null
}

interface ProductSummary {
  id: string; name: string; product_type: string; lowest_price: number | null
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
  const { format } = useCurrency()
  const searchParams = useSearchParams()
  const initialScope = (searchParams.get('scope') as ScopeTab) || 'local'
  const typeParam = searchParams.get('type') as 'esim' | 'sim' | null
  const defaultTab: 'esim' | 'sim' = typeParam === 'sim' ? 'sim' : 'esim'

  const [scopeTab, setScopeTab] = useState<ScopeTab>(initialScope)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')

  const [countries, setCountries] = useState<BCCountry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(true)
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  // 彈窗
  const [selectedItem, setSelectedItem] = useState<{ mcc: string; name: string; flag_url: string | null } | null>(null)
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  useEffect(() => {
    fetch('/api/countries').then((r) => r.json()).then(setCountries).finally(() => setLoadingLocal(false))
  }, [])

  useEffect(() => {
    if (scopeTab === 'local') return
    setLoadingGroups(true)
    fetch(`/api/shop/groups?scope=${scopeTab}`).then((r) => r.json()).then(setGroups).finally(() => setLoadingGroups(false))
  }, [scopeTab])

  const rawItems = useMemo(() => {
    // 只顯示已設定套餐（有起價）的方案；未設定套餐的不顯示
    if (scopeTab === 'local') return countries.filter(c => c.lowest_price != null).map(c => ({ id: c.mcc, name: c.name, continent: c.continent || '未歸類', icon_url: c.flag_url, lowest_price: c.lowest_price }))
    return groups.filter(g => g.lowest_price != null).map(g => ({ id: g.country_code, name: g.name, continent: g.continent || (scopeTab === 'global' ? '全球' : '未歸類'), icon_url: g.icon_url, lowest_price: g.lowest_price }))
  }, [scopeTab, countries, groups])

  const continents = useMemo(() => [...new Set(rawItems.map((c) => c.continent).filter(Boolean))].sort(), [rawItems])

  const filtered = useMemo(() => rawItems.filter((c) => {
    if (continentFilter && c.continent !== continentFilter) return false
    if (search) { const q = search.toLowerCase(); if (!c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false }
    return true
  }), [rawItems, search, continentFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const c of filtered) { const key = c.continent || '未歸類'; if (!map.has(key)) map.set(key, []); map.get(key)!.push(c) }
    return map
  }, [filtered])

  const groupKeys = useMemo(() => {
    const keys = Array.from(grouped.keys()).sort()
    return keys.filter(k => k !== '全球' && k !== '未歸類').concat(keys.filter(k => k === '全球' || k === '未歸類'))
  }, [grouped])

  async function openItem(item: { id: string; name: string; icon_url: string | null }) {
    setSelectedItem({ mcc: item.id, name: item.name, flag_url: item.icon_url })
    setProducts([])
    setProductsLoading(true)
    const res = await fetch(`/api/shop/country-products?mcc=${item.id}`)
    if (res.ok) setProducts(await res.json())
    setProductsLoading(false)
  }

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

        <div className="mt-5 flex rounded-xl overflow-hidden border border-border w-fit mx-auto">
          {(['local', 'regional', 'global'] as ScopeTab[]).map((tab) => (
            <button key={tab}
              onClick={() => { setScopeTab(tab); setContinentFilter(''); setSearch('') }}
              className={`px-6 py-2.5 text-sm font-semibold transition-colors ${scopeTab === tab ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}>
              {scopeLabels[tab]}
            </button>
          ))}
        </div>
      </div>

      {continents.length > 0 && (
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
      )}

      {(loadingLocal || loadingGroups) ? (
        <p className="mt-12 text-center text-muted-foreground">載入中...</p>
      ) : (
        <>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            共 {filtered.length} 個{scopeTab === 'local' ? '國家' : '方案'}/地區
          </p>

          <div className="mt-8 space-y-8">
            {groupKeys.map((continent) => (
              <div key={continent}>
                <h2 className="text-lg font-bold text-primary border-b border-border pb-2">{continent}</h2>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped.get(continent)!.map((item) => (
                    <button key={item.id} onClick={() => openItem(item)}
                      className="group flex items-center justify-between p-4 bg-white border border-border rounded-xl hover:border-primary hover:shadow-md transition-all text-left w-full">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border flex-shrink-0">
                          {item.icon_url ? (
                            <Image src={item.icon_url} alt={item.name} width={40} height={40} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.lowest_price ? (
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase leading-none">起價</p>
                            <p className="text-sm font-bold text-primary">{format(item.lowest_price)}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Coming Soon</p>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Search className="mx-auto w-12 h-12 text-muted-foreground/30" />
                <p className="mt-4 text-muted-foreground">找不到符合的結果</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* 方案選擇彈窗 */}
      {selectedItem && (
        <CountryModal
          country={selectedItem}
          products={products}
          loading={productsLoading}
          onClose={() => setSelectedItem(null)}
          defaultTab={defaultTab}
        />
      )}
    </div>
  )
}
