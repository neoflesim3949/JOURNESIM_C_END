'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Plus, Trash2, Package, X, Search, Pencil, Save, ImageIcon } from 'lucide-react'

interface PkgInfo { id: string; name: string; description: string | null; product_type: string; is_active: boolean; _plan_count?: number }
interface Product {
  id: string; name: string; scope: string; product_type: string
  country_code: string; country_name: string; icon_url: string | null
}

export default function GroupDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [linkedPackages, setLinkedPackages] = useState<PkgInfo[]>([])
  const [allPackages, setAllPackages] = useState<PkgInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddPkg, setShowAddPkg] = useState(false)
  const [pkgSearch, setPkgSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PkgInfo[]>([])
  const [searching, setSearching] = useState(false)

  // 編輯分組
  const [editingGroup, setEditingGroup] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadData() {
    const [customRes, packagesRes] = await Promise.all([
      fetch(`/api/admin/products/custom?scope=all&group=${encodeURIComponent(id)}`).then((r) => r.json()),
      fetch('/api/admin/packages').then((r) => r.json()),
    ])
    const prods = Array.isArray(customRes) ? customRes : []
    setAllPackages(packagesRes || [])

    // 取第一個 product 作為此分組的載體（與本地方案邏輯一致）
    const prod = prods[0] || null
    setProduct(prod)

    // 取得已加入的套餐
    if (prod) {
      const res = await fetch(`/api/admin/products/custom/${prod.id}/packages`)
      if (res.ok) setLinkedPackages(await res.json())
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  // 加入套餐
  async function handleAddPackage(pkgId: string) {
    if (!product) return
    await fetch(`/api/admin/products/custom/${product.id}/packages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: pkgId }),
    })
    setShowAddPkg(false)
    await loadData()
  }

  // 移除套餐
  async function handleRemovePackage(pkgId: string) {
    if (!product || !confirm('確定移除此套餐？')) return
    await fetch(`/api/admin/products/custom/${product.id}/packages`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: pkgId }),
    })
    await loadData()
  }

  // 搜尋套餐
  async function handleSearchPkgs(q: string) {
    setPkgSearch(q)
    if (q.length < 1) { setSearchResults(allPackages); return }
    setSearching(true)
    const res = await fetch(`/api/admin/packages/search?q=${encodeURIComponent(q)}`)
    if (res.ok) setSearchResults(await res.json())
    setSearching(false)
  }

  // 開始編輯分組
  function startEdit() {
    if (!product) return
    setEditName(product.country_name)
    setEditCode(product.country_code)
    setEditIcon(product.icon_url || '')
    setEditingGroup(true)
  }

  // 儲存分組編輯
  async function saveEdit() {
    if (!product) return
    setSaving(true)
    await fetch('/api/admin/products', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: product.id,
        country_name: editName,
        name: `${editName} eSIM`,
        icon_url: editIcon || null,
        ...(editCode !== id ? { country_code: editCode } : {}),
      }),
    })
    setSaving(false)
    setEditingGroup(false)
    if (editCode !== id) {
      router.replace(`/admin/products/groups/${editCode}`)
    } else {
      await loadData()
    }
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!product) return <div className="text-gray-500">找不到分組</div>

  const linkedIds = new Set(linkedPackages.map((p) => p.id))
  const availablePackages = (pkgSearch ? searchResults : allPackages).filter((pkg) => !linkedIds.has(pkg.id))
  const scopeLabel = product.scope === 'global' ? '全球' : '區域'

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回方案管理
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {product.icon_url ? (
            <Image src={product.icon_url} alt={product.country_name} width={48} height={48} className="rounded-lg shadow w-12 h-12 object-cover" />
          ) : (
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-gray-300" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{product.country_name}</h1>
            <p className="text-sm text-gray-500">{scopeLabel} · <span className="font-mono text-xs">{id}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            <Pencil className="w-4 h-4" /> 編輯分組
          </button>
          <button onClick={() => { setShowAddPkg(true); setPkgSearch('') }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 加入套餐
          </button>
        </div>
      </div>

      {/* Edit Group */}
      {editingGroup && (
        <div className="mt-4 bg-white p-6 rounded-xl border border-blue-200 space-y-4">
          <h3 className="font-semibold text-sm">編輯分組資訊</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600">分組名稱</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Country Code</label>
              <input value={editCode} onChange={(e) => setEditCode(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">圖示 URL</label>
            <div className="mt-1 flex items-center gap-3">
              <input value={editIcon} onChange={(e) => setEditIcon(e.target.value)}
                placeholder="https://..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              {editIcon && <Image src={editIcon} alt="" width={40} height={40} className="rounded-lg w-10 h-10 object-cover border" />}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? '儲存中...' : '儲存'}
            </button>
            <button onClick={() => setEditingGroup(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      {/* Linked Packages */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-500">已加入的套餐（{linkedPackages.length}）</h2>

        {linkedPackages.length === 0 ? (
          <div className="mt-4 text-center py-16 bg-white rounded-xl border border-gray-200">
            <Package className="mx-auto w-12 h-12 text-gray-300" />
            <p className="mt-4 text-gray-500">尚未加入套餐</p>
            <p className="mt-1 text-xs text-gray-400">請先到「套餐管理」建立套餐，再回來加入套餐</p>
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
              <h2 className="font-bold">加入套餐</h2>
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
