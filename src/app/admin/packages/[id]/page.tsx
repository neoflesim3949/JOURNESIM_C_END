'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Save, ChevronDown, ChevronRight, Plus, X, Trash2, DollarSign, Eye } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'
import { buildOptionCode } from '@/lib/option-code'

import { getTypeLabels } from '@/lib/bc-enums'
import PlanCompareModal from '@/components/admin/plan-compare-modal'
import type { ComparePlan } from '@/components/admin/plan-compare-table'
import BcDetailModal from '@/components/admin/bc-detail-modal'
import { BcMatchModal } from '@/components/admin/bc-match-modal'
import { roundPrice, type RoundMode } from '@/lib/shopee-pricing'
import CountryMultiSelect from '@/components/admin/country-multi-select'

interface CopyPrice { id: string; copies: string; cost_price: number; original_cost_price: number | null; ref_price: number | null; sell_price: number; price_changed: boolean }
interface BoundPlan {
  id: string; bc_sku_id: string; bc_name: string; bc_type: string
  display_name: string | null; sort_order: number
  plan_category: 'daily' | 'fixed'; days: number | null
  capacity: string | null; high_flow_size: string | null
  limit_flow_speed: string | null; plan_type: string | null
  rechargeable_product: string | null
  is_active: boolean; is_unlimited?: boolean; copy_prices: CopyPrice[]
}
interface Pkg {
  id: string; name: string; description: string | null; product_type: string
  category?: string | null; tags?: string[] | null; countries?: string[] | null
  main_option_code?: string | null
}

