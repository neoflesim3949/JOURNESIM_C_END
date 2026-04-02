'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Package, X, Search } from 'lucide-react'

interface PkgInfo { id: string; name: string; product_type: string; is_active: boolean; _plan_count?: number }
interface Product { id: string; name: string; description: string | null; scope: string; product_type: string }

export default function CustomProductDetailPage() {
  const { id } = useParams() as { id: string }
  const [product, setProduct] = useState<Product | null>(null)
  const [linkedPackages, setLinkedPackages] = useState<PkgInfo[]>([])
  const [allPackages, setAllPackages] = useState<PkgInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddPkg, setShowAddPkg] = useState(false)
  const [pkgSearch, setPkgSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PkgInfo[]>([])
  const [searching, setSearching] = useState(false)

  async function loadData() {
    const [productRes, packagesRes] = await Promise.all([
      fetch(`/api/admin/products/${id}`).then((r) => r.json()),
      fetch('/api/admin/packages').then((r) => r.json()),
    ])
    setProduct(productRes.product)
    setAllPackages(packagesRes || [])

    // 取得已加入的套餐
    const { data: links } = await fetch(`/api/admin/products/custom/${id}/packages`).then((r) => r.json()).catch(() => ({ data: [] }))
    setLinkedPackages(Array.isArray(links) ? links : [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  async function handleSearchPkgs(query: string) {
    setPkgSearch(query)
    if (query.length < 1) { setSearchResults(allPackages); return }
    setSearching(true)
    const res = await fetch(`/api/admin/packages/search?q=${encodeURIComponent(query)}`)
    if (res.ok) setSearchResults(await res.json())
    setSearching(false)
  }

  const linkedIds = new Set(linkedPackages.map((p) => p.id))
  const availablePackages = (pkgSearch ? searchResults : allPackages).filter((pkg) => !linkedIds.has(pkg.id))

  async function handleAddPackage(packageId: string) {
    await fetch(`/api/admin/products/custom/${id}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: packageId }),
    })
    setShowAddPkg(false)
    await loadData()
  }

  async function handleRemovePackage(packageId: string) {
    if (!confirm('確定移除？')) return
    await fetch(`/api/admin/products/custom/${id}/packages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: packageId }),
    })
    await loadData()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!product) return <div>找不到方案</div>

  const scopeLabel = product.scope === 'global' ? '全球' : '區域'

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回方案管理
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <span className={`px-2 py-0.5 text-xs rounded-full ${product.scope === 'global' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
              {scopeLabel}
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{product.product_type}</span>
          </div>
          {product.description && <p className="mt-1 text-sm text-gray-500">{product.description}</p>}
        </div>
        <button onClick={() => { setShowAddPkg(true); setPkgSearch('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> 加入套餐
        </button>
      </div>

      {/* Linked Packages */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-500">已加入的套餐（{linkedPackages.length}）</h2>
        {linkedPackages.length === 0 ? (
          <div className="mt-4 text-center py-16 bg-white rounded-xl border border-gray-200">
            <Package className="mx-auto w-12 h-12 text-gray-300" />
            <p className="mt-4 text-gray-500">尚未加入套餐</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {linkedPackages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="font-semibold">{pkg.name}</div>
                    <div className="text-xs text-gray-400">{pkg.product_type} · {pkg._plan_count || 0} 個 BC 商品</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/packages/${pkg.id}`} className="px-3 py-1.5 bg-gray-50 text-gray-600 text-xs rounded-lg hover:bg-gray-100">查看套餐</Link>
                  <button onClick={() => handleRemovePackage(pkg.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
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
              <h2 className="font-bold">加入套餐</h2>
              <button onClick={() => setShowAddPkg(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={pkgSearch} onChange={(e) => handleSearchPkgs(e.target.value)}
                  placeholder="搜尋套餐名稱或國家代碼..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {searching ? <p className="text-sm text-gray-500 text-center py-4">搜尋中...</p>
              : availablePackages.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">找不到可加入的套餐</p>
              : (
                <div className="space-y-2">
                  {availablePackages.map((pkg) => (
                    <button key={pkg.id} onClick={() => handleAddPackage(pkg.id)}
                      className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 text-left">
                      <div>
                        <div className="text-sm font-medium">{pkg.name}</div>
                        <div className="text-xs text-gray-400">{pkg.product_type}</div>
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
