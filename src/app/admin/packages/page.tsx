'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Package as PackageIcon, Zap, X, Search, ListFilter, Pencil } from 'lucide-react'

import { getTypeLabels } from '@/lib/bc-enums'

interface Pkg {
  id: string; name: string; description: string | null; product_type: string; scope?: string
  is_active: boolean; _plan_count: number; _product_count: number; _has_price_changes?: boolean
}

interface BcProduct {
  sku_id: string; name: string; type: string; plan_type: string | null; high_flow_size: string | null
  rechargeable_product: string | null
  country_data?: { mcc: string; name: string }[] | null
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', product_type: 'esim' })

  // 未加入列表
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [unassignedList, setUnassignedList] = useState<BcProduct[]>([])
  const [unassignedTotal, setUnassignedTotal] = useState(0)
  const [unassignedLoading, setUnassignedLoading] = useState(false)
  const [unassignedSearch, setUnassignedSearch] = useState('')
  const [unassignedPage, setUnassignedPage] = useState(1)
  const [unassignedPageSize, setUnassignedPageSize] = useState(50)
  const [unassignedTypeFilter, setUnassignedTypeFilter] = useState('')

  // 快捷新增
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [bcSearch, setBcSearch] = useState('')
  const [bcResults, setBcResults] = useState<BcProduct[]>([])
  const [bcLoading, setBcLoading] = useState(false)
  const [bcSelectedSkus, setBcSelectedSkus] = useState<Set<string>>(new Set())
  const [quickStep, setQuickStep] = useState<'select' | 'name'>('select')
  const [quickForm, setQuickForm] = useState({ name: '', product_type: 'esim' })
  const [quickCreating, setQuickCreating] = useState(false)

  // 已存在套餐中的所有 SKU
  const [existingSkus, setExistingSkus] = useState<Set<string>>(new Set())

  // 編輯套餐
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', product_type: 'esim' })

