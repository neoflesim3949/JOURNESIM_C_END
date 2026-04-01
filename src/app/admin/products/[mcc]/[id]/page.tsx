'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Save, ChevronDown, ChevronRight, Plus, Search, X, Trash2, DollarSign, Eye } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'

interface Product {
  id: string; name: string; description: string | null; product_type: string; country_code: string
}

interface CopyPrice {
  id: string; copies: string; cost_price: number; sell_price: number
}

interface BoundPlan {
  id: string; bc_sku_id: string; bc_name: string; bc_type: string
  plan_category: 'daily' | 'fixed'; days: number | null
  capacity: string | null; high_flow_size: string | null
  limit_flow_speed: string | null; plan_type: string | null
  is_active: boolean; copy_prices: CopyPrice[]
}

export default function AdminProductPlansPage() {
  const { mcc, id } = useParams() as { mcc: string; id: string }
  const [product, setProduct] = useState<Product | null>(null)
  const [plans, setPlans] = useState<BoundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedPrices, setEditedPrices] = useState<Map<string, number>>(new Map())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [showBatchPrice, setShowBatchPrice] = useState(false)
  const [batchPrice, setBatchPrice] = useState('')
  const [batchMode, setBatchMode] = useState<'fixed' | 'markup'>('fixed')
  const [batchMarkup, setBatchMarkup] = useState('')

  // Manual add
  const [showManual, setShowManual] = useState(false)
  const [bcSearch, setBcSearch] = useState('')
  const [bcResults, setBcResults] = useState<{ sku_id: string; name: string; type: string; plan_type: string | null; high_flow_size: string | null }[]>([])
  const [bcLoading, setBcLoading] = useState(false)
  const [bcSelectedSkus, setBcSelectedSkus] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [manualImporting, setManualImporting] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(false)

  async function loadData() {
    const res = await fetch(`/api/admin/products/${id}/bound-plans`)
    if (res.ok) {
      const data = await res.json()
      setProduct(data.product)
      setPlans(data.plans || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  async function handleImport() {
    setImporting(true)
    const res = await fetch(`/api/admin/products/${id}/import-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_code: mcc }),
    })
    if (res.ok) {
      await loadData()
    } else {
      const data = await res.json()
      alert(data.error || '匯入失敗')
    }
    setImporting(false)
  }

  function handlePriceChange(copyPriceId: string, price: number) {
    setEditedPrices((prev) => new Map(prev).set(copyPriceId, price))
  }

  async function handleSavePrices() {
    if (editedPrices.size === 0) return
    setSaving(true)
    const updates = Array.from(editedPrices.entries()).map(([id, sell_price]) => ({ id, sell_price }))
    await fetch(`/api/admin/products/${id}/bound-plans`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setEditedPrices(new Map())
    await loadData()
    setSaving(false)
  }

  async function handleRemovePlan(planId: string) {
    if (!confirm('確定要移除此套餐？')) return
    await fetch(`/api/admin/products/${id}/bound-plans`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId }),
    })
    setSelectedPlanIds((prev) => { const n = new Set(prev); n.delete(planId); return n })
    await loadData()
  }

  async function handleBatchDelete() {
    if (selectedPlanIds.size === 0) return
    if (!confirm(`確定要移除選取的 ${selectedPlanIds.size} 個套餐？`)) return
    for (const planId of selectedPlanIds) {
      await fetch(`/api/admin/products/${id}/bound-plans`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }),
      })
    }
    setSelectedPlanIds(new Set())
    await loadData()
  }

  function handleBatchPriceApply() {
    if (selectedPlanIds.size === 0) return

    const selectedPlans = plans.filter((p) => selectedPlanIds.has(p.id))
    const newPrices = new Map(editedPrices)

    for (const plan of selectedPlans) {
      for (const cp of plan.copy_prices) {
        if (batchMode === 'fixed') {
          const price = parseFloat(batchPrice)
          if (!isNaN(price)) newPrices.set(cp.id, price)
        } else {
          // 加價模式：成本價 × 倍率
          const markup = parseFloat(batchMarkup)
          if (!isNaN(markup) && cp.cost_price > 0) {
            newPrices.set(cp.id, Math.ceil(cp.cost_price * markup))
          }
        }
      }
    }

    setEditedPrices(newPrices)
    setShowBatchPrice(false)
  }

  function toggleExpand(planId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(planId) ? next.delete(planId) : next.add(planId)
      return next
    })
  }

  function expandAll() { setExpandedIds(new Set(plans.map((p) => p.id))) }

  function toggleSelectAll(planGroup: BoundPlan[]) {
    const allSelected = planGroup.every((p) => selectedPlanIds.has(p.id))
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      planGroup.forEach((p) => allSelected ? next.delete(p.id) : next.add(p.id))
      return next
    })
  }

  function toggleSelect(planId: string) {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      next.has(planId) ? next.delete(planId) : next.add(planId)
      return next
    })
  }

  // Manual search
  async function openManualSearch() { setShowManual(true); setBcSearch(''); setBcResults([]); setBcSelectedSkus(new Set()) }
  async function searchBc(query: string) {
    setBcSearch(query)
    if (query.length < 2) { setBcResults([]); return }
    setBcLoading(true)
    const res = await fetch(`/api/admin/plans/search?q=${encodeURIComponent(query)}&type=${product?.product_type || 'esim'}`)
    if (res.ok) setBcResults(await res.json())
    setBcLoading(false)
  }
  function toggleBcSelect(skuId: string) {
    setBcSelectedSkus((prev) => { const n = new Set(prev); n.has(skuId) ? n.delete(skuId) : n.add(skuId); return n })
  }
  function toggleBcSelectAll() {
    const available = bcResults.filter((p) => !plans.some((pl) => pl.bc_sku_id === p.sku_id))
    const allSelected = available.every((p) => bcSelectedSkus.has(p.sku_id))
    setBcSelectedSkus((prev) => {
      const n = new Set(prev)
      available.forEach((p) => allSelected ? n.delete(p.sku_id) : n.add(p.sku_id))
      return n
    })
  }
  async function manualImportSku(skuId: string) {
    setManualImporting((prev) => new Set(prev).add(skuId))
    await fetch(`/api/admin/products/${id}/import-plans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku_ids: [skuId] }) })
    setManualImporting((prev) => { const n = new Set(prev); n.delete(skuId); return n })
    await loadData()
  }
  async function handleBatchImport() {
    if (bcSelectedSkus.size === 0) return
    setBatchImporting(true)
    await fetch(`/api/admin/products/${id}/import-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_ids: Array.from(bcSelectedSkus) }),
    })
    setBatchImporting(false)
    setBcSelectedSkus(new Set())
    await loadData()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!product) return <div>找不到方案</div>

  const dailyPlans = plans.filter((p) => p.plan_category === 'daily')
  const fixedPlans = plans.filter((p) => p.plan_category === 'fixed')
  const totalCopies = plans.reduce((sum, p) => sum + p.copy_prices.length, 0)
  const hasChanges = editedPrices.size > 0

  // 預覽：模擬前台的速度分組和天數選項
  const previewDailyGroups = (() => {
    const groups = new Map<string, { speed: string; days: { day: number; price: number; bc_sku_id: string; copies: string }[] }>()
    for (const plan of dailyPlans) {
      const speed = formatCapacity(plan.high_flow_size ?? plan.capacity, true)
      if (!groups.has(speed)) groups.set(speed, { speed, days: [] })
      const unitDays = plan.days ?? 1
      for (const cp of plan.copy_prices) {
        const price = editedPrices.has(cp.id) ? editedPrices.get(cp.id)! : cp.sell_price
        if (price <= 0) continue
        groups.get(speed)!.days.push({ day: unitDays * parseInt(cp.copies), price, bc_sku_id: plan.bc_sku_id, copies: cp.copies })
      }
    }
    for (const g of groups.values()) g.days.sort((a, b) => a.day - b.day)
    return Array.from(groups.values()).filter((g) => g.days.length > 0)
  })()

  const previewFixedOptions = (() => {
    const opts: { capacity: string; days: number; price: number; bc_sku_id: string; copies: string }[] = []
    for (const plan of fixedPlans) {
      const unitDays = plan.days ?? 1
      for (const cp of plan.copy_prices) {
        const price = editedPrices.has(cp.id) ? editedPrices.get(cp.id)! : cp.sell_price
        if (price <= 0) continue
        opts.push({ capacity: formatCapacity(plan.high_flow_size ?? plan.capacity, false), days: unitDays * parseInt(cp.copies), price, bc_sku_id: plan.bc_sku_id, copies: cp.copies })
      }
    }
    return opts.sort((a, b) => a.price - b.price)
  })()

  return (
    <div>
      <Link href={`/admin/products/${mcc}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回方案列表
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-xs text-gray-400 mt-1">
            {product.product_type.toUpperCase()} · {mcc} · {plans.length} 個套餐 · {totalCopies} 個規格
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Eye className="w-4 h-4" /> 預覽前台
          </button>
          <button onClick={expandAll} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">全部展開</button>
          <button onClick={openManualSearch} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Plus className="w-4 h-4" /> 手動新增
          </button>
          <button onClick={handleImport} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> {importing ? '匯入中...' : '自動匯入'}
          </button>
        </div>
      </div>

      {/* Batch Actions Bar */}
      {(selectedPlanIds.size > 0 || hasChanges) && (
        <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          {selectedPlanIds.size > 0 && (
            <>
              <span className="text-sm font-medium text-blue-700">已選 {selectedPlanIds.size} 個</span>
              <button onClick={() => setShowBatchPrice(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-50">
                <DollarSign className="w-3.5 h-3.5" /> 批量定價
              </button>
              <button onClick={handleBatchDelete}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5" /> 批量刪除
              </button>
              <button onClick={() => setSelectedPlanIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700 ml-1">取消選取</button>
            </>
          )}
          <div className="flex-1" />
          {hasChanges && (
            <button onClick={handleSavePrices} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? '儲存中...' : `儲存價格（${editedPrices.size} 筆）`}
            </button>
          )}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">尚未匯入套餐，點擊「自動匯入」或「手動新增」</p>
        </div>
      ) : (
        <>
          {dailyPlans.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">日費套餐（{dailyPlans.length}）</h2>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={dailyPlans.every((p) => selectedPlanIds.has(p.id))}
                    onChange={() => toggleSelectAll(dailyPlans)} className="accent-blue-600" />
                  全選
                </label>
              </div>
              <PlanTable plans={dailyPlans} editedPrices={editedPrices} onPriceChange={handlePriceChange}
                expandedIds={expandedIds} onToggleExpand={toggleExpand} onRemove={handleRemovePlan}
                selectedIds={selectedPlanIds} onToggleSelect={toggleSelect} />
            </div>
          )}
          {fixedPlans.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">固定套餐（{fixedPlans.length}）</h2>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={fixedPlans.every((p) => selectedPlanIds.has(p.id))}
                    onChange={() => toggleSelectAll(fixedPlans)} className="accent-blue-600" />
                  全選
                </label>
              </div>
              <PlanTable plans={fixedPlans} editedPrices={editedPrices} onPriceChange={handlePriceChange}
                expandedIds={expandedIds} onToggleExpand={toggleExpand} onRemove={handleRemovePlan}
                selectedIds={selectedPlanIds} onToggleSelect={toggleSelect} />
            </div>
          )}
        </>
      )}

      {/* Batch Price Modal */}
      {showBatchPrice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold">批量定價</h2>
            <p className="text-sm text-gray-500 mt-1">為選取的 {selectedPlanIds.size} 個套餐的所有規格設定售價</p>

            <div className="mt-4 flex gap-3">
              <label className="flex items-center gap-2">
                <input type="radio" checked={batchMode === 'fixed'} onChange={() => setBatchMode('fixed')} className="accent-blue-600" />
                <span className="text-sm">固定價格</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={batchMode === 'markup'} onChange={() => setBatchMode('markup')} className="accent-blue-600" />
                <span className="text-sm">成本加成</span>
              </label>
            </div>

            {batchMode === 'fixed' ? (
              <div className="mt-3">
                <label className="text-sm font-medium">售價 (TWD)</label>
                <input type="number" value={batchPrice} onChange={(e) => setBatchPrice(e.target.value)}
                  placeholder="統一售價" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-sm font-medium">成本倍率</label>
                <input type="number" step="0.1" value={batchMarkup} onChange={(e) => setBatchMarkup(e.target.value)}
                  placeholder="例：1.5 表示成本 × 1.5" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">售價 = 成本價 × 倍率（無條件進位）</p>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button onClick={handleBatchPriceApply} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">套用</button>
              <button onClick={() => setShowBatchPrice(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <PreviewModal
          product={product}
          dailyGroups={previewDailyGroups}
          fixedOptions={previewFixedOptions}
          plans={plans}
          editedPrices={editedPrices}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Manual Add Modal */}
      {showManual && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-16 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">手動新增 BC 商品</h2>
                <p className="text-sm text-gray-500 mt-0.5">搜尋並勾選要匯入的商品（支援名稱、SKU、MCC）</p>
              </div>
              <button onClick={() => setShowManual(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={bcSearch} onChange={(e) => searchBc(e.target.value)}
                  placeholder="輸入商品名稱、SKU 或國家代碼（如 CN、JP）..." autoFocus
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            {/* Batch action bar */}
            {bcResults.length > 0 && (
              <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox"
                    checked={bcResults.filter((p) => !plans.some((pl) => pl.bc_sku_id === p.sku_id)).length > 0 &&
                      bcResults.filter((p) => !plans.some((pl) => pl.bc_sku_id === p.sku_id)).every((p) => bcSelectedSkus.has(p.sku_id))}
                    onChange={toggleBcSelectAll}
                    className="accent-blue-600" />
                  全選（{bcResults.filter((p) => !plans.some((pl) => pl.bc_sku_id === p.sku_id)).length} 個可匯入）
                </label>
                {bcSelectedSkus.size > 0 && (
                  <button onClick={handleBatchImport} disabled={batchImporting}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    <Download className="w-3.5 h-3.5" />
                    {batchImporting ? '匯入中...' : `批量匯入（${bcSelectedSkus.size}）`}
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {bcLoading ? <p className="text-sm text-gray-500 text-center py-4">搜尋中...</p>
              : bcResults.length === 0 && bcSearch.length >= 2 ? <p className="text-sm text-gray-500 text-center py-4">找不到符合的商品</p>
              : (
                <div className="space-y-1">
                  {bcResults.map((p) => {
                    const alreadyAdded = plans.some((pl) => pl.bc_sku_id === p.sku_id)
                    const isImp = manualImporting.has(p.sku_id)
                    const isChecked = bcSelectedSkus.has(p.sku_id)
                    return (
                      <div key={p.sku_id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          alreadyAdded ? 'border-gray-100 bg-gray-50 opacity-60' : isChecked ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:border-blue-200'
                        }`}>
                        {!alreadyAdded ? (
                          <input type="checkbox" checked={isChecked} onChange={() => toggleBcSelect(p.sku_id)} className="accent-blue-600 flex-shrink-0" />
                        ) : (
                          <div className="w-4" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{p.sku_id} · 類型 {p.type} · {p.plan_type === '1' ? '單日型' : '總量型'}</div>
                        </div>
                        {alreadyAdded ? (
                          <span className="text-xs text-gray-400 px-2">已匯入</span>
                        ) : (
                          <button onClick={() => manualImportSku(p.sku_id)} disabled={isImp}
                            className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 flex-shrink-0">
                            {isImp ? '...' : '單獨匯入'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewModal({ product, dailyGroups, fixedOptions, plans, editedPrices, onClose }: {
  product: Product | null
  dailyGroups: { speed: string; days: { day: number; price: number; bc_sku_id: string; copies: string }[] }[]
  fixedOptions: { capacity: string; days: number; price: number; bc_sku_id: string; copies: string }[]
  plans: BoundPlan[]
  editedPrices: Map<string, number>
  onClose: () => void
}) {
  const [pvTab, setPvTab] = useState<'daily' | 'fixed'>('daily')
  const [pvSpeed, setPvSpeed] = useState(dailyGroups[0]?.speed || '')
  const [pvDay, setPvDay] = useState('')
  const [pvFixed, setPvFixed] = useState(0)

  const currentSpeedGroup = dailyGroups.find((g) => g.speed === pvSpeed)
  const currentDayOpt = currentSpeedGroup?.days.find((d) => String(d.day) === pvDay) || currentSpeedGroup?.days[0]
  const currentFixedOpt = fixedOptions[pvFixed]

  // 自動選第一個天數
  useEffect(() => {
    if (currentSpeedGroup && !pvDay) setPvDay(String(currentSpeedGroup.days[0]?.day || ''))
  }, [pvSpeed, currentSpeedGroup, pvDay])

  const hasDailyGroups = dailyGroups.length > 0
  const hasFixedOptions = fixedOptions.length > 0
  const unpricedCount = plans.reduce((sum, p) => sum + p.copy_prices.filter((cp) => cp.sell_price <= 0 && !editedPrices.has(cp.id)).length, 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">前台預覽</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-5 border border-blue-100">
            <h3 className="text-xl font-bold">{product?.name}</h3>
            {product?.description && <p className="text-sm text-gray-500 mt-1">{product.description}</p>}

            {/* Tabs */}
            {hasDailyGroups && hasFixedOptions && (
              <div className="mt-4 flex rounded-lg overflow-hidden border border-gray-200">
                <button onClick={() => setPvTab('daily')} className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${pvTab === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  日費套餐
                </button>
                <button onClick={() => setPvTab('fixed')} className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${pvTab === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  固定套餐
                </button>
              </div>
            )}

            {/* Daily */}
            {((pvTab === 'daily' && hasDailyGroups) || (!hasFixedOptions && hasDailyGroups)) && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-700">選擇手機套餐</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dailyGroups.map((g) => (
                      <button key={g.speed} onClick={() => { setPvSpeed(g.speed); setPvDay('') }}
                        className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${pvSpeed === g.speed ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>
                        {g.speed}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">選擇天數</div>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {currentSpeedGroup?.days.map((d) => (
                      <button key={d.day} onClick={() => setPvDay(String(d.day))}
                        className={`px-2 py-1.5 border rounded-lg text-center text-sm transition-all ${String(d.day) === pvDay ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>
                        {d.day}
                      </button>
                    ))}
                  </div>
                </div>
                {currentDayOpt && (
                  <>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-sm text-gray-500">總計</span>
                      <span className="text-xl font-bold text-blue-600">NT$ {currentDayOpt.price}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                      <div><span className="text-gray-400">SKU：</span><span className="font-mono">{currentDayOpt.bc_sku_id}</span></div>
                      <div><span className="text-gray-400">Copies：</span>{currentDayOpt.copies}</div>
                      <div><span className="text-gray-400">實際天數：</span>{currentDayOpt.day} 天</div>
                      <div><span className="text-gray-400">售價：</span>NT$ {currentDayOpt.price}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Fixed */}
            {((pvTab === 'fixed' && hasFixedOptions) || (!hasDailyGroups && hasFixedOptions)) && (
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700">選擇手機套餐</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {fixedOptions.map((opt, i) => (
                    <button key={i} onClick={() => setPvFixed(i)}
                      className={`p-3 border rounded-xl text-left transition-all ${pvFixed === i ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-300'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">{opt.capacity}</div>
                          <div className="text-xs text-gray-500">{opt.days} 天</div>
                        </div>
                        <div className="font-semibold text-blue-600 text-sm">NT$ {opt.price}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {currentFixedOpt && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                    <div><span className="text-gray-400">SKU：</span><span className="font-mono">{currentFixedOpt.bc_sku_id}</span></div>
                    <div><span className="text-gray-400">Copies：</span>{currentFixedOpt.copies}</div>
                    <div><span className="text-gray-400">容量：</span>{currentFixedOpt.capacity}</div>
                    <div><span className="text-gray-400">天數：</span>{currentFixedOpt.days} 天</div>
                    <div><span className="text-gray-400">售價：</span>NT$ {currentFixedOpt.price}</div>
                  </div>
                )}
              </div>
            )}

            {!hasDailyGroups && !hasFixedOptions && (
              <div className="mt-4 text-center py-8 text-gray-400 text-sm">尚無已定價的套餐，前台不會顯示</div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
            <div>日費速度選項：{dailyGroups.length} 個（{dailyGroups.map((g) => g.speed).join('、') || '無'}）</div>
            <div>日費天數選項：{dailyGroups[0]?.days.length || 0} 個</div>
            <div>固定套餐選項：{fixedOptions.length} 個</div>
            <div>未定價規格：{unpricedCount} 個（不會顯示在前台）</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanTable({ plans, editedPrices, onPriceChange, expandedIds, onToggleExpand, onRemove, selectedIds, onToggleSelect }: {
  plans: BoundPlan[]; editedPrices: Map<string, number>
  onPriceChange: (id: string, price: number) => void
  expandedIds: Set<string>; onToggleExpand: (id: string) => void
  onRemove: (planId: string) => void
  selectedIds: Set<string>; onToggleSelect: (id: string) => void
}) {
  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
          <tr>
            <th className="w-10 px-3 py-3"></th>
            <th className="text-left px-4 py-3 font-medium min-w-[250px]">BC 商品名稱</th>
            <th className="text-left px-4 py-3 font-medium w-20">類型</th>
            <th className="text-left px-4 py-3 font-medium w-24">流量</th>
            <th className="text-left px-4 py-3 font-medium w-20">限速</th>
            <th className="text-left px-4 py-3 font-medium w-20">天數</th>
            <th className="text-right px-4 py-3 font-medium w-24">成本價</th>
            <th className="text-right px-4 py-3 font-medium w-32">售價 (TWD)</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {plans.map((plan) => {
            const isExpanded = expandedIds.has(plan.id)
            const isDaily = plan.plan_type === '1'
            const unitDays = plan.days ?? 1
            const isSelected = selectedIds.has(plan.id)

            return (
              <Fragment key={plan.id}>
                <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''} ${isSelected ? 'bg-blue-50/50' : ''}`}
                  onClick={() => onToggleExpand(plan.id)}>
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(plan.id)} className="accent-blue-600" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-gray-400 flex-shrink-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{plan.bc_name}</div>
                        <div className="text-xs text-gray-400 mt-0.5 font-mono">{plan.bc_sku_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-600">{plan.bc_type}</span>
                    <div className="text-xs text-gray-400 mt-0.5">{isDaily ? '單日型' : '總量型'}</div>
                  </td>
                  <td className="px-4 py-3">{formatCapacity(plan.high_flow_size ?? plan.capacity, isDaily)}</td>
                  <td className="px-4 py-3">{formatSpeed(plan.limit_flow_speed)}</td>
                  <td className="px-4 py-3 text-gray-500">{plan.copy_prices.length > 0 ? `${plan.copy_prices.length} 規格` : '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-500">-</td>
                  <td className="px-4 py-3 text-right text-gray-500">-</td>
                  <td className="px-4 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onRemove(plan.id)} className="p-1 text-gray-300 hover:text-red-500 rounded" title="移除">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {isExpanded && plan.copy_prices.map((cp) => {
                  const actualDays = unitDays * parseInt(cp.copies)
                  const currentSellPrice = editedPrices.has(cp.id) ? editedPrices.get(cp.id)! : cp.sell_price
                  const isEdited = editedPrices.has(cp.id)
                  return (
                    <tr key={cp.id} className="bg-gray-50/50 hover:bg-gray-100/50">
                      <td className="px-3 py-2"></td>
                      <td className="px-4 py-2 pl-12" colSpan={3}></td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-gray-700 font-medium">
                        <span className="text-gray-400">└ </span>{actualDays} 天
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">¥{cp.cost_price}</td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <input type="number" value={currentSellPrice || ''} onChange={(e) => onPriceChange(cp.id, Number(e.target.value))}
                          placeholder="售價"
                          className={`w-28 px-2 py-1 text-right border rounded text-sm ${isEdited ? 'border-green-400 bg-green-50' : cp.sell_price > 0 ? 'border-gray-300' : 'border-orange-300 bg-orange-50'}`} />
                      </td>
                      <td></td>
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
