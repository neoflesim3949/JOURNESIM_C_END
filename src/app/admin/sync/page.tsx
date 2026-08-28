'use client'

import { Fragment, useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Database, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { getProductTypeLabel, getPlanTypeLabel, getSalesMethodLabel } from '@/lib/bc-enums'
import { formatCapacity, formatSpeed } from '@/lib/format'

interface SyncResult {
  type: string
  success: boolean
  message: string
}

interface BCCountryRow {
  id: string
  mcc: string
  name: string
  continent: string
  created_at: string
}

interface BCProductRow {
  id: string
  sku_id: string
  name: string
  type: string | null
  sales_method: string | null
  days: number | null
  capacity: string | null
  high_flow_size: string | null
  limit_flow_speed: string | null
  plan_type: string | null
  updated_at: string
  delisted_at?: string | null
  prices?: PriceTier[] | null
  cost_price?: number | null
  prev_cost_price?: number | null
  prev_prices?: PriceTier[] | null
}
interface PriceTier { copies: string; retailPrice: string; settlementPrice: string }
// copies=1 的結算價
const tierSettle = (prices?: PriceTier[] | null): number | null => { if (!Array.isArray(prices)) return null; const t = prices.find((x) => String(x.copies) === '1'); const v = t?.settlementPrice; return v != null && v !== '' ? Number(v) : null }
const changePct = (oldV: number | null, newV: number | null): number | null => (oldV != null && newV != null && oldV !== 0) ? Math.round(((newV - oldV) / oldV) * 1000) / 10 : null

interface SkuRef { sku_id: string; name: string | null }
interface ChangedRef { sku_id: string; name: string | null; old_cost: number | null; new_cost: number | null }
interface SyncDiff {
  id: string; synced_at: string; scope?: string; bc_count: number | null; db_count: number | null
  added_count: number; removed_count: number; changed_count?: number
  added: SkuRef[] | null; removed: SkuRef[] | null; changed?: ChangedRef[] | null
  applied_removal: boolean; note: string | null
}

export default function AdminSyncPage() {
  const [results, setResults] = useState<SyncResult[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'countries' | 'products' | 'delisted'>('countries')
  const [diffs, setDiffs] = useState<SyncDiff[]>([])
  const [showDiffLists, setShowDiffLists] = useState(false)
  const [selIdx, setSelIdx] = useState(0)   // 選看哪一次同步的比對
  const [expandedSku, setExpandedSku] = useState<Set<string>>(new Set())   // 展開看所有 copies 價格

  // 下架商品 state
  const [delisted, setDelisted] = useState<BCProductRow[]>([])
  const [delistedTotal, setDelistedTotal] = useState(0)
  const [delistedPage, setDelistedPage] = useState(1)
  const [delistedPageSize, setDelistedPageSize] = useState(50)
  const [delistedSearch, setDelistedSearch] = useState('')
  const [delistedLoading, setDelistedLoading] = useState(true)

  // Countries state
  const [countries, setCountries] = useState<BCCountryRow[]>([])
  const [countryTotal, setCountryTotal] = useState(0)
  const [countryPage, setCountryPage] = useState(1)
  const [countryPageSize, setCountryPageSize] = useState(50)
  const [countrySearch, setCountrySearch] = useState('')
  const [countryLoading, setCountryLoading] = useState(true)

  // Products state
  const [products, setProducts] = useState<BCProductRow[]>([])
  const [productTotal, setProductTotal] = useState(0)
  const [productPage, setProductPage] = useState(1)
  const [productPageSize, setProductPageSize] = useState(50)
  const [productSearch, setProductSearch] = useState('')
  const [productLoading, setProductLoading] = useState(true)

  async function loadCountries() {
    setCountryLoading(true)
    const params = new URLSearchParams({ tab: 'countries', page: String(countryPage), pageSize: String(countryPageSize) })
    if (countrySearch) params.set('search', countrySearch)
    const res = await fetch(`/api/admin/sync/data?${params}`)
    if (res.ok) {
      const data = await res.json()
      setCountries(data.data || [])
      setCountryTotal(data.total || 0)
    }
    setCountryLoading(false)
  }

  async function loadProducts() {
    setProductLoading(true)
    const params = new URLSearchParams({ tab: 'products', page: String(productPage), pageSize: String(productPageSize) })
    if (productSearch) params.set('search', productSearch)
    const res = await fetch(`/api/admin/sync/data?${params}`)
    if (res.ok) {
      const data = await res.json()
      setProducts(data.data || [])
      setProductTotal(data.total || 0)
    }
    setProductLoading(false)
  }

  async function loadDelisted() {
    setDelistedLoading(true)
    const params = new URLSearchParams({ tab: 'delisted', page: String(delistedPage), pageSize: String(delistedPageSize) })
    if (delistedSearch) params.set('search', delistedSearch)
    const res = await fetch(`/api/admin/sync/data?${params}`)
    if (res.ok) {
      const data = await res.json()
      setDelisted(data.data || [])
      setDelistedTotal(data.total || 0)
    }
    setDelistedLoading(false)
  }

  useEffect(() => { loadCountries() }, [countryPage, countryPageSize])
  useEffect(() => { loadProducts() }, [productPage, productPageSize])
  useEffect(() => { loadDelisted() }, [delistedPage, delistedPageSize])
  useEffect(() => { loadDiffs() }, [])

  async function loadDiffs() {
    try {
      const res = await fetch('/api/admin/sync/diffs?limit=30')
      if (res.ok) { const d = await res.json(); setDiffs(d.diffs || []); setSelIdx(0) }
    } catch { /* 忽略 */ }
  }

  function handleCountrySearch() { setCountryPage(1); loadCountries() }
  function handleProductSearch() { setProductPage(1); loadProducts() }
  function handleDelistedSearch() { setDelistedPage(1); loadDelisted() }

  async function sync(type: 'countries' | 'products' | 'prices') {
    setSyncing(type)
    try {
      const url = type === 'countries' ? '/api/sync/countries'
        : type === 'prices' ? '/api/sync/products?parts=prices'
        : '/api/sync/products?parts=products'
      const label = type === 'countries' ? '國家' : type === 'prices' ? '價格' : '商品'
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setResults((prev) => [
          { type, success: true, message: `${label}同步完成，共 ${data.synced} 筆` },
          ...prev,
        ])
        if (type === 'countries') loadCountries()
        else { loadProducts(); loadDelisted(); loadDiffs() }
      } else {
        setResults((prev) => [
          { type, success: false, message: `${label}：${data.error || '同步失敗'}` },
          ...prev,
        ])
      }
    } catch {
      setResults((prev) => [
        { type, success: false, message: '網路錯誤' },
        ...prev,
      ])
    } finally {
      setSyncing(null)
    }
  }

  // 全部同步：國家 → 商品 → 價格（分開呼叫，降低單次資料庫壓力）
  async function syncAll() {
    await sync('countries')
    await sync('products')
    await sync('prices')
  }

  const countryTotalPages = Math.ceil(countryTotal / countryPageSize)
  const productTotalPages = Math.ceil(productTotal / productPageSize)

  return (
    <div>
      <h1 className="text-2xl font-bold">BillionConnect 同步</h1>
      <p className="mt-1 text-sm text-gray-500">從 BillionConnect API 同步國家和商品資料到本地資料庫</p>

      {/* Sync Actions */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => sync('countries')}
          disabled={syncing !== null}
          className="flex items-center gap-3 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="font-medium">同步國家</div>
            <div className="text-xs text-gray-500">BC F001</div>
          </div>
          {syncing === 'countries' && <RefreshCw className="w-4 h-4 text-blue-600 animate-spin ml-auto" />}
        </button>

        <button
          onClick={() => sync('products')}
          disabled={syncing !== null}
          className="flex items-center gap-3 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-left">
            <div className="font-medium">同步商品</div>
            <div className="text-xs text-gray-500">BC F002（不含價格）</div>
          </div>
          {syncing === 'products' && <RefreshCw className="w-4 h-4 text-green-600 animate-spin ml-auto" />}
        </button>

        <button
          onClick={() => sync('prices')}
          disabled={syncing !== null}
          className="flex items-center gap-3 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-left">
            <div className="font-medium">同步價格</div>
            <div className="text-xs text-gray-500">BC F003（更新既有商品）</div>
          </div>
          {syncing === 'prices' && <RefreshCw className="w-4 h-4 text-amber-600 animate-spin ml-auto" />}
        </button>

        <button
          onClick={syncAll}
          disabled={syncing !== null}
          className="flex items-center gap-3 p-5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="font-medium">全部同步</div>
            <div className="text-xs text-blue-200">國家 + 商品 + 價格</div>
          </div>
        </button>
      </div>

      {/* Sync Results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg text-sm ${
                r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {r.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="font-medium">{r.type === 'countries' ? '國家' : '商品'}</span>
              <span>{r.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 上下架比對 */}
      {diffs.length === 0 ? (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-800">上下架比對</span>
            <span className="text-xs text-gray-400">尚無比對紀錄</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">執行一次「同步商品」或「全部同步」後，這裡會顯示本次新上架／下架的商品比對。</p>
        </div>
      ) : (() => {
        const sel = diffs[selIdx] || diffs[0]
        return (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-800">上下架比對</span>
                {/* 同步時間選單：選哪一次就看那次相對上次的變化 */}
                <select value={selIdx} onChange={e => setSelIdx(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 max-w-[280px]">
                  {diffs.map((d, i) => (
                    <option key={d.id} value={i}>
                      {new Date(d.synced_at).toLocaleString('zh-TW')}{i === 0 ? '（最新）' : ''}{d.scope === 'prices' ? '·價格' : ''} ／ +{d.added_count} -{d.removed_count} ~{d.changed_count ?? 0}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">新上架 {sel.added_count}</span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">下架 {sel.removed_count}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">調價 {sel.changed_count ?? 0}</span>
                <span className="text-xs text-gray-400">BC {sel.bc_count ?? '—'} · 本地(同步前) {sel.db_count ?? '—'}</span>
                {(sel.added_count > 0 || sel.removed_count > 0 || (sel.changed_count ?? 0) > 0) && (
                  <button onClick={() => setShowDiffLists(v => !v)} className="text-xs text-blue-600 hover:underline">
                    {showDiffLists ? '收合明細' : '查看明細'}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-400">此為「該次同步」相對「上一次」的產品與價格變化</div>
            {sel.note && <div className="mt-2 text-xs text-amber-600">⚠ {sel.note}</div>}
            {showDiffLists && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <DiffList title="新上架" color="green" items={sel.added || []} />
                  <DiffList title="已下架（已標記停用，資料保留）" color="red" items={sel.removed || []} />
                </div>
                <ChangedList items={sel.changed || []} />
                {(sel.changed_count ?? 0) === 0 && (
                  <div className="text-xs text-gray-400">此次無調價（或為功能上線前的舊同步紀錄）。之後同步偵測到結算價變動時，這裡會列出「商品名 · 舊價 → 新價」。</div>
                )}
              </div>
            )}
            {diffs.length > 1 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-1">歷史（點選可切換）</div>
                <div className="space-y-1">
                  {diffs.map((d, i) => (
                    <button key={d.id} onClick={() => { setSelIdx(i); setShowDiffLists(true) }}
                      className={`w-full flex items-center gap-3 text-xs px-2 py-1 rounded text-left ${i === selIdx ? 'bg-blue-50 text-gray-800' : 'text-gray-500 hover:bg-gray-50'}`}>
                      <span>{new Date(d.synced_at).toLocaleString('zh-TW')}</span>
                      {d.scope === 'prices' && <span className="px-1.5 rounded bg-gray-100 text-gray-500">價格</span>}
                      <span className="text-green-600">+{d.added_count}</span>
                      <span className="text-red-600">-{d.removed_count}</span>
                      <span className="text-amber-600">~{d.changed_count ?? 0}</span>
                      {d.note && <span className="text-amber-600">略過下架</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Data Tabs */}
      <div className="mt-8 flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('countries')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'countries' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          BC 國家（{countryTotal}）
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'products' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          BC 商品（{productTotal}）
        </button>
        <button
          onClick={() => setActiveTab('delisted')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'delisted' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          下架 BC 商品（{delistedTotal}）
        </button>
      </div>

      {/* Countries Tab */}
      {activeTab === 'countries' && (
        <>
          <div className="mt-4 flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="搜尋國家名稱或 MCC" value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCountrySearch()}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={handleCountrySearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
          </div>

          {countryLoading ? <p className="mt-4 text-sm text-gray-500">載入中...</p> : (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">MCC</th>
                      <th className="text-left px-4 py-3 font-medium">國家名稱</th>
                      <th className="text-left px-4 py-3 font-medium">洲別</th>
                      <th className="text-left px-4 py-3 font-medium">同步時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {countries.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">{c.mcc}</td>
                        <td className="px-4 py-2 font-medium">{c.name}</td>
                        <td className="px-4 py-2 text-gray-500">{c.continent}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{new Date(c.created_at).toLocaleString('zh-TW')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  每頁
                  <select value={countryPageSize} onChange={(e) => { setCountryPageSize(Number(e.target.value)); setCountryPage(1) }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm">
                    {[10, 20, 30, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  筆 · 共 {countryTotal} 筆
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCountryPage(Math.max(1, countryPage - 1))} disabled={countryPage <= 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
                  <span className="px-3 py-1 text-sm">{countryPage} / {countryTotalPages}</span>
                  <button onClick={() => setCountryPage(Math.min(countryTotalPages, countryPage + 1))} disabled={countryPage >= countryTotalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <>
          <div className="mt-4 flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="搜尋套餐名稱或 SKU" value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleProductSearch()}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={handleProductSearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
          </div>

          {productLoading ? <p className="mt-4 text-sm text-gray-500">載入中...</p> : (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium min-w-[280px]">套餐名稱</th>
                      <th className="text-left px-4 py-3 font-medium">商品類型</th>
                      <th className="text-left px-4 py-3 font-medium">套餐類型</th>
                      <th className="text-left px-4 py-3 font-medium">銷售方式</th>
                      <th className="text-left px-4 py-3 font-medium">流量 / 限速</th>
                      <th className="text-left px-4 py-3 font-medium">結算價（vs 上次）</th>
                      <th className="text-left px-4 py-3 font-medium">同步時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p) => {
                      const isDaily = p.plan_type === '1'
                      const capacity = formatCapacity(p.high_flow_size ?? p.capacity, isDaily)
                      const speed = formatSpeed(p.limit_flow_speed)
                      const cost = p.cost_price != null ? Number(p.cost_price) : tierSettle(p.prices)
                      const pct = changePct(p.prev_cost_price ?? null, cost)
                      const up = pct != null && pct > 0, down = pct != null && pct < 0
                      const open = expandedSku.has(p.sku_id)
                      const tiers = Array.isArray(p.prices) ? p.prices : []
                      const prevMap = new Map((Array.isArray(p.prev_prices) ? p.prev_prices : []).map((t) => [String(t.copies), t.settlementPrice]))
                      return (
                        <Fragment key={p.id}>
                          <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedSku(s => { const n = new Set(s); n.has(p.sku_id) ? n.delete(p.sku_id) : n.add(p.sku_id); return n })}>
                            <td className="px-4 py-2">
                              <div className="font-medium max-w-[280px] truncate flex items-center gap-1">
                                {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                                <span className="truncate">{p.name}</span>
                              </div>
                              <div className="text-xs text-gray-400 font-mono mt-0.5 pl-4">{p.sku_id}</div>
                            </td>
                            <td className="px-4 py-2 text-xs">{p.type ? getProductTypeLabel(p.type) : '-'}</td>
                            <td className="px-4 py-2 text-xs">{getPlanTypeLabel(p.plan_type)}</td>
                            <td className="px-4 py-2 text-xs">{getSalesMethodLabel(p.sales_method)}</td>
                            <td className="px-4 py-2 text-xs">
                              {capacity !== '-' ? capacity : ''}{capacity !== '-' && speed !== '-' ? ' / ' : ''}{speed !== '-' ? speed : ''}{capacity === '-' && speed === '-' ? '-' : ''}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              {cost != null ? (
                                <span className="font-mono">¥{cost}
                                  {pct != null && pct !== 0 && (
                                    <span className={up ? 'text-red-600 ml-1' : down ? 'text-green-600 ml-1' : 'ml-1'}>
                                      {up ? '▲' : '▼'}{Math.abs(pct)}%<span className="text-gray-400">（前 ¥{p.prev_cost_price}）</span>
                                    </span>
                                  )}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">{new Date(p.updated_at).toLocaleString('zh-TW')}</td>
                          </tr>
                          {open && (
                            <tr className="bg-gray-50/60">
                              <td colSpan={7} className="px-4 py-3">
                                {tiers.length === 0 ? <span className="text-xs text-gray-400">無價格資料</span> : (
                                  <div className="overflow-x-auto">
                                    <table className="text-xs">
                                      <thead className="text-gray-400">
                                        <tr>
                                          <th className="text-left pr-6 py-1 font-medium">份數 copies</th>
                                          <th className="text-right pr-6 py-1 font-medium">結算價</th>
                                          <th className="text-right pr-6 py-1 font-medium">上次結算</th>
                                          <th className="text-right pr-6 py-1 font-medium">漲跌</th>
                                          <th className="text-right py-1 font-medium">零售價</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tiers.slice().sort((a, b) => (Number(a.copies) || 0) - (Number(b.copies) || 0)).map((t) => {
                                          const prev = prevMap.get(String(t.copies))
                                          const pv = prev != null && prev !== '' ? Number(prev) : null
                                          const cv = t.settlementPrice != null && t.settlementPrice !== '' ? Number(t.settlementPrice) : null
                                          const tp = changePct(pv, cv)
                                          return (
                                            <tr key={t.copies} className="border-t border-gray-100">
                                              <td className="text-left pr-6 py-1">{t.copies}</td>
                                              <td className="text-right pr-6 py-1 font-mono">¥{t.settlementPrice}</td>
                                              <td className="text-right pr-6 py-1 font-mono text-gray-400">{pv != null ? `¥${pv}` : '—'}</td>
                                              <td className={`text-right pr-6 py-1 font-mono ${tp != null && tp > 0 ? 'text-red-600' : tp != null && tp < 0 ? 'text-green-600' : 'text-gray-300'}`}>{tp != null && tp !== 0 ? `${tp > 0 ? '▲' : '▼'}${Math.abs(tp)}%` : '—'}</td>
                                              <td className="text-right py-1 font-mono text-gray-500">¥{t.retailPrice}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  每頁
                  <select value={productPageSize} onChange={(e) => { setProductPageSize(Number(e.target.value)); setProductPage(1) }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm">
                    {[10, 20, 30, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  筆 · 共 {productTotal} 筆
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setProductPage(Math.max(1, productPage - 1))} disabled={productPage <= 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
                  <span className="px-3 py-1 text-sm">{productPage} / {productTotalPages}</span>
                  <button onClick={() => setProductPage(Math.min(productTotalPages, productPage + 1))} disabled={productPage >= productTotalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delisted Tab */}
      {activeTab === 'delisted' && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="搜尋套餐名稱或 SKU" value={delistedSearch}
                onChange={(e) => setDelistedSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDelistedSearch()}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={handleDelistedSearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
            <span className="text-xs text-gray-400">BC 已不再回傳、被標記下架的商品（資料保留；下次同步若再出現會自動復活）</span>
          </div>

          {delistedLoading ? <p className="mt-4 text-sm text-gray-500">載入中...</p> : (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium min-w-[280px]">套餐名稱</th>
                      <th className="text-left px-4 py-3 font-medium">商品類型</th>
                      <th className="text-left px-4 py-3 font-medium">套餐類型</th>
                      <th className="text-left px-4 py-3 font-medium">銷售方式</th>
                      <th className="text-left px-4 py-3 font-medium">流量 / 限速</th>
                      <th className="text-left px-4 py-3 font-medium">下架時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {delisted.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">目前沒有下架商品</td></tr>
                    ) : delisted.map((p) => {
                      const isDaily = p.plan_type === '1'
                      const capacity = formatCapacity(p.high_flow_size ?? p.capacity, isDaily)
                      const speed = formatSpeed(p.limit_flow_speed)
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="font-medium max-w-[280px] truncate text-gray-600">{p.name}</div>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{p.sku_id}</div>
                          </td>
                          <td className="px-4 py-2 text-xs">{p.type ? getProductTypeLabel(p.type) : '-'}</td>
                          <td className="px-4 py-2 text-xs">{getPlanTypeLabel(p.plan_type)}</td>
                          <td className="px-4 py-2 text-xs">{getSalesMethodLabel(p.sales_method)}</td>
                          <td className="px-4 py-2 text-xs">
                            {capacity !== '-' ? capacity : ''}{capacity !== '-' && speed !== '-' ? ' / ' : ''}{speed !== '-' ? speed : ''}{capacity === '-' && speed === '-' ? '-' : ''}
                          </td>
                          <td className="px-4 py-2 text-red-500 text-xs">{p.delisted_at ? new Date(p.delisted_at).toLocaleString('zh-TW') : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  每頁
                  <select value={delistedPageSize} onChange={(e) => { setDelistedPageSize(Number(e.target.value)); setDelistedPage(1) }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm">
                    {[10, 20, 30, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  筆 · 共 {delistedTotal} 筆
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDelistedPage(Math.max(1, delistedPage - 1))} disabled={delistedPage <= 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
                  <span className="px-3 py-1 text-sm">{delistedPage} / {Math.max(1, Math.ceil(delistedTotal / delistedPageSize))}</span>
                  <button onClick={() => setDelistedPage(delistedPage + 1)} disabled={delistedPage >= Math.ceil(delistedTotal / delistedPageSize)}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChangedList({ items }: { items: ChangedRef[] }) {
  const fmt = (n: number | null) => n == null ? '—' : `¥${n}`
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-amber-700">調價（{items.length}）· 結算價變動</div>
      <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">無</div>
        ) : items.map((it) => {
          const up = it.old_cost != null && it.new_cost != null && it.new_cost > it.old_cost
          const down = it.old_cost != null && it.new_cost != null && it.new_cost < it.old_cost
          return (
            <div key={it.sku_id} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-700 truncate">{it.name || '—'}</div>
                <div className="text-gray-400 font-mono">{it.sku_id}</div>
              </div>
              <div className={`shrink-0 font-mono ${up ? 'text-red-600' : down ? 'text-green-600' : 'text-gray-500'}`}>
                {fmt(it.old_cost)} → {fmt(it.new_cost)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiffList({ title, color, items }: { title: string; color: 'green' | 'red'; items: SkuRef[] }) {
  const head = color === 'green' ? 'text-green-700' : 'text-red-700'
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className={`px-3 py-1.5 text-xs font-medium bg-gray-50 ${head}`}>{title}（{items.length}）</div>
      <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">無</div>
        ) : items.map((it) => (
          <div key={it.sku_id} className="px-3 py-1.5 text-xs">
            <div className="text-gray-700 truncate">{it.name || '—'}</div>
            <div className="text-gray-400 font-mono">{it.sku_id}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