  async function load() {
    const res = await fetch('/api/admin/packages')
    if (res.ok) {
      const data = await res.json()
      setPackages(data)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowCreate(false)
    setForm({ name: '', description: '', product_type: 'esim' })
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此套餐？')) return
    await fetch('/api/admin/packages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  async function handleSaveEdit() {
    if (!editingId) return
    await fetch('/api/admin/packages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...editForm }),
    })
    setEditingId(null)
    load()
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch('/api/admin/packages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    })
    load()
  }

  // 快捷新增：搜尋 BC 商品
  async function openQuickAdd() {
    setShowQuickAdd(true)
    setQuickStep('select')
    setBcSearch('')
    setBcResults([])
    setBcSelectedSkus(new Set())
    setQuickForm({ name: '', product_type: 'esim' })

    // 載入已存在套餐中的所有 SKU
    const skuRes = await fetch('/api/admin/packages/existing-skus')
    if (skuRes.ok) {
      const skus = await skuRes.json()
      setExistingSkus(new Set(skus))
    }
  }

  async function searchBc(query: string) {
    setBcSearch(query)
    if (query.length < 2) { setBcResults([]); return }
    setBcLoading(true)
    const res = await fetch(`/api/admin/plans/search?q=${encodeURIComponent(query)}&type=esim`)
    if (res.ok) {
      const all = await res.json()
      setBcResults(all.filter((p: BcProduct) => !existingSkus.has(p.sku_id)))
    }
    setBcLoading(false)
  }

  function toggleBcSelect(skuId: string) {
    setBcSelectedSkus((prev) => { const n = new Set(prev); n.has(skuId) ? n.delete(skuId) : n.add(skuId); return n })
  }

  function toggleBcSelectAll() {
    const all = bcResults.every((p) => bcSelectedSkus.has(p.sku_id))
    setBcSelectedSkus((prev) => { const n = new Set(prev); bcResults.forEach((p) => all ? n.delete(p.sku_id) : n.add(p.sku_id)); return n })
  }

  function goToNameStep() {
    if (bcSelectedSkus.size === 0) return
    // 自動推薦名稱：取第一個商品的前綴
    const first = bcResults.find((p) => bcSelectedSkus.has(p.sku_id))
    const autoName = first?.name.split('-')[0] || ''
    setQuickForm({ name: autoName, product_type: 'esim' })
    setQuickStep('name')
  }

  async function handleQuickCreate() {
    if (!quickForm.name || bcSelectedSkus.size === 0) return
    setQuickCreating(true)

    // 1. 建立套餐
    const createRes = await fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: quickForm.name, product_type: quickForm.product_type }),
    })
    const newPkg = await createRes.json()

    if (newPkg.id) {
      // 2. 匯入選取的 BC 商品
      await fetch(`/api/admin/packages/${newPkg.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_ids: Array.from(bcSelectedSkus) }),
      })
    }

    setQuickCreating(false)
    setShowQuickAdd(false)
    load()
  }

  async function loadUnassigned(p?: number, search?: string, filterType?: string) {
    const pg = p ?? unassignedPage
    const s = search ?? unassignedSearch
    const ft = filterType ?? unassignedTypeFilter
    setUnassignedLoading(true)
    const params = new URLSearchParams({ page: String(pg), pageSize: String(unassignedPageSize) })
    if (s) params.set('search', s)
    if (ft) params.set('filterType', ft)
    const res = await fetch(`/api/admin/packages/unassigned?${params}`)
    if (res.ok) {
      const data = await res.json()
      setUnassignedList(data.data || [])
      setUnassignedTotal(data.total || 0)
    }
    setUnassignedLoading(false)
  }

  function openUnassigned() {
    setShowUnassigned(true)
    setUnassignedSearch('')
    setUnassignedTypeFilter('')
    setUnassignedPage(1)
    loadUnassigned(1, '', '')
  }

  function handleUnassignedSearch() { setUnassignedPage(1); loadUnassigned(1) }
  function handleUnassignedTypeChange(v: string) { setUnassignedTypeFilter(v); setUnassignedPage(1); loadUnassigned(1, unassignedSearch, v) }

  const unassignedTotalPages = Math.ceil(unassignedTotal / unassignedPageSize)

  if (loading) return <div className="text-gray-500">載入中...</div>

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">套餐管理</h1>
          <p className="mt-1 text-sm text-gray-500">建立套餐並組合 BC 商品，套餐可被多個方案共用</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openUnassigned}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            <ListFilter className="w-4 h-4" /> 未加入列表
          </button>
          <button onClick={openQuickAdd}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            <Zap className="w-4 h-4" /> 快捷新增
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新增套餐
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 bg-white p-6 rounded-xl border border-gray-200 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">套餐名稱</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例：東南亞 10 國 eSIM 日費" />
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
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="套餐描述" />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">建立</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
          </div>
        </form>
      )}

      {packages.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <PackageIcon className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無套餐</p>
          <p className="mt-1 text-xs text-gray-400">點擊「新增套餐」建立空套餐，或「快捷新增」搜尋 BC 商品快速建立</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {packages.map((pkg) => {
            const isEditing = editingId === pkg.id
            return isEditing ? (
              <div key={pkg.id} className="bg-white border border-blue-300 rounded-xl p-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-500">套餐名稱</label>
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">類型</label>
                    <select value={editForm.product_type} onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="esim">eSIM</option><option value="sim">SIM</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">描述（選填）</label>
                  <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="套餐描述" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">儲存</button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
                </div>
              </div>
            ) : (
              <div key={pkg.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{pkg.name}</h3>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{pkg.product_type}</span>
                      <button onClick={() => handleToggle(pkg.id, pkg.is_active)}
                        className={`px-2 py-0.5 text-xs rounded-full ${pkg.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {pkg.is_active ? '上架中' : '已下架'}
                      </button>
                    </div>
                    {pkg.description && <p className="mt-1 text-sm text-gray-500">{pkg.description}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {pkg._plan_count} 個 BC 商品 · 被 {pkg._product_count} 個方案使用
                      {pkg._has_price_changes && <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">成本異動</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingId(pkg.id); setEditForm({ name: pkg.name, description: pkg.description || '', product_type: pkg.product_type }) }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil className="w-4 h-4" /></button>
                    <Link href={`/admin/packages/${pkg.id}`}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100">管理內容</Link>
                    <button onClick={() => handleDelete(pkg.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 未加入列表 Modal */}
      {showUnassigned && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-16 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">未加入套餐的 BC 商品</h2>
                <p className="text-sm text-gray-500 mt-0.5">共 {unassignedTotal} 個商品尚未被加入任何套餐</p>
              </div>
              <button onClick={() => setShowUnassigned(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-gray-100 flex gap-3">
              <select value={unassignedTypeFilter} onChange={(e) => handleUnassignedTypeChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">全部類型</option>
                <option value="esim">eSIM</option>
                <option value="sim">SIM</option>
              </select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={unassignedSearch} onChange={(e) => setUnassignedSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnassignedSearch()}
                  placeholder="搜尋名稱或 SKU..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
              <button onClick={handleUnassignedSearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
            </div>
            {/* 批量操作 */}
            {unassignedList.length > 0 && (
              <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox"
                    checked={unassignedList.length > 0 && unassignedList.every((p: BcProduct) => bcSelectedSkus.has(p.sku_id))}
                    onChange={() => {
                      const allSel = unassignedList.every((p: BcProduct) => bcSelectedSkus.has(p.sku_id))
                      setBcSelectedSkus((prev) => { const n = new Set(prev); unassignedList.forEach((p: BcProduct) => allSel ? n.delete(p.sku_id) : n.add(p.sku_id)); return n })
                    }}
                    className="accent-blue-600" />
                  全選（{unassignedList.length}）
                </label>
                {bcSelectedSkus.size > 0 && (
                  <button onClick={() => {
                    setShowUnassigned(false)
                    setQuickStep('name')
                    setQuickForm({ name: '', product_type: 'esim' })
                    setShowQuickAdd(true)
                  }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                    <Zap className="w-3.5 h-3.5" /> 快捷建立套餐（{bcSelectedSkus.size}）
                  </button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {unassignedLoading ? (
                <p className="text-sm text-gray-500 text-center py-4">載入中...</p>
              ) : unassignedList.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {unassignedTotal === 0 ? '所有 BC 商品都已加入套餐' : '找不到符合的商品'}
                </p>
              ) : (
                <div className="space-y-1">
                  {unassignedList.map((p: BcProduct) => (
                    <div key={p.sku_id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${bcSelectedSkus.has(p.sku_id) ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={bcSelectedSkus.has(p.sku_id)}
                        onChange={() => setBcSelectedSkus((prev) => { const n = new Set(prev); n.has(p.sku_id) ? n.delete(p.sku_id) : n.add(p.sku_id); return n })}
                        className="accent-blue-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">{p.sku_id} · {p.plan_type === '1' ? '單日型' : '總量型'} {getTypeLabels(p.type, p.rechargeable_product).map((t) => <span key={t.label} className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.color}`}>{t.label}</span>)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 分頁 */}
            {unassignedTotal > unassignedPageSize && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-xs text-gray-500">
                  每頁
                  <select value={unassignedPageSize} onChange={(e) => { setUnassignedPageSize(Number(e.target.value)); setUnassignedPage(1); loadUnassigned(1, unassignedSearch, unassignedTypeFilter) }}
                    className="mx-1 px-1 py-0.5 border border-gray-300 rounded text-xs">
                    {[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  筆 · 共 {unassignedTotal} 筆
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const p = Math.max(1, unassignedPage - 1); setUnassignedPage(p); loadUnassigned(p) }} disabled={unassignedPage <= 1}
                    className="px-2 py-1 border border-gray-300 rounded text-xs disabled:opacity-50">上一頁</button>
                  <span className="px-2 py-1 text-xs">{unassignedPage} / {unassignedTotalPages}</span>
                  <button onClick={() => { const p = Math.min(unassignedTotalPages, unassignedPage + 1); setUnassignedPage(p); loadUnassigned(p) }} disabled={unassignedPage >= unassignedTotalPages}
                    className="px-2 py-1 border border-gray-300 rounded text-xs disabled:opacity-50">下一頁</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 快捷新增 Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-16 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">快捷新增套餐</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {quickStep === 'select' ? '第 1 步：搜尋並勾選 BC 商品' : '第 2 步：設定套餐名稱和類型'}
                </p>
              </div>
              <button onClick={() => setShowQuickAdd(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>

            {quickStep === 'select' ? (
              <>
                <div className="p-5 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={bcSearch} onChange={(e) => searchBc(e.target.value)}
                      placeholder="輸入商品名稱、SKU 或國家代碼（如 CN、JP）..." autoFocus
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                {bcResults.length > 0 && (
                  <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={bcResults.every((p) => bcSelectedSkus.has(p.sku_id))} onChange={toggleBcSelectAll} className="accent-blue-600" />
                      全選（{bcResults.length}）
                    </label>
                    {bcSelectedSkus.size > 0 && (
                      <button onClick={goToNameStep}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                        下一步（已選 {bcSelectedSkus.size}）
                      </button>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {bcLoading ? <p className="text-sm text-gray-500 text-center py-4">搜尋中...</p>
                  : bcResults.length === 0 && bcSearch.length >= 2 ? <p className="text-sm text-gray-500 text-center py-4">找不到符合的商品</p>
                  : bcResults.map((p) => (
                    <div key={p.sku_id}
                      className={`flex items-center gap-3 p-3 rounded-lg border mb-1 transition-all ${bcSelectedSkus.has(p.sku_id) ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:border-blue-200'}`}>
                      <input type="checkbox" checked={bcSelectedSkus.has(p.sku_id)} onChange={() => toggleBcSelect(p.sku_id)} className="accent-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1.5">{p.sku_id} · {p.plan_type === '1' ? '單日型' : '總量型'} {getTypeLabels(p.type, p.rechargeable_product).map((t) => <span key={t.label} className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.color}`}>{t.label}</span>)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-5 space-y-4">
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-600">
                  已選擇 {bcSelectedSkus.size} 個 BC 商品
                </div>
                <div>
                  <label className="text-sm font-medium">套餐名稱</label>
                  <input value={quickForm.name} onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例：中國 eSIM 日費" />
                </div>
                <div>
                  <label className="text-sm font-medium">類型</label>
                  <select value={quickForm.product_type} onChange={(e) => setQuickForm({ ...quickForm, product_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="esim">eSIM</option>
                    <option value="sim">SIM 卡</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleQuickCreate} disabled={quickCreating || !quickForm.name}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {quickCreating ? '建立中...' : '建立套餐'}
                  </button>
                  <button onClick={() => setQuickStep('select')} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
                    上一步
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
