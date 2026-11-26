'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Search, RefreshCw, Info, Layers } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'
import { getPlanTypeLabel, getSalesMethodLabel } from '@/lib/bc-enums'
import BcDetailModal from '@/components/admin/bc-detail-modal'

interface SeriesProduct {
  sku_id: string
  name: string
  plan_type: string | null
  days: number | null
  capacity: string | null
  high_flow_size: string | null
  limit_flow_speed: string | null
  sales_method: string | null
  is_active: boolean | null
  rechargeable_product: string | null
}
interface Series {
  seriesId: string
  seriesName: string
  count: number
  products: SeriesProduct[]
}

export default function RechargeableSeriesPage() {
  const [series, setSeries] = useState<Series[]>([])
  const [totalSeries, setTotalSeries] = useState(0)
  const [totalProducts, setTotalProducts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detailSku, setDetailSku] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (includeInactive) params.set('includeInactive', '1')
      const res = await fetch(`/api/admin/plans/series?${params}`)
      const json = await res.json()
      if (res.ok) {
        setSeries(json.series || [])
        setTotalSeries(json.totalSeries || 0)
        setTotalProducts(json.totalProducts || 0)
      }
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [includeInactive])

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="w-6 h-6 text-indigo-500" />
        <h1 className="text-xl font-bold">复充商品系列</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-2">把可複充的 eSIM 商品，依「復充商品系列」(F002 rechargeableProductSeries) 分組呈現。</p>

      {/* 搜尋列 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="搜尋系列名稱 / 系列ID / 商品名稱 / SKU"
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-1">
          <Search className="w-4 h-4" />查詢
        </button>
        <button onClick={() => { setSearch(''); setTimeout(load, 0) }} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1">
          <RefreshCw className="w-4 h-4" />清除
        </button>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 ml-1">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          含已下架
        </label>
      </div>

      <div className="text-sm text-gray-500">共 {totalSeries} 個系列 · {totalProducts} 個商品</div>

      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : series.length === 0 ? (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm rounded-lg p-3">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>目前沒有系列資料。若剛加上欄位，請先到 <a href="/admin/sync" className="underline">同步頁</a> 重新同步商品（或 <span className="font-mono">POST /api/sync/products?parts=products</span>），把 F002 的系列資料補回來。</span>
        </div>
      ) : (
        <div className="space-y-2">
          {series.map((s) => {
            const open = expanded.has(s.seriesId)
            return (
              <div key={s.seriesId} className="bg-white border rounded-xl overflow-hidden">
                <button onClick={() => toggle(s.seriesId)} className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50">
                  {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{s.seriesName || '（未命名系列）'}</div>
                    <div className="text-xs text-gray-400">系列ID {s.seriesId}</div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium">{s.count} 商品</span>
                </button>

                {open && (
                  <div className="border-t overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="text-left font-normal px-3 py-2">商品名稱</th>
                          <th className="text-left font-normal px-3 py-2">SKU</th>
                          <th className="text-left font-normal px-3 py-2">套餐類型</th>
                          <th className="text-left font-normal px-3 py-2">高速/流量</th>
                          <th className="text-left font-normal px-3 py-2">限速</th>
                          <th className="text-left font-normal px-3 py-2">銷售方式</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.products.map((p) => (
                          <Fragment key={p.sku_id}>
                            <tr className="border-t border-gray-100">
                              <td className="px-3 py-2">
                                {p.name}
                                {p.is_active === false && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-400">已下架</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.sku_id}</td>
                              <td className="px-3 py-2 text-gray-600">{getPlanTypeLabel(p.plan_type)}</td>
                              <td className="px-3 py-2 text-gray-600">{formatCapacity(p.high_flow_size ?? p.capacity, p.plan_type === '1')}</td>
                              <td className="px-3 py-2 text-gray-600">{formatSpeed(p.limit_flow_speed)}</td>
                              <td className="px-3 py-2 text-gray-600">{getSalesMethodLabel(p.sales_method)}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setDetailSku(p.sku_id)} className="text-xs text-indigo-600 hover:underline">詳情</button>
                              </td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {detailSku && <BcDetailModal skuId={detailSku} onClose={() => setDetailSku(null)} />}
    </div>
  )
}
