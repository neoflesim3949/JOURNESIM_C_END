'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Package, Plus, Trash2, Pencil, ImageIcon } from 'lucide-react'

interface CountryGroup {
  mcc: string
  name: string
  continent?: string | null
  flag_url?: string | null
  icon_url?: string | null
  scope: string
  product_count: number
}

type ScopeTab = 'local' | 'regional' | 'global'

export default function AdminProductsPage() {
  const [activeTab, setActiveTab] = useState<ScopeTab>('local')

  const [countries, setCountries] = useState<CountryGroup[]>([])
  const [loading, setLoading] = useState(true)
  
  // Local 專用搜尋
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')

  // Regional / Global 專用表單
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '' })
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', icon_url: '', new_mcc: '' })

  const loadData = (scope: ScopeTab) => {
    setLoading(true)
    fetch(`/api/admin/products/countries?scope=${scope}`)
      .then((r) => r.json())
      .then(setCountries)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData(activeTab)
  }, [activeTab])

  // --- Local 邏輯 ---
  const continents = useMemo(() =>
    [...new Set(countries.map((c) => c.continent).filter(Boolean))].sort(), [countries])

  const filteredLocal = useMemo(() =>
    countries.filter((c) => {
      if (continentFilter && c.continent !== continentFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !c.mcc.toLowerCase().includes(q)) return false
      }
      return true
    }), [countries, search, continentFilter])

  const withProducts = filteredLocal.filter((c) => c.product_count > 0)
  const withoutProducts = filteredLocal.filter((c) => c.product_count === 0)

  // --- Regional / Global 邏輯 ---
  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    const isGlobal = activeTab === 'global'
    const newMcc = `${isGlobal ? 'global' : 'regional'}_${Date.now()}`
    
    await fetch('/api/admin/bc_countries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, scope: activeTab, mcc: newMcc }),
    })
    
    setShowCreate(false)
    setForm({ name: '' })
    loadData(activeTab)
  }

  async function handleDeleteGroup(mcc: string) {
    if (!confirm('確定刪除此分組及其下所有綁定？\n注意：這會連帶影響原本在「綜合業務儀表盤」或已產生的訂單資訊匹配。')) return
    
    await fetch(`/api/admin/bc_countries?mcc=${mcc}`, { method: 'DELETE' })
    loadData(activeTab)
  }

  async function handleEditGroup(mcc: string) {
    await fetch('/api/admin/bc_countries', {
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcc,
        name: editForm.name,
        icon_url: editForm.icon_url || null,
        new_mcc: editForm.new_mcc || mcc
      }),
    })
    
    setEditingGroup(null)
    loadData(activeTab)
  }

  const tabLabels: Record<ScopeTab, string> = { local: '本地', regional: '區域', global: '全球' }

  return (
    <div>
      <h1 className="text-2xl font-bold">商品管理</h1>
      <p className="mt-1 text-sm text-gray-500">管理國家方案並加入套餐</p>

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
              <input type="text" placeholder="搜尋國家名稱或 MCC..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <select value={continentFilter} onChange={(e) => setContinentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">全部洲別</option>
              {continents.map((c) => <option key={c as string} value={c as string}>{c}</option>)}
            </select>
          </div>

          {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
            <>
              {withProducts.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">有設定商品的國家（{withProducts.length}）</h2>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {withProducts.map((c) => <CountryCard key={c.mcc} country={c} />)}
                  </div>
                </div>
              )}
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">尚未設定商品的國家（{withoutProducts.length}）</h2>
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
              {activeTab === 'regional' ? '多國組合分組（如東南亞、歐洲，對接多國 BC 商品）' : '全球方案分組（對接全球聯網 BC 商品）'}
            </p>
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" /> 新增{activeTab === 'regional' ? '區域' : '全球'}分組
            </button>
          </div>

          {showCreate && (
            <form onSubmit={handleCreateGroup} className="mt-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <div>
                <label className="text-sm font-medium">{activeTab === 'regional' ? '區域名稱' : '全球分類名稱'}</label>
                <input required value={form.name} onChange={(e) => setForm({ name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                  placeholder={activeTab === 'regional' ? '例：東南亞五國、新馬泰' : '例：全球 80 國方案'} autoFocus />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">建立分組</button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 text-gray-700">取消</button>
              </div>
            </form>
          )}

          {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : countries.length === 0 ? (
            <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
              <Package className="mx-auto w-12 h-12 text-gray-300" />
              <p className="mt-4 text-gray-500">尚無{tabLabels[activeTab]}分組</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              {countries.map((group) => {
                const isEditing = editingGroup === group.mcc
                const displayImg = group.icon_url || group.flag_url

                return isEditing ? (
                  <div key={group.mcc} className="p-5 bg-blue-50/50 border border-blue-300 rounded-xl space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-600">外顯分組名稱</label>
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">內部 MCC (通常不需更改)</label>
                        <input value={editForm.new_mcc} onChange={(e) => setEditForm({ ...editForm, new_mcc: e.target.value })}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono text-gray-600" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">自訂圖示 URL</label>
                        <div className="mt-1 flex items-center gap-2">
                          <input value={editForm.icon_url} onChange={(e) => setEditForm({ ...editForm, icon_url: e.target.value })}
                            placeholder="https://..." className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500" />
                          {editForm.icon_url && <Image src={editForm.icon_url} alt="" width={32} height={32} className="rounded w-8 h-8 object-cover border bg-white" />}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEditGroup(group.mcc)}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">儲存</button>
                      <button onClick={() => setEditingGroup(null)}
                        className="px-4 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 text-gray-700">取消</button>
                    </div>
                  </div>
                ) : (
                  <div key={group.mcc} className="group relative flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all gap-4">
                    <Link href={`/admin/products/${group.mcc}`} className="flex items-center gap-4 flex-1 min-w-0">
                      {displayImg ? (
                        <Image src={displayImg} alt={group.name} width={48} height={48} className="rounded-xl w-12 h-12 object-cover shadow-sm bg-gray-50 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0 border border-gray-200/60">
                          <ImageIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{group.name}</h3>
                          <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${activeTab === 'global' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                            {activeTab === 'global' ? '全球' : '區域'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 font-mono flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-gray-400" /> {group.product_count} 個組合
                          <span className="text-gray-300">|</span> 
                          <span className="truncate">{group.mcc}</span>
                        </p>
                      </div>
                    </Link>
                    
                    <div className="flex items-center gap-2 sm:ml-auto">
                      <button onClick={() => { setEditingGroup(group.mcc); setEditForm({ name: group.name, icon_url: group.icon_url || '', new_mcc: group.mcc }) }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="編輯分組資訊">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteGroup(group.mcc)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="刪除此分組">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link href={`/admin/products/${group.mcc}`} className="ml-2 px-4 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-200 shrink-0">
                        管理商品
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CountryCard({ country }: { country: CountryGroup }) {
  const displayImg = country.icon_url || country.flag_url
  
  return (
    <Link href={`/admin/products/${country.mcc}`}
      className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
      {displayImg ? (
        <Image src={displayImg} alt={country.name} width={32} height={32} className="rounded-full w-8 h-8 object-cover shadow-sm shrink-0 bg-gray-50" />
      ) : (
        <div className="w-8 h-8 bg-gray-100 rounded-full shrink-0 border border-gray-200" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800 group-hover:text-blue-700 transition-colors truncate">{country.name}</div>
        <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">{country.mcc} · {country.continent}</div>
      </div>
      {country.product_count > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/80 text-blue-700 border border-blue-100 rounded-md text-xs font-semibold ml-2">
          <Package className="w-3.5 h-3.5" />
          <span>{country.product_count}</span>
        </div>
      )}
    </Link>
  )
}
