'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'

interface PriceItem { copies: string; retailPrice: string; settlementPrice: string }
interface CountryItem { mcc: string; name: string }
interface BCProduct {
  id: string; sku_id: string; name: string; type: string
  days: number | null; capacity: string | null; high_flow_size: string | null
  limit_flow_speed: string | null; plan_type: string | null
  prices: PriceItem[] | null; country_data: CountryItem[] | null
  is_active: boolean
}

export default function AdminEsimPlansPage() {
  const [products, setProducts] = useState<BCProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDays, setFilterDays] = useState('')
  const [filterCapacity, setFilterCapacity] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/plans?type=esim')
    if (res.ok) setProducts(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    await fetch('/api/sync/products', { method: 'POST' })
    await load()
    setSyncing(false)
  }

  async function handleToggle(skuId: string, current: boolean) {
    await fetch('/api/admin/plans/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_id: skuId, is_active: !current }),
    })
    setProducts((prev) => prev.map((p) => p.sku_id === skuId ? { ...p, is_active: !current } : p))
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 天數篩選選項：days × copies 去重
  const daysOptions = useMemo(() => {
    const set = new Set<number>()
    products.forEach((p) => {
      const unitDays = p.days ?? 1
      if (p.prices?.length) {
        p.prices.forEach((t) => set.add(unitDays * parseInt(t.copies)))
      } else {
        set.add(unitDays)
      }
    })
    return Array.from(set).sort((a, b) => a - b)
  }, [products])

  // 流量篩選選項
  const capacityOptions = useMemo(() => {
    const map = new Map<string, boolean>()
    products.forEach((p) => {
      const key = p.high_flow_size ?? p.capacity
      if (key) map.set(key, p.plan_type === '1')
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
      .map(([v, isDaily]) => ({
        value: v,
        label: formatCapacity(v, isDaily),
      }))
  }, [products])

  // 過濾
  const filtered = useMemo(() => {
    return products.filter((p) => {
      // 搜尋
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.sku_id.toLowerCase().includes(q)) return false
      }
      // 天數篩選（比對實際天數 = days × copies）
      if (filterDays) {
        const target = parseInt(filterDays)
        const unitDays = p.days ?? 1
        const hasMatch = p.prices?.some((t) => unitDays * parseInt(t.copies) === target)
        if (!hasMatch) return false
      }
      // 流量篩選
      if (filterCapacity) {
        if (p.high_flow_size !== filterCapacity && p.capacity !== filterCapacity) return false
      }
      return true
    })
  }, [products, search, filterDays, filterCapacity])

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">eSIM 套餐</h1>
          <p className="mt-1 text-sm text-gray-500">共 {filtered.length} 個套餐</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          從 BC 同步
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select value={filterDays} onChange={(e) => setFilterDays(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">天數</option>
          {daysOptions.map((d) => <option key={d} value={d}>{d} 天</option>)}
        </select>
        <select value={filterCapacity} onChange={(e) => setFilterCapacity(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">流量</option>
          {capacityOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜索套餐名稱或編號" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : filtered.length === 0 ? (
        <p className="mt-8 text-gray-500 text-center">尚無資料，請點擊「從 BC 同步」</p>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium min-w-[280px]">套餐名稱</th>
                  <th className="text-left px-4 py-3 font-medium w-20">類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">流量</th>
                  <th className="text-left px-4 py-3 font-medium w-20">限速</th>
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
                      <tr className={`hover:bg-gray-50 ${hasPrices ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50/50' : ''}`}
                        onClick={() => hasPrices && toggleExpand(product.id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            {hasPrices ? (
                              <span className="mt-0.5 text-gray-400 flex-shrink-0">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                            ) : <span className="w-4" />}
                            <div className="min-w-0">
                              <div className="font-medium leading-tight truncate">{product.name}</div>
                              <div className="text-xs text-gray-400 mt-0.5 font-mono">{product.sku_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-600 font-medium">{product.type}</span>
                          <div className="text-xs text-gray-400 mt-0.5">{isDaily ? '單日型' : '總量型'}</div>
                        </td>
                        <td className="px-4 py-3">{formatCapacity(product.high_flow_size ?? product.capacity, isDaily)}</td>
                        <td className="px-4 py-3">{formatSpeed(product.limit_flow_speed)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {countries.slice(0, 3).map((c) => (
                              <span key={c.mcc} className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">{c.name}</span>
                            ))}
                            {countries.length > 3 && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">+{countries.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {hasPrices ? `${prices.length} 規格` : prices.length === 1 ? `${unitDays * parseInt(prices[0].copies)} 天` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {prices.length === 1 ? `¥${prices[0].settlementPrice}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={(e) => { e.stopPropagation(); handleToggle(product.sku_id, product.is_active) }}>
                            {product.is_active
                              ? <ToggleRight className="w-6 h-6 text-blue-600" />
                              : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && prices.map((price, idx) => (
                        <tr key={`${product.id}-${idx}`} className="bg-gray-50/50 hover:bg-gray-100/50">
                          <td colSpan={5} className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-gray-700">
                            <span className="text-gray-400">└ </span>
                            {unitDays * parseInt(price.copies)} 天
                          </td>
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
