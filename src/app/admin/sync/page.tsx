'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Database, Search } from 'lucide-react'
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
}

export default function AdminSyncPage() {
  const [results, setResults] = useState<SyncResult[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'countries' | 'products'>('countries')

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

  useEffect(() => { loadCountries() }, [countryPage, countryPageSize])
  useEffect(() => { loadProducts() }, [productPage, productPageSize])

  function handleCountrySearch() { setCountryPage(1); loadCountries() }
  function handleProductSearch() { setProductPage(1); loadProducts() }

  async function sync(type: 'countries' | 'products') {
    setSyncing(type)
    try {
      const res = await fetch(`/api/sync/${type}`, { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setResults((prev) => [
          { type, success: true, message: `同步完成，共 ${data.synced} 筆` },
          ...prev,
        ])
        if (type === 'countries') loadCountries()
        else loadProducts()
      } else {
        setResults((prev) => [
          { type, success: false, message: data.error || '同步失敗' },
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

  async function syncAll() {
    await sync('countries')
    await sync('products')
  }

  const countryTotalPages = Math.ceil(countryTotal / countryPageSize)
  const productTotalPages = Math.ceil(productTotal / productPageSize)

  return (
    <div>
      <h1 className="text-2xl font-bold">BillionConnect 同步</h1>
      <p className="mt-1 text-sm text-gray-500">從 BillionConnect API 同步國家和商品資料到本地資料庫</p>

      {/* Sync Actions */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="text-xs text-gray-500">BC F002 + F003</div>
          </div>
          {syncing === 'products' && <RefreshCw className="w-4 h-4 text-green-600 animate-spin ml-auto" />}
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
            <div className="text-xs text-blue-200">國家 + 商品</div>
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
                      <th className="text-left px-4 py-3 font-medium">同步時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p) => {
                      const isDaily = p.plan_type === '1'
                      const capacity = formatCapacity(p.high_flow_size ?? p.capacity, isDaily)
                      const speed = formatSpeed(p.limit_flow_speed)
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="font-medium max-w-[280px] truncate">{p.name}</div>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{p.sku_id}</div>
                          </td>
                          <td className="px-4 py-2 text-xs">{p.type ? getProductTypeLabel(p.type) : '-'}</td>
                          <td className="px-4 py-2 text-xs">{getPlanTypeLabel(p.plan_type)}</td>
                          <td className="px-4 py-2 text-xs">{getSalesMethodLabel(p.sales_method)}</td>
                          <td className="px-4 py-2 text-xs">
                            {capacity !== '-' ? capacity : ''}{capacity !== '-' && speed !== '-' ? ' / ' : ''}{speed !== '-' ? speed : ''}{capacity === '-' && speed === '-' ? '-' : ''}
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{new Date(p.updated_at).toLocaleString('zh-TW')}</td>
                        </tr>
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
    </div>
  )
}