export default function PackageDetailPage() {
  const { id } = useParams() as { id: string }
  const [pkg, setPkg] = useState<Pkg | null>(null)
  const [plans, setPlans] = useState<BoundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedPrices, setEditedPrices] = useState<Map<string, number>>(new Map())
  const [editedRefs, setEditedRefs] = useState<Map<string, number | null>>(new Map())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [showBatchPrice, setShowBatchPrice] = useState(false)
  const [batchMode, setBatchMode] = useState<'fixed' | 'markup' | 'formula'>('formula')
  const [batchPrice, setBatchPrice] = useState('')
  const [batchMarkup, setBatchMarkup] = useState('1.5')
  const [batchAdd, setBatchAdd] = useState('3')
  const [batchRound, setBatchRound] = useState<RoundMode>('ceil')
  const [batchRoundTo, setBatchRoundTo] = useState('1')
  const [showPreview, setShowPreview] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [batchImporting, setBatchImporting] = useState(false)
  // 編輯套餐資訊（行內，always-visible）
  const [editForm, setEditForm] = useState({ name: '', product_type: 'esim', category: '', tagsText: '', description: '', countries: [] as string[], mainCode: '' })
  const [countryOpts, setCountryOpts] = useState<{ mcc: string; name: string }[]>([])
  const [savingInfo, setSavingInfo] = useState(false)
  const parseTags = (s: string) => s.split(/[,，]/).map(t => t.trim()).filter(Boolean)
  async function saveEdit() {
    setSavingInfo(true)
    await fetch('/api/admin/packages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editForm.name, product_type: editForm.product_type, category: editForm.category, tags: parseTags(editForm.tagsText), description: editForm.description, countries: editForm.countries, main_option_code: editForm.mainCode }),
    })
    await loadData(); setSavingInfo(false)
  }
  const [importCountry, setImportCountry] = useState('')
  const [exchangeRate, setExchangeRate] = useState(0)
  // 商品詳情彈窗
  const [detailSku, setDetailSku] = useState<string | null>(null)
  // 流量排序
  const [flowSort, setFlowSort] = useState<'' | 'asc' | 'desc'>('')
  // 比價彈窗（用 BC 原始結算/零售價比同 copies）
  const [comparePlans, setComparePlans] = useState<ComparePlan[] | null>(null)
  const [compareMode, setCompareMode] = useState<'cost' | 'sell'>('cost')
  async function openCompare(skuIds: string[]) {
    if (skuIds.length === 0) return
    const res = await fetch(`/api/admin/plans/compare?skus=${skuIds.join(',')}`)
    const d = await res.json()
    setCompareMode('cost')
    setComparePlans(d.items || [])
  }
  // 售價比價：用本頁套餐的 copy_prices 售價（TWD）比同 copies
  function openSellCompare(planList: BoundPlan[]) {
    if (planList.length === 0) return
    const items: ComparePlan[] = planList.map(p => ({
      sku_id: p.bc_sku_id, name: p.bc_name, type: p.bc_type, plan_type: p.plan_type,
      days: p.days, capacity: p.capacity, high_flow_size: p.high_flow_size, limit_flow_speed: p.limit_flow_speed,
      prices: p.copy_prices.map(cp => ({ copies: cp.copies, retailPrice: String(cp.sell_price), settlementPrice: String(cp.sell_price), costTwd: exchangeRate > 0 ? Math.round(cp.cost_price / exchangeRate) : 0 })),
    }))
    setCompareMode('sell')
    setComparePlans(items)
  }

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
  useEffect(() => {
    fetch('/api/admin/shopee/bc-search?action=options')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.countries) setCountryOpts(d.countries.map((c: { mcc: string; name: string }) => ({ mcc: c.mcc, name: `${c.name}（${c.mcc}）` }))) })
      .catch(() => {})
  }, [])
  // 套餐載入後帶入行內編輯表單
  useEffect(() => {
    if (pkg) setEditForm({ name: pkg.name, product_type: pkg.product_type, category: pkg.category || '', tagsText: (pkg.tags || []).join(', '), description: pkg.description || '', countries: pkg.countries || [], mainCode: pkg.main_option_code || '' })
  }, [pkg])

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
    await loadData()
  }

  function handlePriceChange(cpId: string, price: number) {
    setEditedPrices((prev) => new Map(prev).set(cpId, price))
  }

  function handleRefChange(cpId: string, ref: number | null) {
    setEditedRefs((prev) => new Map(prev).set(cpId, ref))
  }

  // 切換「吃到飽」（影響選項貨號是否加 F）
  async function handleToggleUnlimited(planId: string, val: boolean) {
    await fetch(`/api/admin/packages/${id}/prices`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_updates: [{ id: planId, is_unlimited: val }] }),
    })
    await loadData()
  }

  async function handleSavePrices() {
    if (editedPrices.size === 0 && editedRefs.size === 0) return
    setSaving(true)
    const merged = new Map<string, { id: string; sell_price?: number; ref_price?: number | null }>()
    for (const [id, sell_price] of editedPrices) merged.set(id, { ...(merged.get(id) || { id }), id, sell_price })
    for (const [id, ref_price] of editedRefs) merged.set(id, { ...(merged.get(id) || { id }), id, ref_price })
    await fetch(`/api/admin/packages/${id}/prices`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: Array.from(merged.values()) }),
    })
    setEditedPrices(new Map())
    setEditedRefs(new Map())
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
            newPrices.set(cp.id, roundPrice(costTwd * markup, batchRound, Number(batchRoundTo)))
          }
        } else if (batchMode === 'formula') {
          // 混合公式：(成本TWD + 加價) × 倍率
          const add = parseFloat(batchAdd) || 0
          const markup = parseFloat(batchMarkup) || 1
          if (cp.cost_price > 0 && exchangeRate > 0) {
            const costTwd = cp.cost_price / exchangeRate
            newPrices.set(cp.id, roundPrice((costTwd + add) * markup, batchRound, Number(batchRoundTo)))
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


  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!pkg) return <div>找不到套餐</div>

  const flowVal = (p: BoundPlan) => Number(p.high_flow_size ?? p.capacity) || 0
  const sortFlow = (arr: BoundPlan[]) => flowSort ? [...arr].sort((a, b) => flowSort === 'asc' ? flowVal(a) - flowVal(b) : flowVal(b) - flowVal(a)) : arr
  const toggleFlowSort = () => setFlowSort(s => s === 'asc' ? 'desc' : s === 'desc' ? '' : 'asc')
  const dailyPlans = sortFlow(plans.filter((p) => p.plan_category === 'daily'))
  const fixedPlans = sortFlow(plans.filter((p) => p.plan_category === 'fixed'))
  const hasChanges = editedPrices.size > 0 || editedRefs.size > 0
  const changeCount = new Set([...editedPrices.keys(), ...editedRefs.keys()]).size

  // 手動拖曳排序某分組（更新 plans 並存 sort_order）
  async function reorderGroup(orderedIds: string[]) {
    const idSet = new Set(orderedIds)
    const byId = new Map(plans.map((p) => [p.id, p]))
    const positions: number[] = []
    plans.forEach((p, i) => { if (idSet.has(p.id)) positions.push(i) })
    const newPlans = [...plans]
    positions.forEach((pos, k) => { const pl = byId.get(orderedIds[k]); if (pl) newPlans[pos] = pl })
    setPlans(newPlans)
    await fetch(`/api/admin/packages/${id}/prices`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_updates: newPlans.map((p, i) => ({ id: p.id, sort_order: i })) }),
    })
  }

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

      {/* 套餐資訊（行內編輯） */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">套餐資訊</span>
          <button onClick={saveEdit} disabled={savingInfo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {savingInfo ? '儲存中…' : '儲存資訊'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">套餐名稱</label>
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">類型</label>
            <select value={editForm.product_type} onChange={e => setEditForm({ ...editForm, product_type: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="esim">eSIM</option><option value="sim">SIM</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">主選項ID（生成貨號用）</label>
            <input value={editForm.mainCode} onChange={e => setEditForm({ ...editForm, mainCode: e.target.value })} placeholder="例：JPIIJ"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-500">分類</label>
            <input value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} placeholder="例：東南亞"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">標籤（逗號分隔）</label>
            <input value={editForm.tagsText} onChange={e => setEditForm({ ...editForm, tagsText: e.target.value })} placeholder="例：熱門, 促銷"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">國家（多選；篩 APN/電信商）</label>
            <CountryMultiSelect options={countryOpts} value={editForm.countries}
              onChange={v => setEditForm({ ...editForm, countries: v })} placeholder="搜尋國家（中文或 MCC）" className="mt-1 w-full" />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-gray-500">描述（選填）</label>
            <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="套餐描述"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
      </div>

      {/* Batch bar */}
      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={plans.length > 0 && selectedPlanIds.size === plans.length} onChange={() => { if (selectedPlanIds.size === plans.length) setSelectedPlanIds(new Set()); else setSelectedPlanIds(new Set(plans.map(p => p.id))) }} className="accent-blue-600" /> 全選（{plans.length}）
        </label>
        {plans.length > 1 && (
          <>
            <button onClick={() => openCompare([...new Set(plans.map(p => p.bc_sku_id))])}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
              成本比價（全部 {plans.length}）
            </button>
            <button onClick={() => openSellCompare(plans)}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
              售價比價（全部 {plans.length}）
            </button>
          </>
        )}
      </div>

      {(selectedPlanIds.size > 0 || hasChanges) && (
        <div className="mt-2 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          {selectedPlanIds.size > 0 && (
            <>
              <span className="text-sm font-medium text-blue-700">已選 {selectedPlanIds.size} 個</span>
              <button onClick={() => setShowBatchPrice(true)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-600 text-xs font-medium rounded-lg">
                <DollarSign className="w-3.5 h-3.5" /> 批量定價
              </button>
              <button onClick={handleBatchDelete} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-lg">
                <Trash2 className="w-3.5 h-3.5" /> 批量刪除
              </button>
              <button onClick={() => openCompare([...new Set(plans.filter(p => selectedPlanIds.has(p.id)).map(p => p.bc_sku_id))])}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg">
                成本比價（選取）
              </button>
              <button onClick={() => openSellCompare(plans.filter(p => selectedPlanIds.has(p.id)))}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 text-xs font-medium rounded-lg">
                售價比價（選取）
              </button>
              <button onClick={() => setSelectedPlanIds(new Set())} className="text-xs text-gray-500">取消選取</button>
            </>
          )}
          <div className="flex-1" />
          {hasChanges && (
            <button onClick={handleSavePrices} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? '儲存中...' : `儲存（${changeCount} 筆）`}
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
              <PlanTable plans={dailyPlans} mainCode={pkg?.main_option_code || ''} onToggleUnlimited={handleToggleUnlimited} editedPrices={editedPrices} onPriceChange={handlePriceChange} editedRefs={editedRefs} onRefChange={handleRefChange}
                expandedIds={expandedIds} onToggleExpand={toggleExpand} onRemove={handleRemovePlan}
                selectedIds={selectedPlanIds} onToggleSelect={toggleSelect} exchangeRate={exchangeRate}
                onDetail={setDetailSku} flowSort={flowSort} onToggleFlowSort={toggleFlowSort} canDrag={!flowSort} onReorder={reorderGroup} />
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
              <PlanTable plans={fixedPlans} mainCode={pkg?.main_option_code || ''} onToggleUnlimited={handleToggleUnlimited} editedPrices={editedPrices} onPriceChange={handlePriceChange} editedRefs={editedRefs} onRefChange={handleRefChange}
                expandedIds={expandedIds} onToggleExpand={toggleExpand} onRemove={handleRemovePlan}
                selectedIds={selectedPlanIds} onToggleSelect={toggleSelect} exchangeRate={exchangeRate}
                onDetail={setDetailSku} flowSort={flowSort} onToggleFlowSort={toggleFlowSort} canDrag={!flowSort} onReorder={reorderGroup} />
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      {showPreview && <PreviewModal pkg={pkg} plans={plans} editedPrices={editedPrices} packageId={id} onClose={() => setShowPreview(false)} onSaved={loadData} />}

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
            {batchMode !== 'fixed' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">進位方式</label>
                  <select value={batchRound} onChange={(e) => setBatchRound(e.target.value as RoundMode)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="ceil">無條件進位</option>
                    <option value="round">四捨五入</option>
                    <option value="floor">無條件捨去</option>
                    <option value="none">不進位</option>
                    <option value="ceil95">無條件進至95</option>
                    <option value="floor95">無條件捨至95</option>
                    <option value="round9">四捨五入至9</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">進位單位</label>
                  <input type="number" value={batchRoundTo} onChange={(e) => setBatchRoundTo(e.target.value)}
                    disabled={['ceil95', 'floor95', 'round9', 'none'].includes(batchRound)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100" />
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={handleBatchPriceApply} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">套用</button>
              <button onClick={() => setShowBatchPrice(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Modal — 重用 BC 對應彈窗（add 模式：多選 + 詳情 + 價格） */}
      {showManual && (
        <BcMatchModal mode="add" subtitle={pkg.name} adding={batchImporting}
          defaultKind={pkg.product_type === 'sim' ? 'sim' : 'esim'}
          existingSkus={new Set(plans.map((p) => p.bc_sku_id))}
          onAdd={async (skus) => { await handleImportSkus(skus); setShowManual(false) }}
          onClose={() => setShowManual(false)} />
      )}
      {comparePlans && <PlanCompareModal plans={comparePlans} mode={compareMode} onClose={() => setComparePlans(null)} />}
      {detailSku && <BcDetailModal skuId={detailSku} onClose={() => setDetailSku(null)} />}
    </div>
  )
}

function PreviewModal({ pkg, plans, editedPrices, packageId, onClose, onSaved }: {
  pkg: Pkg; plans: BoundPlan[]; editedPrices: Map<string, number>; packageId: string; onClose: () => void; onSaved: () => void
}) {
  const [pvTab, setPvTab] = useState<'daily' | 'fixed'>('daily')
  const [pvSpeed, setPvSpeed] = useState('')
  const [pvDay, setPvDay] = useState('')
  const [pvFixed, setPvFixed] = useState('')
  const [pvFixedDay, setPvFixedDay] = useState('')
  const [editing, setEditing] = useState(false)
  const [orderEdits, setOrderEdits] = useState<{ id: string; display_name: string; speed: string; bc_name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const dailyPlans = plans.filter((p) => p.plan_category === 'daily')
  const fixedPlans = plans.filter((p) => p.plan_category === 'fixed')

  const dailyOptions = (() => {
    const opts: { id: string; speed: string; label: string; rawSize: number; sortOrder: number; bc_sku_id: string; bc_name: string; days: { day: number; price: number; copies: string }[] }[] = []
    for (const plan of dailyPlans) {
      const speed = formatCapacity(plan.high_flow_size ?? plan.capacity, true)
      const rawSize = parseFloat(plan.high_flow_size ?? plan.capacity ?? '0')
      const unitDays = plan.days ?? 1
      const days: { day: number; price: number; copies: string }[] = []
      for (const cp of plan.copy_prices) {
        const price = editedPrices.has(cp.id) ? editedPrices.get(cp.id)! : cp.sell_price
        if (price <= 0) continue
        days.push({ day: unitDays * parseInt(cp.copies), price, copies: cp.copies })
      }
      if (days.length > 0) {
        days.sort((a, b) => a.day - b.day)
        opts.push({ id: plan.id, speed, label: plan.display_name || speed, rawSize, sortOrder: plan.sort_order, bc_sku_id: plan.bc_sku_id, bc_name: plan.bc_name, days })
      }
    }
    return opts.sort((a, b) => a.sortOrder - b.sortOrder || a.rawSize - b.rawSize)
  })()

  // 固定套餐：按容量分組，每組有天數選項
  const fixedGroups = (() => {
    const groups = new Map<string, { capacity: string; rawSize: number; bc_sku_id: string; bc_name: string; days: { day: number; price: number; copies: string }[] }>()
    for (const plan of fixedPlans) {
      const raw = formatCapacity(plan.high_flow_size ?? plan.capacity, false)
      const capacity = raw === '不限量' ? raw : `總量${raw}`
      const rawSize = parseFloat(plan.high_flow_size ?? plan.capacity ?? '0')
      const unitDays = plan.days ?? 1
      if (!groups.has(plan.bc_sku_id)) groups.set(plan.bc_sku_id, { capacity, rawSize, bc_sku_id: plan.bc_sku_id, bc_name: plan.bc_name, days: [] })
      for (const cp of plan.copy_prices) {
        const price = editedPrices.has(cp.id) ? editedPrices.get(cp.id)! : cp.sell_price
        if (price <= 0) continue
        groups.get(plan.bc_sku_id)!.days.push({ day: unitDays * parseInt(cp.copies), price, copies: cp.copies })
      }
    }
    return Array.from(groups.values())
      .filter((g) => g.days.length > 0)
      .map((g) => ({ ...g, days: g.days.sort((a, b) => a.day - b.day) }))
      .sort((a, b) => a.rawSize - b.rawSize)
  })()

  const hasDailyOptions = dailyOptions.length > 0
  const hasFixedOptions = fixedGroups.length > 0

  useEffect(() => {
    if (hasDailyOptions && !pvSpeed) setPvSpeed(dailyOptions[0].bc_sku_id)
  }, [dailyOptions, pvSpeed, hasDailyOptions])

  useEffect(() => {
    const opt = dailyOptions.find((o) => o.bc_sku_id === pvSpeed)
    if (opt && opt.days.length > 0 && !pvDay) setPvDay(String(opt.days[0].day))
  }, [pvSpeed, dailyOptions, pvDay])

  const currentOption = dailyOptions.find((o) => o.bc_sku_id === pvSpeed)
  const currentDay = currentOption?.days.find((d) => String(d.day) === pvDay)
  const currentFixedGroup = fixedGroups.find((g) => g.bc_sku_id === pvFixed)
  const currentFixedDay = currentFixedGroup?.days.find((d) => String(d.day) === pvFixedDay)

  function startEditing() {
    setOrderEdits(dailyOptions.map((o) => ({ id: o.id, display_name: o.label === o.speed ? '' : o.label, speed: o.speed, bc_name: o.bc_name })))
    setEditing(true)
  }

  async function saveEdits() {
    setSaving(true)
    await fetch(`/api/admin/packages/${packageId}/prices`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_updates: orderEdits.map((p, i) => ({ id: p.id, display_name: p.display_name, sort_order: i })) }),
    })
    setSaving(false); setEditing(false); onSaved()
  }

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

            <div className="mt-4 flex rounded-lg overflow-hidden border border-gray-200">
              <button onClick={() => setPvTab('daily')} className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${pvTab === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}>日費套餐</button>
              <button onClick={() => setPvTab('fixed')} className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${pvTab === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}>固定套餐</button>
            </div>

            {/* Daily */}
            {pvTab === 'daily' && (
              hasDailyOptions ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">選擇方案</div>
                    {!editing ? (
                      <button onClick={startEditing} className="text-xs text-blue-600 hover:underline">編輯排序</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={saveEdits} disabled={saving} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">{saving ? '儲存中' : '儲存'}</button>
                        <button onClick={() => setEditing(false)} className="px-2 py-0.5 border border-gray-300 text-xs rounded hover:bg-gray-50">取消</button>
                      </div>
                    )}
                  </div>

                  {editing ? (
                    <div className="space-y-1.5">
                      {orderEdits.map((p, i) => (
                        <div key={p.id} draggable
                          onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (dragIdx === null || dragIdx === i) return; const arr = [...orderEdits]; const [m] = arr.splice(dragIdx, 1); arr.splice(i, 0, m); setOrderEdits(arr); setDragIdx(null) }}
                          className={`flex items-center gap-2 p-2 border rounded-lg ${dragIdx === i ? 'bg-blue-50 border-blue-300' : 'border-gray-200 hover:bg-gray-50'} cursor-grab active:cursor-grabbing`}>
                          <span className="text-gray-300 text-sm select-none">☰</span>
                          <input value={p.display_name} onChange={(e) => { const arr = [...orderEdits]; arr[i] = { ...arr[i], display_name: e.target.value }; setOrderEdits(arr) }}
                            placeholder={p.speed} className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm" />
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">{p.speed}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dailyOptions.map((o) => (
                        <button key={o.bc_sku_id} onClick={() => { setPvSpeed(o.bc_sku_id); setPvDay('') }}
                          className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${pvSpeed === o.bc_sku_id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {!editing && (
                    <>
                      <div>
                        <div className="text-sm font-medium text-gray-700">選擇天數</div>
                        <div className="mt-2 grid grid-cols-6 gap-2">
                          {currentOption?.days.map((d) => (
                            <button key={d.day} onClick={() => setPvDay(String(d.day))}
                              className={`px-2 py-1.5 border rounded-lg text-center text-sm transition-all ${String(d.day) === pvDay ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>
                              {d.day}
                            </button>
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
                            <div><span className="text-gray-400">SKU：</span><span className="font-mono">{currentOption?.bc_sku_id}</span></div>
                            <div><span className="text-gray-400">名稱：</span>{currentOption?.bc_name}</div>
                            <div><span className="text-gray-400">Copies：</span>{currentDay.copies}</div>
                            <div><span className="text-gray-400">天數：</span>{currentDay.day} 天</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-4 text-center py-8 text-gray-400 text-sm">無日費方案</div>
              )
            )}

            {/* Fixed */}
            {pvTab === 'fixed' && (
              hasFixedOptions ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-700">選擇方案</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fixedGroups.map((g) => (
                      <button key={g.bc_sku_id} onClick={() => { setPvFixed(g.bc_sku_id); setPvFixedDay('') }}
                        className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${pvFixed === g.bc_sku_id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>
                        {g.capacity}
                      </button>
                    ))}
                  </div>
                </div>
                {currentFixedGroup && (
                  <div>
                    <div className="text-sm font-medium text-gray-700">選擇天數</div>
                    <div className="mt-2 grid grid-cols-6 gap-2">
                      {currentFixedGroup.days.map((d) => (
                        <button key={d.day} onClick={() => setPvFixedDay(String(d.day))}
                          className={`px-2 py-1.5 border rounded-lg text-center text-sm transition-all ${String(d.day) === pvFixedDay ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}>
                          {d.day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {currentFixedDay && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-sm text-gray-500">總計</span>
                    <span className="text-xl font-bold text-blue-600">NT$ {currentFixedDay.price}</span>
                  </div>
                )}
                {currentFixedGroup && (
                  <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                    <div><span className="text-gray-400">SKU：</span><span className="font-mono">{currentFixedGroup.bc_sku_id}</span></div>
                    <div><span className="text-gray-400">名稱：</span>{currentFixedGroup.bc_name}</div>
                    <div><span className="text-gray-400">Copies：</span>{currentFixedDay?.copies || '—'}</div>
                    <div><span className="text-gray-400">天數：</span>{currentFixedDay ? `${currentFixedDay.day} 天` : '—'}</div>
                  </div>
                )}
              </div>
              ) : (
                <div className="mt-4 text-center py-8 text-gray-400 text-sm">無固定方案</div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanTable({ plans, mainCode, onToggleUnlimited, editedPrices, onPriceChange, editedRefs, onRefChange, expandedIds, onToggleExpand, onRemove, selectedIds, onToggleSelect, exchangeRate, onDetail, flowSort, onToggleFlowSort, canDrag, onReorder }: {
  plans: BoundPlan[]; mainCode: string; onToggleUnlimited: (planId: string, val: boolean) => void; editedPrices: Map<string, number>; onPriceChange: (id: string, p: number) => void
  editedRefs: Map<string, number | null>; onRefChange: (id: string, r: number | null) => void
  expandedIds: Set<string>; onToggleExpand: (id: string) => void; onRemove: (id: string) => void
  selectedIds: Set<string>; onToggleSelect: (id: string) => void; exchangeRate: number
  onDetail: (skuId: string) => void; flowSort: '' | 'asc' | 'desc'; onToggleFlowSort: () => void
  canDrag: boolean; onReorder: (orderedIds: string[]) => void
}) {
  const [dragI, setDragI] = useState<number | null>(null)
  function dropRow(i: number) {
    if (dragI === null || dragI === i) { setDragI(null); return }
    const arr = [...plans]; const [m] = arr.splice(dragI, 1); arr.splice(i, 0, m)
    setDragI(null); onReorder(arr.map(p => p.id))
  }
  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
          <tr>
            <th className="w-10 px-3 py-3"></th>
            <th className="text-left px-3 py-3 font-medium min-w-[180px]">BC 商品名稱</th>
            <th className="text-left px-3 py-3 font-medium w-18">類型</th>
            <th className="text-left px-3 py-3 font-medium w-24">
              <button onClick={onToggleFlowSort} className="inline-flex items-center gap-1 hover:text-gray-700">
                流量 <span className="text-[10px]">{flowSort === 'asc' ? '▲' : flowSort === 'desc' ? '▼' : '⇅'}</span>
              </button>
            </th>
            <th className="text-left px-3 py-3 font-medium w-20">限速</th>
            <th className="text-left px-3 py-3 font-medium w-18">天數</th>
            <th className="text-right px-3 py-3 font-medium w-20">原始成本<br /><span className="text-xs font-normal">(CNY)</span></th>
            <th className="text-right px-3 py-3 font-medium w-20">成本價<br /><span className="text-xs font-normal">(CNY)</span></th>
            <th className="text-right px-3 py-3 font-medium w-20">成本價<br /><span className="text-xs font-normal">(TWD)</span></th>
            <th className="text-right px-3 py-3 font-medium w-24">參考價<br /><span className="text-xs font-normal">(TWD)</span></th>
            <th className="text-right px-3 py-3 font-medium w-24">售價<br /><span className="text-xs font-normal">(TWD)</span></th>
            <th className="text-right px-3 py-3 font-medium w-20">毛利率</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {plans.map((plan, i) => {
            const isExp = expandedIds.has(plan.id)
            const isDaily = plan.plan_type === '1'
            const unitDays = plan.days ?? 1
            const isSel = selectedIds.has(plan.id)
            const hasChanges = plan.copy_prices.some((cp) => cp.price_changed)
            return (
              <Fragment key={plan.id}>
                <tr draggable={canDrag}
                  onDragStart={() => canDrag && setDragI(i)}
                  onDragOver={(e) => { if (canDrag && dragI !== null) e.preventDefault() }}
                  onDrop={() => canDrag && dropRow(i)}
                  className={`hover:bg-gray-50 cursor-pointer ${dragI === i ? 'bg-blue-50 opacity-60' : isExp ? 'bg-blue-50/30' : isSel ? 'bg-blue-50/50' : hasChanges ? 'bg-red-50/30' : ''}`} onClick={() => onToggleExpand(plan.id)}>
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {canDrag && <span className="text-gray-300 cursor-grab active:cursor-grabbing select-none" title="拖曳排序">⠿</span>}
                      <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(plan.id)} className="accent-blue-600" />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-gray-400">{isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          <button onClick={(e) => { e.stopPropagation(); onDetail(plan.bc_sku_id) }} className="text-left hover:text-blue-600 hover:underline">{plan.bc_name}</button>
                          <button onClick={(e) => { e.stopPropagation(); onDetail(plan.bc_sku_id) }} title="查看詳情" className="text-gray-300 hover:text-blue-600 shrink-0"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); onToggleUnlimited(plan.id, !plan.is_unlimited) }}
                            title={plan.is_unlimited ? '吃到飽（貨號加 F）— 點擊取消' : '標記吃到飽（貨號加 F）'}
                            className={`px-1.5 py-0.5 text-xs rounded shrink-0 ${plan.is_unlimited ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>吃到飽</button>
                          {hasChanges && <span className="px-1 py-0.5 text-xs bg-red-100 text-red-600 rounded">異動</span>}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{plan.bc_sku_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{getTypeLabels(plan.bc_type, plan.rechargeable_product).map((t) => <span key={t.label} className={`px-1.5 py-0.5 text-xs rounded ${t.color}`}>{t.label}</span>)}</div><div className="text-xs text-gray-400 mt-0.5">{isDaily ? '單日' : '總量'}</div></td>
                  <td className="px-3 py-3 text-xs">{formatCapacity(plan.high_flow_size ?? plan.capacity, isDaily)}</td>
                  <td className="px-3 py-3 text-xs">{formatSpeed(plan.limit_flow_speed)}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{plan.copy_prices.length > 0 ? `${plan.copy_prices.length} 規格` : '-'}</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">-</td>
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
                  const refEdited = editedRefs.has(cp.id)
                  const refVal = refEdited ? editedRefs.get(cp.id)! : cp.ref_price
                  const costTwd = exchangeRate > 0 ? Math.round(cp.cost_price / exchangeRate) : 0
                  const margin = cur > 0 && costTwd > 0 ? Math.round(((cur - costTwd) / cur) * 100) : 0
                  return (
                    <tr key={cp.id} className={`hover:bg-gray-100/50 ${cp.price_changed ? 'bg-red-50/50' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 pl-10" colSpan={3}>
                        {(() => {
                          const code = buildOptionCode(mainCode, plan, days, plan.is_unlimited)
                          return code ? (
                            <button type="button" onClick={() => { navigator.clipboard?.writeText(code) }}
                              title="點擊複製選項貨號" className="font-mono text-[11px] text-gray-500 hover:text-blue-600">
                              {code}
                            </button>
                          ) : <span className="text-[10px] text-gray-300">設定「主選項ID」後產生貨號</span>
                        })()}
                      </td>
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
                        <input type="number" value={refVal ?? ''} onChange={(e) => onRefChange(cp.id, e.target.value === '' ? null : Number(e.target.value))} placeholder="參考價"
                          className={`w-24 px-2 py-1 text-right border rounded text-sm ${refEdited ? 'border-green-400 bg-green-50' : 'border-gray-300'}`} />
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
