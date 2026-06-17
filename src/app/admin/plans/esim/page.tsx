'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Search, RefreshCw, Info, FileSpreadsheet } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'
import { getProductTypeLabel, getPlanTypeLabel, getSalesMethodLabel, PLAN_TYPE, SALES_METHOD, ESIM_TYPE_OPTIONS } from '@/lib/bc-enums'
import SkuCompareModal from '@/components/admin/sku-compare-modal'
import CountryMultiSelect from '@/components/admin/country-multi-select'
import PlanCompareModal from '@/components/admin/plan-compare-modal'

interface PriceItem { copies: string; retailPrice: string; settlementPrice: string }
interface CountryItem { mcc: string; name: string }
interface BCProduct {
  id: string; sku_id: string; name: string; type: string
  days: number | null; capacity: string | null; high_flow_size: string | null
  limit_flow_speed: string | null; plan_type: string | null; sales_method: string | null
  prices: PriceItem[] | null; country_data: CountryItem[] | null
  is_active: boolean; desc: string | null; operator_info: string | null
  hotspot_support: string | null; acceleration_support: string | null
  usage_count: string | null; time_zone: string | null; point_contact_type: string | null
  provider: string | null; refund_policy: string | null
}

export default function AdminEsimPlansPage() {
  const [products, setProducts] = useState<BCProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [detailProduct, setDetailProduct] = useState<BCProduct | null>(null)
  const [filterPlanType, setFilterPlanType] = useState('')
  const [filterProductType, setFilterProductType] = useState('')
  const [filterSalesMethod, setFilterSalesMethod] = useState('')
  const [filterRechargeable, setFilterRechargeable] = useState('')
  const [filterCountries, setFilterCountries] = useState<string[]>([])
  const [countryOptions, setCountryOptions] = useState<{ mcc: string; name: string }[]>([])
  const [filterDays, setFilterDays] = useState('')
  const [filterCapacity, setFilterCapacity] = useState('')
  const [daysOptions, setDaysOptions] = useState<number[]>([])
  const [capacityOptions, setCapacityOptions] = useState<{ value: string; label: string }[]>([])
  const [showCompare, setShowCompare] = useState(false)
  // 勾選比較
  const [compareSel, setCompareSel] = useState<BCProduct[]>([])
  const [showCompareModal, setShowCompareModal] = useState(false)
  const compareIds = new Set(compareSel.map(p => p.sku_id))
  function toggleCompare(p: BCProduct) {
    setCompareSel(prev => prev.some(x => x.sku_id === p.sku_id) ? prev.filter(x => x.sku_id !== p.sku_id) : [...prev, p])
  }

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'esim', page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      if (filterPlanType) params.set('planType', filterPlanType)
      if (filterProductType) params.set('productType', filterProductType)
      if (filterSalesMethod) params.set('salesMethod', filterSalesMethod)
      if (filterRechargeable) params.set('rechargeable', filterRechargeable)
      if (filterCountries.length) params.set('countries', filterCountries.join(','))
      if (filterDays) params.set('days', filterDays)
      if (filterCapacity) params.set('capacity', filterCapacity)
      const res = await fetch(`/api/admin/plans?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
        setTotal(data.total || 0)
      }
    } catch { /* 網路錯誤：保留現有資料，不卡在載入中 */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, pageSize, filterPlanType, filterProductType, filterSalesMethod, filterRechargeable, filterCountries, filterDays, filterCapacity])

  // 載入 eSIM 的篩選選項（國家 / 天數 / 流量）
  useEffect(() => {
    fetch('/api/admin/plans?type=esim&countriesOnly=1')
      .then(r => r.ok ? r.json() : Promise.resolve({ countries: [], days: [], capacities: [] }))
      .then(d => { setCountryOptions(d.countries || []); setDaysOptions(d.days || []); setCapacityOptions(d.capacities || []) })
      .catch(() => {})
  }, [])

  function handleSearch() { setPage(1); load() }

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => { setter(e.target.value); setPage(1) }
  }

  function clearFilters() {
    setFilterPlanType(''); setFilterProductType(''); setFilterSalesMethod(''); setFilterRechargeable(''); setFilterCountries([]); setFilterDays(''); setFilterCapacity(''); setSearch(''); setPage(1)
  }

  const hasFilters = filterPlanType || filterProductType || filterSalesMethod || filterRechargeable || filterCountries.length > 0 || filterDays || filterCapacity || search

  async function handleSync() {
    setSyncing(true)
    await fetch('/api/sync/products', { method: 'POST' })
    await load()
    setSyncing(false)
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">eSIM 套餐</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆</p>
        </div>
        <div className="flex items-center gap-2">
          {compareSel.length > 0 && (
            <button onClick={() => setShowCompareModal(true)} disabled={compareSel.length < 2}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              title={compareSel.length < 2 ? '至少勾選 2 個套餐' : ''}>
              比較（{compareSel.length}）
            </button>
          )}
          <button onClick={() => setShowCompare(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            <FileSpreadsheet className="w-4 h-4" /> Excel 比對
          </button>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> 從 BC 同步
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select value={filterProductType} onChange={handleFilterChange(setFilterProductType)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">商品類型</option>
          {Object.entries(ESIM_TYPE_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterPlanType} onChange={handleFilterChange(setFilterPlanType)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">套餐類型</option>
          {Object.entries(PLAN_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterSalesMethod} onChange={handleFilterChange(setFilterSalesMethod)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">銷售方式</option>
          {Object.entries(SALES_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterRechargeable} onChange={handleFilterChange(setFilterRechargeable)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">複充</option>
          <option value="1">可複充</option>
          <option value="0">不可複充</option>
        </select>
        <CountryMultiSelect options={countryOptions} value={filterCountries}
          onChange={(v) => { setFilterCountries(v); setPage(1) }} className="w-56" />
        <select value={filterDays} onChange={handleFilterChange(setFilterDays)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">天數</option>
          {daysOptions.map(d => <option key={d} value={d}>{d} 天</option>)}
        </select>
        <select value={filterCapacity} onChange={handleFilterChange(setFilterCapacity)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">流量</option>
          {capacityOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋套餐名稱或 SKU" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
        {hasFilters && (
          <button onClick={clearFilters} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">清除篩選</button>
        )}
      </div>

      {/* Table */}
      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 w-10"></th>
                  <th className="text-left px-4 py-3 font-medium min-w-[280px]">套餐名稱</th>
                  <th className="text-left px-4 py-3 font-medium w-24">商品類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">套餐類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">銷售方式</th>
                  <th className="text-left px-4 py-3 font-medium w-20">流量</th>
                  <th className="text-left px-4 py-3 font-medium w-16">限速</th>
                  <th className="text-left px-4 py-3 font-medium w-16">天數</th>
                  <th className="text-right px-4 py-3 font-medium w-20">結算價</th>
                  <th className="text-center px-4 py-3 font-medium w-14">詳情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => {
                  const isExpanded = expandedIds.has(product.id)
                  const prices = product.prices || []
                  const hasPrices = prices.length > 1
                  const unitDays = product.days ?? 1
                  const isDaily = product.plan_type === '1'

                  return (
                    <Fragment key={product.id}>
                      <tr className={`hover:bg-gray-50 ${hasPrices ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50/30' : ''}`}
                        onClick={() => hasPrices && toggleExpand(product.id)}>
                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={compareIds.has(product.sku_id)} onChange={() => toggleCompare(product)}
                            className="accent-emerald-600" title="加入比較" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            {hasPrices && <span className="mt-0.5 text-gray-400 flex-shrink-0">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>}
                            <div className="min-w-0">
                              <div className="font-medium leading-tight truncate">{product.name}</div>
                              <div className="text-xs text-gray-400 mt-0.5 font-mono">{product.sku_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">{getProductTypeLabel(product.type)}</td>
                        <td className="px-4 py-3 text-xs">{getPlanTypeLabel(product.plan_type)}</td>
                        <td className="px-4 py-3 text-xs">{getSalesMethodLabel(product.sales_method)}</td>
                        <td className="px-4 py-3 text-xs">{formatCapacity(product.high_flow_size ?? product.capacity, isDaily)}</td>
                        <td className="px-4 py-3 text-xs">{formatSpeed(product.limit_flow_speed)}</td>
                        <td className="px-4 py-3 text-xs">{hasPrices ? `${prices.length} 規格` : prices.length === 1 ? `${unitDays * parseInt(prices[0].copies)} 天` : '-'}</td>
                        <td className="px-4 py-3 text-right text-xs">{prices.length === 1 ? `¥${prices[0].settlementPrice}` : '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={(e) => { e.stopPropagation(); setDetailProduct(product) }}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                            <Info className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && prices.sort((a, b) => parseInt(a.copies) - parseInt(b.copies)).map((price, idx) => (
                        <tr key={`${product.id}-${idx}`} className="bg-gray-50/50 hover:bg-gray-100/50">
                          <td colSpan={7} className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-xs text-gray-700"><span className="text-gray-400">└ </span>{unitDays * parseInt(price.copies)} 天</td>
                          <td className="px-4 py-2 text-right text-xs font-medium">¥{price.settlementPrice}</td>
                          <td></td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              每頁
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="px-2 py-1 border border-gray-300 rounded text-sm">
                {[10, 20, 30, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              筆 · 共 {total} 筆
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">套餐詳情</h2>
                <button onClick={() => setDetailProduct(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  ['套餐編號', detailProduct.sku_id],
                  ['套餐名稱', detailProduct.name],
                  ['商品類型', getProductTypeLabel(detailProduct.type)],
                  ['套餐類型', getPlanTypeLabel(detailProduct.plan_type)],
                  ['高速流量', formatCapacity(detailProduct.high_flow_size, detailProduct.plan_type === '1')],
                  ['限速峰值', formatSpeed(detailProduct.limit_flow_speed)],
                  ['支持加速', detailProduct.acceleration_support || '—'],
                  ['熱點分享', detailProduct.hotspot_support === '1' ? '支持' : '—'],
                  ['設備可用次數', detailProduct.usage_count || '—'],
                  ['日切點類型', detailProduct.point_contact_type || '—'],
                  ['運營商時區', detailProduct.time_zone || '—'],
                  ['供應商', detailProduct.provider || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              </div>

              {detailProduct.desc && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs font-medium text-blue-700 mb-1">套餐描述</div>
                  <div className="text-xs text-blue-600 whitespace-pre-line">{detailProduct.desc}</div>
                </div>
              )}

              {detailProduct.country_data && detailProduct.country_data.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-500 mb-2">覆蓋國家 / 運營商 · {detailProduct.country_data.length}</div>
                  <div className="flex flex-wrap gap-1">
                    {detailProduct.country_data.map((c) => (
                      <span key={c.mcc} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{c.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {detailProduct.refund_policy && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs font-medium text-gray-500 mb-1">退款政策</div>
                  <div className="text-xs text-gray-600 whitespace-pre-line">{detailProduct.refund_policy}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SkuCompareModal open={showCompare} onClose={() => setShowCompare(false)} planType="esim" title="eSIM 套餐" />
      {showCompareModal && <PlanCompareModal plans={compareSel} onClose={() => setShowCompareModal(false)} />}
    </div>
  )
}
