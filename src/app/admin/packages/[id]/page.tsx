'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Save, ChevronDown, ChevronRight, Plus, Search, X, Trash2, DollarSign, Eye } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'

const ESIM_TYPES = ['110', '111', '3105', '3106']
function getSimLabel(type: string) { return ESIM_TYPES.includes(type) ? 'eSIM' : 'SIM' }
function getSimColor(type: string) { return ESIM_TYPES.includes(type) ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600' }

interface CopyPrice { id: string; copies: string; cost_price: number; original_cost_price: number | null; sell_price: number; price_changed: boolean }
interface BoundPlan {
  id: string; bc_sku_id: string; bc_name: string; bc_type: string
  plan_category: 'daily' | 'fixed'; days: number | null
  capacity: string | null; high_flow_size: string | null
  limit_flow_speed: string | null; plan_type: string | null
  is_active: boolean; copy_prices: CopyPrice[]
}
interface Pkg { id: string; name: string; description: string | null; product_type: string }

export default function PackageDetailPage() {
  const { id } = useParams() as { id: string }
  const [pkg, setPkg] = useState<Pkg | null>(null)
  const [plans, setPlans] = useState<BoundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedPrices, setEditedPrices] = useState<Map<string, number>>(new Map())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [showBatchPrice, setShowBatchPrice] = useState(false)
  const [batchMode, setBatchMode] = useState<'fixed' | 'markup' | 'formula'>('formula')
  const [batchPrice, setBatchPrice] = useState('')
  const [batchMarkup, setBatchMarkup] = useState('1.5')
  const [batchAdd, setBatchAdd] = useState('3')
  const [showPreview, setShowPreview] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [bcSearch, setBcSearch] = useState('')
  const [bcResults, setBcResults] = useState<{ sku_id: string; name: string; type: string; plan_type: string | null; high_flow_size: string | null }[]>([])
  const [bcLoading, setBcLoading] = useState(false)
  const [bcSelectedSkus, setBcSelectedSkus] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [importCountry, setImportCountry] = useState('')
  const [exchangeRate, setExchangeRate] = useState(0)

  async function loadData() {
    const [pkgRes, rateRes] = await Promise.all([
      fetch(`/api/admin/packages/${id}`),
      fetch('/api/admin/exchange-rate'),
    ])
    if (pkgRes.ok) {
      const data = await pkgRes.json()
      setPkg(data.package)
      setPlans(data.plans || [])
    }
    if (rateRes.ok) {
      const rates = await rateRes.json()
      const cny = rates.find((r: { currency: string; rate: number }) => r.currency === 'CNY')
      if (cny) setExchangeRate(cny.rate)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  async function handleImportByCountry() {
    if (!importCountry) return
    setImporting(true)
    const res = await fetch(`/api/admin/packages/${id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_code: importCountry, product_type: pkg?.product_type }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error || '匯入失敗') }
    await loadData()
    setImporting(false)
  }

  async function handleImportSkus(skus: string[]) {
    setBatchImporting(true)
    await fetch(`/api/admin/packages/${id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_ids: skus }),
    })
    setBatchImporting(false)
    setBcSelectedSkus(new Set())
    await loadData()
  }

  function handlePriceChange(cpId: string, price: number) {
    setEditedPrices((prev) => new Map(prev).set(cpId, price))
  }

  async function handleSavePrices() {
    if (editedPrices.size === 0) return
    setSaving(true)
    const updates = Array.from(editedPrices.entries()).map(([id, sell_price]) => ({ id, sell_price }))
    await fetch(`/api/admin/packages/${id}/prices`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setEditedPrices(new Map())
    await loadData()
    setSaving(false)
  }

  async function handleRemovePlan(planId: string) {
    if (!confirm('確定移除？')) return
    await fetch(`/api/admin/packages/${id}/prices`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId }),
    })
    await loadData()
  }

  async function handleBatchDelete() {
    if (selectedPlanIds.size === 0) return
    if (!confirm(`確定移除 ${selectedPlanIds.size} 個？`)) return
    for (const planId of selectedPlanIds) {
      await fetch(`/api/admin/packages/${id}/prices`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }),
      })
    }
    setSelectedPlanIds(new Set())
    await loadData()
  }

  function handleBatchPriceApply() {
    const selected = plans.filter((p) => selectedPlanIds.has(p.id))
    const newPrices = new Map(editedPrices)
    for (const plan of selected) {
      for (const cp of plan.copy_prices) {
        if (batchMode === 'fixed') {
          const price = parseFloat(batchPrice)
          if (!isNaN(price)) newPrices.set(cp.id, price)
        } else if (batchMode === 'markup') {
          const markup = parseFloat(batchMarkup)
          if (!isNaN(markup) && cp.cost_price > 0 && exchangeRate > 0) {
            const costTwd = cp.cost_price / exchangeRate
            newPrices.set(cp.id, Math.ceil(costTwd * markup))
          }
        } else if (batchMode === 'formula') {
          // 混合公式：(成本TWD + 加價) × 倍率
          const add = parseFloat(batchAdd) || 0
          const markup = parseFloat(batchMarkup) || 1
          if (cp.cost_price > 0 && exchangeRate > 0) {
            const costTwd = cp.cost_price / exchangeRate
            newPrices.set(cp.id, Math.ceil((costTwd + add) * markup))
          }
        }
      }
    }
    setEditedPrices(newPrices)
    setShowBatchPrice(false)
  }

  function toggleExpand(planId: string) { setExpandedIds((p) => { const n = new Set(p); n.has(planId) ? n.delete(planId) : n.add(planId); return n }) }
  function expandAll() { setExpandedIds(new Set(plans.map((p) => p.id))) }
  function toggleSelect(planId: string) { setSelectedPlanIds((p) => { const n = new Set(p); n.has(planId) ? n.delete(planId) : n.add(planId); return n }) }
  function toggleSelectAll(group: BoundPlan[]) { const all = group.every((p) => selectedPlanIds.has(p.id)); setSelectedPlanIds((prev) => { const n = new Set(prev); group.forEach((p) => all ? n.delete(p.id) : n.add(p.id)); return n }) }

  async function searchBc(query: string) {
    setBcSearch(query)
    if (query.length < 2) { setBcResults([]); return }
    setBcLoading(true)
    const res = await fetch(`/api/admin/plans/search?q=${encodeURIComponent(query)}&type=${pkg?.product_type || 'esim'}`)
    if (res.ok) setBcResults(await res.json())
    setBcLoading(false)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!pkg) return <div>找不到套餐</div>

  const dailyPlans = plans.filter((p) => p.plan_category === 'daily')
  const fixedPlans = plans.filter((p) => p.plan_category === 'fixed')
  const hasChanges = editedPrices.size > 0

  return (
    <div>
      <Link href="/admin/packages" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回套餐列表
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pkg.name}</h1>
          <p className="text-xs text-gray-400 mt-1">{pkg.product_type.toUpperCase()} · {plans.length} 個 BC 商品</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Eye className="w-4 h-4" /> 預覽前台
          </button>
          <button onClick={expandAll} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">全部展開</button>
          <button onClick={() => setShowManual(true)} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Plus className="w-4 h-4" /> 手動新增
          </button>
        </div>
      </div>

      {/* Auto import by country */}
      <div className="mt-4 flex gap-2">
        <input value={importCountry} onChange={(e) => setImportCountry(e.target.value.toUpperCase())}
          placeholder="輸入國家代碼（如 JP）自動匯入" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64" />
        <button onClick={handleImportByCountry} disabled={importing || !importCountry}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <Download className="w-4 h-4" /> {importing ? '匯入中...' : '自動匯入'}
        </button>
      </div>

      {/* Batch bar */}
      {(selectedPlanIds.size > 0 || hasChanges) && (
        <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          {selectedPlanIds.size > 0 && (
            <>
              <span className="text-sm font-medium text-blue-700">已選 {selectedPlanIds.size} 個</span>
              <button onClick={() => setShowBatchPrice(true)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-600 text-xs font-medium rounded-lg">
                <DollarSign className="w-3.5 h-3.5" /> 批量定價
              </button>
              <button onClick={handleBatchDelete} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-lg">
                <Trash2 className="w-3.5 h-3.5" /> 批量刪除
              </button>
              <button onClick={() => setSelectedPlanIds(new Set())} className="text-xs text-gray-500">取消選取</button>
            </>
          )}
          <div className="flex-1" />
          {hasChanges && (
            <button onClick={handleSavePrices} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? '儲存中...' : `儲存（${editedPrices.size} 筆）`}
            </button>
          )}
        </div>
      )}

      {/* Plans table */}
      {plans.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">尚未匯入 BC 商品，使用上方的自動匯入或手動新增</p>
        </div>
      ) : (
        <>
          {dailyPlans.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">日費套餐（{dailyPlans.length}）</h2>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={dailyPlans.every((p) => selectedPlanIds.has(p.id))} onChange={() => toggleSelectAll(dailyPlans)} className="accent-blue-600" /> 全選
                </label>
              </div>
              <PlanTable plans={dailyPlans} editedPrices={editedPrices} onPriceChange={handlePriceChange}
                expandedIds={expandedIds} onToggleExpand={toggleExpand} onRemove={handleRemovePlan}
                selectedIds={selectedPlanIds} onToggleSelect={toggleSelect} exchangeRate={exchangeRate} />
            </div>
          )}
          {fixedPlans.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">固定套餐（{fixedPlans.length}）</h2>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={fixedPlans.every((p) => selectedPlanIds.has(p.id))} onChange={() => toggleSelectAll(fixedPlans)} className="accent-blue-600" /> 全選
                </label>
              </div>
              <PlanTable plans={fixedPlans} editedPrices={editedPrices} onPriceChange={handlePriceChange}
                expandedIds={expandedIds} onToggleExpand={toggleExpand} onRemove={handleRemovePlan}
                selectedIds={selectedPlanIds} onToggleSelect={toggleSelect} exchangeRate={exchangeRate} />
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      {showPreview && <PreviewModal pkg={pkg} plans={plans} editedPrices={editedPrices} onClose={() => setShowPreview(false)} />}

      {/* Batch Price Modal */}
      {showBatchPrice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold">批量定價</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={batchMode === 'formula'} onChange={() => setBatchMode('formula')} className="accent-blue-600" /><span className="text-sm">混合公式</span></label>
              <label className="flex items-center gap-2"><input type="radio" checked={batchMode === 'markup'} onChange={() => setBatchMode('markup')} className="accent-blue-600" /><span className="text-sm">倍率加成</span></label>
              <label className="flex items-center gap-2"><input type="radio" checked={batchMode === 'fixed'} onChange={() => setBatchMode('fixed')} className="accent-blue-600" /><span className="text-sm">固定價格</span></label>
            </div>
            {batchMode === 'fixed' && (
              <div className="mt-3">
                <input type="number" value={batchPrice} onChange={(e) => setBatchPrice(e.target.value)} placeholder="統一售價 (TWD)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">所有規格統一設為此售價</p>
              </div>
            )}
            {batchMode === 'markup' && (
              <div className="mt-3">
                <input type="number" step="0.1" value={batchMarkup} onChange={(e) => setBatchMarkup(e.target.value)} placeholder="例：1.5" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">售價 = 成本價(TWD) × 倍率</p>
              </div>
            )}
            {batchMode === 'formula' && (
              <div className="mt-3 space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm font-medium text-blue-700">公式：( 成本TWD + 加價 ) × 倍率</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">加價 (TWD)</label>
                    <input type="number" step="1" value={batchAdd} onChange={(e) => setBatchAdd(e.target.value)} placeholder="0"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">倍率</label>
                    <input type="number" step="0.1" value={batchMarkup} onChange={(e) => setBatchMarkup(e.target.value)} placeholder="1.5"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  範例：成本 NT$28 + 加價 3 = NT$31，× 1.5 = NT$47（無條件進位）
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={handleBatchPriceApply} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">套用</button>
              <button onClick={() => setShowBatchPrice(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {showManual && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-16 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold">手動新增 BC 商品</h2>
              <button onClick={() => setShowManual(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={bcSearch} onChange={(e) => searchBc(e.target.value)}
                  placeholder="輸入商品名稱、SKU 或國家代碼..." autoFocus
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            {bcResults.length > 0 && (
              <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox"
                    checked={bcResults.filter((p) => !plans.some((pl) => pl.bc_sku_id === p.sku_id)).every((p) => bcSelectedSkus.has(p.sku_id))}
                    onChange={() => {
                      const avail = bcResults.filter((p) => !plans.some((pl) => pl.bc_sku_id === p.sku_id))
                      const allSel = avail.every((p) => bcSelectedSkus.has(p.sku_id))
                      setBcSelectedSkus((prev) => { const n = new Set(prev); avail.forEach((p) => allSel ? n.delete(p.sku_id) : n.add(p.sku_id)); return n })
                    }}
                    className="accent-blue-600" /> 全選
                </label>
                {bcSelectedSkus.size > 0 && (
                  <button onClick={() => handleImportSkus(Array.from(bcSelectedSkus))} disabled={batchImporting}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                    <Download className="w-3.5 h-3.5" /> {batchImporting ? '匯入中...' : `批量匯入（${bcSelectedSkus.size}）`}
                  </button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {bcLoading ? <p className="text-sm text-gray-500 text-center py-4">搜尋中...</p>
                : bcResults.length === 0 && bcSearch.length >= 2 ? <p className="text-sm text-gray-500 text-center py-4">找不到</p>
                  : bcResults.map((p) => {
                    const added = plans.some((pl) => pl.bc_sku_id === p.sku_id)
                    return (
                      <div key={p.sku_id} className={`flex items-center gap-3 p-3 rounded-lg border mb-1 ${added ? 'opacity-60 border-gray-100' : bcSelectedSkus.has(p.sku_id) ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'}`}>
                        {!added && <input type="checkbox" checked={bcSelectedSkus.has(p.sku_id)} onChange={() => setBcSelectedSkus((prev) => { const n = new Set(prev); n.has(p.sku_id) ? n.delete(p.sku_id) : n.add(p.sku_id); return n })} className="accent-blue-600" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1.5">{p.sku_id} · {p.plan_type === '1' ? '單日型' : '總量型'} <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getSimColor(p.type)}`}>{getSimLabel(p.type)}</span></div>
                        </div>
                        {added && <span className="text-xs text-gray-400">已匯入</span>}
                      </div>
                    )
                  })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewModal({ pkg, plans, editedPrices, onClose }: {
  pkg: Pkg; plans: BoundPlan[]; editedPrices: Map<string, number>; onClose: () => void
}) {
  const [pvTab, setPvTab] = useState<'daily' | 'fixed'>('daily')
  const [pvSpeed, setPvSpeed] = useState('')
  const [pvDay, setPvDay] = useState('')
  const [pvFixed, setPvFixed] = useState(0)

  const dailyPlans = plans.filter((p) => p.plan_category === 'daily')
  const fixedPlans = plans.filter((p) => p.plan_category === 'fixed')

  // 日費：按速度分組
  const speedGroups = (() => {
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

  // 固定套餐
  const fixedOptions = (() => {
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

  const hasDailyGroups = speedGroups.length > 0
  const hasFixedOptions = fixedOptions.length > 0

  // 自動選
  useEffect(() => {
    if (hasDailyGroups && !pvSpeed) setPvSpeed(speedGroups[0].speed)
  }, [speedGroups, pvSpeed, hasDailyGroups])

  useEffect(() => {
    const group = speedGroups.find((g) => g.speed === pvSpeed)
    if (group && !pvDay) setPvDay(String(group.days[0]?.day || ''))
  }, [pvSpeed, speedGroups, pvDay])

  const currentGroup = speedGroups.find((g) => g.speed === pvSpeed)
  const currentDay = currentGroup?.days.find((d) => String(d.day) === pvDay)
  const currentFixed = fixedOptions[pvFixed]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">前台預覽</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-5 border border-blue-100">
            <h3 className="text-xl font-bold">{pkg.name}</h3>

            {hasDailyGroups && hasFixedOptions && (
              <div className="mt-4 flex rounded-lg overflow-hidden border border-gray-200">
                <button onClick={() => setPvTab('daily')} className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${pvTab === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}>日費套餐</button>
                <button onClick={() => setPvTab('fixed')} className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${pvTab === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}>固定套餐</button>
              </div>
            )}

            {/* Daily */}
            {((pvTab === 'daily' && hasDailyGroups) || (!hasFixedOptions && hasDailyGroups)) && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-700">選擇手機套餐</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {speedGroups.map((g) => (
                      <button key={g.speed} onClick={() => { setPvSpeed(g.speed); setPvDay('') }}
                        className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${pvSpeed === g.speed ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>{g.speed}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">選擇天數</div>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {currentGroup?.days.map((d) => (
                      <button key={d.day} onClick={() => setPvDay(String(d.day))}
                        className={`px-2 py-1.5 border rounded-lg text-center text-sm transition-all ${String(d.day) === pvDay ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>{d.day}</button>
                    ))}
                  </div>
                </div>
                {currentDay && (
                  <>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-sm text-gray-500">總計</span>
                      <span className="text-xl font-bold text-blue-600">NT$ {currentDay.price}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                      <div><span className="text-gray-400">SKU：</span><span className="font-mono">{currentDay.bc_sku_id}</span></div>
                      <div><span className="text-gray-400">Copies：</span>{currentDay.copies}</div>
                      <div><span className="text-gray-400">天數：</span>{currentDay.day} 天</div>
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
                        <div><div className="font-semibold text-sm">{opt.capacity}</div><div className="text-xs text-gray-500">{opt.days} 天</div></div>
                        <div className="font-semibold text-blue-600 text-sm">NT$ {opt.price}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {currentFixed && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                    <div><span className="text-gray-400">SKU：</span><span className="font-mono">{currentFixed.bc_sku_id}</span></div>
                    <div><span className="text-gray-400">Copies：</span>{currentFixed.copies}</div>
                    <div><span className="text-gray-400">天數：</span>{currentFixed.days} 天</div>
                  </div>
                )}
              </div>
            )}

            {!hasDailyGroups && !hasFixedOptions && (
              <div className="mt-4 text-center py-8 text-gray-400 text-sm">尚無已定價的套餐</div>
            )}
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
            <div>日費速度選項：{speedGroups.length} 個（{speedGroups.map((g) => g.speed).join('、') || '無'}）</div>
            <div>日費天數選項：{speedGroups[0]?.days.length || 0} 個</div>
            <div>固定套餐選項：{fixedOptions.length} 個</div>
            <div>未定價規格：{plans.reduce((sum, p) => sum + p.copy_prices.filter((cp) => cp.sell_price <= 0 && !editedPrices.has(cp.id)).length, 0)} 個</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanTable({ plans, editedPrices, onPriceChange, expandedIds, onToggleExpand, onRemove, selectedIds, onToggleSelect, exchangeRate }: {
  plans: BoundPlan[]; editedPrices: Map<string, number>; onPriceChange: (id: string, p: number) => void
  expandedIds: Set<string>; onToggleExpand: (id: string) => void; onRemove: (id: string) => void
  selectedIds: Set<string>; onToggleSelect: (id: string) => void; exchangeRate: number
}) {
  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
          <tr>
            <th className="w-10 px-3 py-3"></th>
            <th className="text-left px-3 py-3 font-medium min-w-[180px]">BC 商品名稱</th>
            <th className="text-left px-3 py-3 font-medium w-18">類型</th>
            <th className="text-left px-3 py-3 font-medium w-24">流量</th>
            <th className="text-left px-3 py-3 font-medium w-20">限速</th>
            <th className="text-left px-3 py-3 font-medium w-18">天數</th>
            <th className="text-right px-3 py-3 font-medium w-20">原始成本<br /><span className="text-xs font-normal">(CNY)</span></th>
            <th className="text-right px-3 py-3 font-medium w-20">成本價<br /><span className="text-xs font-normal">(CNY)</span></th>
            <th className="text-right px-3 py-3 font-medium w-20">成本價<br /><span className="text-xs font-normal">(TWD)</span></th>
            <th className="text-right px-3 py-3 font-medium w-24">售價<br /><span className="text-xs font-normal">(TWD)</span></th>
            <th className="text-right px-3 py-3 font-medium w-20">毛利率</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {plans.map((plan) => {
            const isExp = expandedIds.has(plan.id)
            const isDaily = plan.plan_type === '1'
            const unitDays = plan.days ?? 1
            const isSel = selectedIds.has(plan.id)
            const hasChanges = plan.copy_prices.some((cp) => cp.price_changed)
            return (
              <Fragment key={plan.id}>
                <tr className={`hover:bg-gray-50 cursor-pointer ${isExp ? 'bg-blue-50/30' : ''} ${isSel ? 'bg-blue-50/50' : ''} ${hasChanges ? 'bg-red-50/30' : ''}`} onClick={() => onToggleExpand(plan.id)}>
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(plan.id)} className="accent-blue-600" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-gray-400">{isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          {plan.bc_name}
                          {hasChanges && <span className="px-1 py-0.5 text-xs bg-red-100 text-red-600 rounded">異動</span>}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{plan.bc_sku_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className={`px-1.5 py-0.5 text-xs rounded ${getSimColor(plan.bc_type)}`}>{getSimLabel(plan.bc_type)}</span><div className="text-xs text-gray-400 mt-0.5">{isDaily ? '單日' : '總量'}</div></td>
                  <td className="px-3 py-3 text-xs">{formatCapacity(plan.high_flow_size ?? plan.capacity, isDaily)}</td>
                  <td className="px-3 py-3 text-xs">{formatSpeed(plan.limit_flow_speed)}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{plan.copy_prices.length > 0 ? `${plan.copy_prices.length} 規格` : '-'}</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">-</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">-</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">-</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">-</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">-</td>
                  <td className="px-3 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onRemove(plan.id)} className="p-1 text-gray-300 hover:text-red-500 rounded"><X className="w-4 h-4" /></button>
                  </td>
                </tr>
                {isExp && plan.copy_prices.map((cp) => {
                  const days = unitDays * parseInt(cp.copies)
                  const cur = editedPrices.has(cp.id) ? editedPrices.get(cp.id)! : cp.sell_price
                  const edited = editedPrices.has(cp.id)
                  const costTwd = exchangeRate > 0 ? Math.round(cp.cost_price / exchangeRate) : 0
                  const margin = cur > 0 && costTwd > 0 ? Math.round(((cur - costTwd) / cur) * 100) : 0
                  return (
                    <tr key={cp.id} className={`hover:bg-gray-100/50 ${cp.price_changed ? 'bg-red-50/50' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 pl-10" colSpan={3}></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-gray-700 font-medium text-xs"><span className="text-gray-400">└ </span>{days} 天</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-400">
                        {cp.original_cost_price != null ? `¥${cp.original_cost_price}` : '-'}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${cp.price_changed ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        ¥{cp.cost_price}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500">
                        {costTwd > 0 ? `NT$${costTwd}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <input type="number" value={cur || ''} onChange={(e) => onPriceChange(cp.id, Number(e.target.value))} placeholder="售價"
                          className={`w-24 px-2 py-1 text-right border rounded text-sm ${cp.price_changed && !edited ? 'border-red-400 bg-red-50' : edited ? 'border-green-400 bg-green-50' : cp.sell_price > 0 ? 'border-gray-300' : 'border-orange-300 bg-orange-50'}`} />
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {margin > 0 ? <span className={`${margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-500'}`}>{margin}%</span> : '-'}
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
