'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Package, Plus, Trash2, Pencil } from 'lucide-react'

interface CountryWithCount {
  mcc: string; name: string; continent: string; flag_url: string | null; product_count: number
}

interface RegionalProduct {
  id: string; name: string; description: string | null; scope: string; product_type: string; is_active: boolean
  _package_count?: number
}

type ScopeTab = 'local' | 'regional' | 'global'

export default function AdminProductsPage() {
  const [activeTab, setActiveTab] = useState<ScopeTab>('local')

  // Local
  const [countries, setCountries] = useState<CountryWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')

  // Regional / Global
  const [customProducts, setCustomProducts] = useState<RegionalProduct[]>([])
  const [customLoading, setCustomLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', product_type: 'esim' })

  useEffect(() => {
    fetch('/api/admin/products/countries')
      .then((r) => r.json())
      .then(setCountries)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeTab === 'local') return
    setCustomLoading(true)
    fetch(`/api/admin/products/custom?scope=${activeTab}`)
      .then((r) => r.json())
      .then(setCustomProducts)
      .finally(() => setCustomLoading(false))
  }, [activeTab])

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

  const withProducts = filtered.filter((c) => c.product_count > 0)
  const withoutProducts = filtered.filter((c) => c.product_count === 0)

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, scope: activeTab, country_code: activeTab, country_name: form.name }),
    })
    setShowCreate(false)
    setForm({ name: '', description: '', product_type: 'esim' })
    // reload
    const res = await fetch(`/api/admin/products/custom?scope=${activeTab}`)
    if (res.ok) setCustomProducts(await res.json())
  }

  async function handleDeleteCustom(id: string) {
    if (!confirm('確定刪除此方案？')) return
    await fetch('/api/admin/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const res = await fetch(`/api/admin/products/custom?scope=${activeTab}`)
    if (res.ok) setCustomProducts(await res.json())
  }

  const tabLabels: Record<ScopeTab, string> = { local: '本地', regional: '區域', global: '全球' }

  return (
    <div>
      <h1 className="text-2xl font-bold">商品管理</h1>
      <p className="mt-1 text-sm text-gray-500">管理方案並加入套餐</p>

      {/* Scope Tabs */}
      <div className="mt-6 flex rounded-lg overflow-hidden border border-border w-fit">
        {(['local', 'regional', 'global'] as ScopeTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Local Tab */}
      {activeTab === 'local' && (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="搜尋國家名稱或代碼..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <select value={continentFilter} onChange={(e) => setContinentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">全部洲別</option>
              {continents.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
            <>
              {withProducts.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">已建立方案（{withProducts.length}）</h2>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {withProducts.map((c) => <CountryCard key={c.mcc} country={c} />)}
                  </div>
                </div>
              )}
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">尚未建立方案（{withoutProducts.length}）</h2>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {withoutProducts.map((c) => <CountryCard key={c.mcc} country={c} />)}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Regional / Global Tab */}
      {(activeTab === 'regional' || activeTab === 'global') && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {activeTab === 'regional' ? '多國組合方案（如東南亞、歐洲）' : '全球方案（如全球 45 國）'}
            </p>
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" /> 新增{tabLabels[activeTab]}方案
            </button>
          </div>

          {showCreate && (
            <form onSubmit={handleCreateCustom} className="mt-4 bg-white p-6 rounded-xl border border-gray-200 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium">方案名稱</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder={activeTab === 'regional' ? '例：東南亞 10 國 eSIM' : '例：全球 45 國 eSIM'} />
                </div>
                <div>
                  <label className="text-sm font-medium">類型</label>
                  <select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="esim">eSIM</option>
                    <option value="sim">SIM 卡</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">描述（選填）</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="方案描述" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">建立</button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              </div>
            </form>
          )}

          {customLoading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : customProducts.length === 0 ? (
            <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
              <Package className="mx-auto w-12 h-12 text-gray-300" />
              <p className="mt-4 text-gray-500">尚無{tabLabels[activeTab]}方案</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {customProducts.map((p) => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{p.name}</h3>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{p.product_type}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${p.scope === 'global' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                          {p.scope === 'global' ? '全球' : '區域'}
                        </span>
                      </div>
                      {p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>}
                      <p className="mt-1 text-xs text-gray-400">{p._package_count || 0} 個套餐</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/products/_custom/${p.id}`}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100">
                        管理套餐
                      </Link>
                      <button onClick={() => handleDeleteCustom(p.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CountryCard({ country }: { country: CountryWithCount }) {
  return (
    <Link href={`/admin/products/${country.mcc}`}
      className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all">
      {country.flag_url ? (
        <Image src={country.flag_url} alt={country.name} width={32} height={24} className="rounded-full w-8 h-8 object-cover shadow-sm flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 bg-gray-100 rounded-full flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{country.name}</div>
        <div className="text-xs text-gray-400">{country.mcc} · {country.continent}</div>
      </div>
      {country.product_count > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
          <Package className="w-3 h-3" /> {country.product_count}
        </div>
      )}
    </Link>
  )
}
