'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Plus, Trash2, Package, X, Search, Zap } from 'lucide-react'

interface Country { mcc: string; name: string; continent: string; flag_url: string | null }
interface PkgInfo { id: string; name: string; description: string | null; product_type: string; is_active: boolean; _plan_count?: number }

export default function AdminCountryProductsPage() {
  const { mcc } = useParams() as { mcc: string }
  const [country, setCountry] = useState<Country | null>(null)
  const [linkedPackages, setLinkedPackages] = useState<PkgInfo[]>([])
  const [allPackages, setAllPackages] = useState<PkgInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddPkg, setShowAddPkg] = useState(false)
  const [pkgSearch, setPkgSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PkgInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)

  // 這個國家用一個隱藏的 product 作為方案載體
  const [productId, setProductId] = useState<string | null>(null)

  async function loadData() {
    const [countryRes, packagesRes] = await Promise.all([
      fetch(`/api/admin/products/countries/${mcc}`).then((r) => r.json()),
      fetch('/api/admin/packages').then((r) => r.json()),
    ])
    setCountry(countryRes.country)
    setAllPackages(packagesRes || [])

    // 取得或建立此國家的方案
    const products = countryRes.products || []
    let pid = products[0]?.id || null

    if (!pid) {
      // 自動建立一個方案
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: countryRes.country?.name || mcc, country_code: mcc, country_name: countryRes.country?.name || '', product_type: 'esim' }),
      })
      if (res.ok) {
        const newProduct = await res.json()
        pid = newProduct.id
      }
    }
    setProductId(pid)

    // 取得已加入的套餐
    if (pid) {
      const pkgsRes = await fetch(`/api/admin/products/countries/${mcc}/packages`).then((r) => r.json())
      const match = Array.isArray(pkgsRes) ? pkgsRes.find((p: { id: string }) => p.id === pid) : null
      setLinkedPackages(match?.packages || [])
    }

    setLoading(false)
  }

  useEffect(() => { loadData() }, [mcc])

  async function handleAddPackage(packageId: string) {
    if (!productId) return
    await fetch(`/api/admin/products/countries/${mcc}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, package_id: packageId }),
    })
    setShowAddPkg(false)
    await loadData()
  }

  async function handleRemovePackage(packageId: string) {
    if (!productId) return
    if (!confirm('確定移除此方案？')) return
    await fetch(`/api/admin/products/countries/${mcc}/packages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, package_id: packageId }),
    })
    await loadData()
  }

  async function handleQuickAdd() {
    if (!productId) return
    setQuickLoading(true)

    // 用 MCC 代碼查詢含有此國家的套餐
    const res = await fetch(`/api/admin/products/countries/${mcc}/quick-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId }),
    })
    const data = await res.json()

    setQuickLoading(false)
    if (data.added === 0) {
      alert(`沒有找到覆蓋 ${mcc} 的套餐`)
    }
    await loadData()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  const linkedIds = new Set(linkedPackages.map((p) => p.id))

  async function handleSearchPkgs(query: string) {
    setPkgSearch(query)
    if (query.length < 1) { setSearchResults(allPackages); return }
    setSearching(true)
    const res = await fetch(`/api/admin/packages/search?q=${encodeURIComponent(query)}`)
    if (res.ok) setSearchResults(await res.json())
    setSearching(false)
  }

  const availablePackages = (pkgSearch ? searchResults : allPackages).filter((pkg) => !linkedIds.has(pkg.id))

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回國家列表
      </Link>

      {/* Country Header */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {country?.flag_url ? <Image src={country.flag_url} alt={country.name} width={48} height={36} className="rounded shadow" /> : <div className="w-12 h-9 bg-gray-100 rounded" />}
          <div>
            <h1 className="text-2xl font-bold">{country?.name || mcc}</h1>
            <p className="text-sm text-gray-500">{country?.continent} · {mcc}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleQuickAdd} disabled={quickLoading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <Zap className="w-4 h-4" /> {quickLoading ? '加入中...' : '快捷加入'}
          </button>
          <button onClick={() => { setShowAddPkg(true); setPkgSearch('') }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 加入方案
          </button>
        </div>
      </div>

      {/* Linked Packages */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-500">已加入的方案（{linkedPackages.length}）</h2>

        {linkedPackages.length === 0 ? (
          <div className="mt-4 text-center py-16 bg-white rounded-xl border border-gray-200">
            <Package className="mx-auto w-12 h-12 text-gray-300" />
            <p className="mt-4 text-gray-500">尚未加入方案</p>
            <p className="mt-1 text-xs text-gray-400">請先到「套餐管理」建立套餐，再回來加入</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {linkedPackages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="font-semibold">{pkg.name}</div>
                    <div className="text-xs text-gray-400">
                      {pkg.product_type} · {pkg._plan_count || 0} 個 BC 商品
                      {pkg.description && ` · ${pkg.description}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/packages/${pkg.id}`}
                    className="px-3 py-1.5 bg-gray-50 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100">
                    查看套餐
                  </Link>
                  <button onClick={() => handleRemovePackage(pkg.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Package Modal */}
      {showAddPkg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddPkg(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[60vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">加入方案</h2>
              <button onClick={() => setShowAddPkg(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={pkgSearch} onChange={(e) => handleSearchPkgs(e.target.value)}
                  placeholder="搜尋套餐名稱或國家代碼（如 CN、JP）..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {searching ? (
                <p className="text-sm text-gray-500 text-center py-4">搜尋中...</p>
              ) : availablePackages.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {allPackages.length === 0 ? '尚無套餐，請先到「套餐管理」建立' : pkgSearch ? '找不到符合的套餐' : '所有套餐都已加入'}
                </p>
              ) : (
                <div className="space-y-2">
                  {availablePackages.map((pkg) => (
                    <button key={pkg.id} onClick={() => handleAddPackage(pkg.id)}
                      className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left">
                      <div>
                        <div className="text-sm font-medium">{pkg.name}</div>
                        <div className="text-xs text-gray-400">{pkg.product_type} · {pkg._plan_count || 0} 個 BC 商品</div>
                      </div>
                      <Plus className="w-4 h-4 text-blue-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
