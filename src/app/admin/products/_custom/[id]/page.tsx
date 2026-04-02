'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Package, X, Search } from 'lucide-react'

interface PkgInfo { id: string; name: string; product_type: string; is_active: boolean; _plan_count?: number }
interface Product { id: string; name: string; description: string | null; scope: string; product_type: string; country_code: string; country_name: string }

export default function CustomGroupPage() {
  const { id } = useParams() as { id: string } // id = country_code (e.g. "southeast_asia")
  const [groupName, setGroupName] = useState('')
  const [scope, setScope] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [allPackages, setAllPackages] = useState<PkgInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', product_type: 'esim' })
  const [showAddPkg, setShowAddPkg] = useState<string | null>(null)
  const [pkgSearch, setPkgSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PkgInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [productPackages, setProductPackages] = useState<Map<string, PkgInfo[]>>(new Map())

  async function loadData() {
    const [customRes, packagesRes] = await Promise.all([
      fetch(`/api/admin/products/custom?scope=all&group=${encodeURIComponent(id)}`).then((r) => r.json()),
      fetch('/api/admin/packages').then((r) => r.json()),
    ])
    const prods = Array.isArray(customRes) ? customRes : []
    setProducts(prods)
    setAllPackages(packagesRes || [])
    if (prods.length > 0) { setGroupName(prods[0].country_name); setScope(prods[0].scope) }

    const pkgMap = new Map<string, PkgInfo[]>()
    for (const p of prods) {
      const res = await fetch(`/api/admin/products/custom/${p.id}/packages`)
      if (res.ok) pkgMap.set(p.id, await res.json())
    }
    setProductPackages(pkgMap)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, scope: scope || 'regional', country_code: id, country_name: groupName }),
    })
    setShowCreate(false); setForm({ name: '', description: '', product_type: 'esim' }); await loadData()
  }

  async function handleDelete(pid: string) {
    if (!confirm('確定刪除？')) return
    await fetch('/api/admin/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pid }) })
    await loadData()
  }

  async function handleAddPackage(pid: string, pkgId: string) {
    await fetch(`/api/admin/products/custom/${pid}/packages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package_id: pkgId }) })
    setShowAddPkg(null); await loadData()
  }

  async function handleRemovePackage(pid: string, pkgId: string) {
    if (!confirm('確定移除？')) return
    await fetch(`/api/admin/products/custom/${pid}/packages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package_id: pkgId }) })
    await loadData()
  }

  async function handleSearchPkgs(q: string) {
    setPkgSearch(q)
    if (q.length < 1) { setSearchResults(allPackages); return }
    setSearching(true)
    const res = await fetch(`/api/admin/packages/search?q=${encodeURIComponent(q)}`)
    if (res.ok) setSearchResults(await res.json())
    setSearching(false)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回方案管理
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{groupName || id}</h1>
          <p className="text-sm text-gray-500">{scope === 'global' ? '全球' : '區域'} · {products.length} 個方案</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> 新增方案
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 bg-white p-6 rounded-xl border border-gray-200 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">方案名稱</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={`例：${groupName} eSIM`} />
            </div>
            <div>
              <label className="text-sm font-medium">類型</label>
              <select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="esim">eSIM</option><option value="sim">SIM 卡</option>
              </select>
            </div>
          </div>
          <div><label className="text-sm font-medium">描述（選填）</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="方案描述" /></div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">建立</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
          </div>
        </form>
      )}

      {products.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無方案，點擊「新增方案」開始建立</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {products.map((p) => {
            const pkgs = productPackages.get(p.id) || []
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{p.name}</h3>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{p.product_type}</span>
                    </div>
                    {p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>}
                  </div>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">已加入的套餐（{pkgs.length}）</span>
                    <button onClick={() => { setShowAddPkg(p.id); setPkgSearch('') }}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded hover:bg-blue-100">
                      <Plus className="w-3 h-3" /> 加入套餐
                    </button>
                  </div>
                  {pkgs.length === 0 ? <p className="text-xs text-gray-400">尚未加入套餐</p> : (
                    <div className="space-y-1">
                      {pkgs.map((pkg) => (
                        <div key={pkg.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium">{pkg.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/packages/${pkg.id}`} className="text-xs text-gray-400 hover:text-blue-600">查看</Link>
                            <button onClick={() => handleRemovePackage(p.id, pkg.id)} className="text-xs text-red-400 hover:text-red-600">移除</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAddPkg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddPkg(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[60vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">加入套餐</h2>
              <button onClick={() => setShowAddPkg(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={pkgSearch} onChange={(e) => handleSearchPkgs(e.target.value)}
                  placeholder="搜尋套餐名稱或國家代碼..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const curPkgs = productPackages.get(showAddPkg) || []
                const curIds = new Set(curPkgs.map((p) => p.id))
                const avail = (pkgSearch ? searchResults : allPackages).filter((pkg) => !curIds.has(pkg.id))
                return searching ? <p className="text-sm text-gray-500 text-center py-4">搜尋中...</p>
                  : avail.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">找不到可加入的套餐</p>
                  : <div className="space-y-2">{avail.map((pkg) => (
                    <button key={pkg.id} onClick={() => handleAddPackage(showAddPkg, pkg.id)}
                      className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 text-left">
                      <div><div className="text-sm font-medium">{pkg.name}</div><div className="text-xs text-gray-400">{pkg.product_type}</div></div>
                      <Plus className="w-4 h-4 text-blue-500" />
                    </button>
                  ))}</div>
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
