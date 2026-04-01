'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, ToggleLeft, ToggleRight } from 'lucide-react'
import { formatCapacity } from '@/lib/format'

interface PriceItem { copies: string; retailPrice: string; settlementPrice: string }
interface CountryItem { mcc: string; name: string }
interface BCProduct {
  id: string; sku_id: string; name: string; type: string
  days: number | null; capacity: string | null; high_flow_size: string | null
  plan_type: string | null; prices: PriceItem[] | null; country_data: CountryItem[] | null; is_active: boolean
}

export default function AdminAccelerationPlansPage() {
  const [products, setProducts] = useState<BCProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/plans?type=acceleration').then((r) => r.ok ? r.json() : []).then(setProducts).finally(() => setLoading(false))
  }, [])

  async function handleToggle(skuId: string, current: boolean) {
    await fetch('/api/admin/plans/toggle', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku_id: skuId, is_active: !current }) })
    setProducts((prev) => prev.map((p) => p.sku_id === skuId ? { ...p, is_active: !current } : p))
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const filtered = useMemo(() => {
    if (!search) return products
    const q = search.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku_id.toLowerCase().includes(q))
  }, [products, search])

  return (
    <div>
      <h1 className="text-2xl font-bold">加速包套餐</h1>
      <p className="mt-1 text-sm text-gray-500">共 {filtered.length} 個套餐</p>

      <div className="mt-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="搜索套餐名稱或編號" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : filtered.length === 0 ? (
        <p className="mt-8 text-gray-500 text-center">尚無加速包商品</p>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium min-w-[280px]">套餐名稱</th>
                  <th className="text-left px-4 py-3 font-medium w-20">類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">流量</th>
                  <th className="text-left px-4 py-3 font-medium w-20">高速流量</th>
                  <th className="text-left px-4 py-3 font-medium min-w-[150px]">國家</th>
                  <th className="text-left px-4 py-3 font-medium w-24">天數</th>
                  <th className="text-right px-4 py-3 font-medium w-24">結算價</th>
                  <th className="text-center px-4 py-3 font-medium w-16">上架</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((product) => {
                  const isExpanded = expandedIds.has(product.id)
                  const prices = product.prices || []
                  const countries = product.country_data || []
                  const hasPrices = prices.length > 1
                  const unitDays = product.days ?? 1
                  const isDaily = product.plan_type === '1'
                  return (
                    <Fragment key={product.id}>
                      <tr className={`hover:bg-gray-50 ${hasPrices ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50/50' : ''}`} onClick={() => hasPrices && toggleExpand(product.id)}>
                        <td className="px-4 py-3"><div className="flex items-start gap-2">{hasPrices ? <span className="mt-0.5 text-gray-400 flex-shrink-0">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span> : <span className="w-4" />}<div className="min-w-0"><div className="font-medium truncate">{product.name}</div><div className="text-xs text-gray-400 font-mono">{product.sku_id}</div></div></div></td>
                        <td className="px-4 py-3"><span className="px-1.5 py-0.5 text-xs rounded bg-orange-50 text-orange-600 font-medium">{product.type}</span></td>
                        <td className="px-4 py-3">{formatCapacity(product.capacity, false)}</td>
                        <td className="px-4 py-3">{formatCapacity(product.high_flow_size, isDaily)}</td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{countries.slice(0, 3).map((c) => <span key={c.mcc} className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">{c.name}</span>)}{countries.length > 3 && <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">+{countries.length - 3}</span>}</div></td>
                        <td className="px-4 py-3">{hasPrices ? `${prices.length} 規格` : prices.length === 1 ? `${unitDays * parseInt(prices[0].copies)} 天` : '-'}</td>
                        <td className="px-4 py-3 text-right">{prices.length === 1 ? `¥${prices[0].settlementPrice}` : '-'}</td>
                        <td className="px-4 py-3 text-center"><button onClick={(e) => { e.stopPropagation(); handleToggle(product.sku_id, product.is_active) }}>{product.is_active ? <ToggleRight className="w-6 h-6 text-blue-600" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}</button></td>
                      </tr>
                      {isExpanded && prices.map((price, idx) => (
                        <tr key={`${product.id}-${idx}`} className="bg-gray-50/50 hover:bg-gray-100/50">
                          <td colSpan={5} className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-gray-700"><span className="text-gray-400">└ </span>{unitDays * parseInt(price.copies)} 天</td>
                          <td className="px-4 py-2 text-right font-medium">¥{price.settlementPrice}</td>
                          <td></td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
