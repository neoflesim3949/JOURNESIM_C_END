'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Database } from 'lucide-react'

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
  type: string
  sales_method: string
  days: number | null
  capacity: string | null
  plan_type: string | null
  created_at: string
}

export default function AdminSyncPage() {
  const [results, setResults] = useState<SyncResult[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [countries, setCountries] = useState<BCCountryRow[]>([])
  const [products, setProducts] = useState<BCProductRow[]>([])
  const [activeTab, setActiveTab] = useState<'countries' | 'products'>('countries')
  const [loading, setLoading] = useState(true)

  async function loadData() {
    const res = await fetch('/api/admin/sync/data')
    if (res.ok) {
      const data = await res.json()
      setCountries(data.countries || [])
      setProducts(data.products || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

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
        loadData()
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
          BC 國家（{countries.length}）
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'products' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          BC 商品（{products.length}）
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">載入中...</p>
      ) : (
        <>
          {/* Countries Table */}
          {activeTab === 'countries' && (
            countries.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">尚未同步國家資料，請點擊上方「同步國家」</p>
            ) : (
              <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">MCC</th>
                        <th className="text-left px-4 py-2 font-medium">國家名稱</th>
                        <th className="text-left px-4 py-2 font-medium">洲別</th>
                        <th className="text-left px-4 py-2 font-medium">同步時間</th>
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
              </div>
            )
          )}

          {/* Products Table */}
          {activeTab === 'products' && (
            products.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">尚未同步商品資料，請點擊上方「同步商品」</p>
            ) : (
              <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">SKU ID</th>
                        <th className="text-left px-4 py-2 font-medium">商品名稱</th>
                        <th className="text-left px-4 py-2 font-medium">類型</th>
                        <th className="text-left px-4 py-2 font-medium">天數</th>
                        <th className="text-left px-4 py-2 font-medium">容量</th>
                        <th className="text-left px-4 py-2 font-medium">計費方式</th>
                        <th className="text-left px-4 py-2 font-medium">同步時間</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {products.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs">{p.sku_id}</td>
                          <td className="px-4 py-2 font-medium max-w-[200px] truncate">{p.name}</td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{p.type}</span>
                          </td>
                          <td className="px-4 py-2">{p.days ?? '-'}</td>
                          <td className="px-4 py-2">{p.capacity || '-'}</td>
                          <td className="px-4 py-2 text-xs">
                            {p.plan_type === '0' ? '總量型' : p.plan_type === '1' ? '單日型' : '-'}
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{new Date(p.created_at).toLocaleString('zh-TW')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
