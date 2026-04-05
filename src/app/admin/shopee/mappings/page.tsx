'use client'

import { useEffect, useState } from 'react'
import { Search, Trash2, Link2 } from 'lucide-react'

interface Mapping {
  id: string; shopee_sku_code: string; shopee_product_name: string | null
  shopee_variation_name: string | null; shopee_product_id: string | null
  package_id: string | null; package_plan_id: string | null; copies: string | null
  bc_sku_id: string | null; updated_at: string
}

export default function ShopeeMappingsPage() {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    const res = await fetch(`/api/admin/shopee/mappings${params}`)
    if (res.ok) setMappings(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此對應？')) return
    await fetch('/api/admin/shopee/mappings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">商品對應</h1>
      <p className="mt-1 text-sm text-gray-500">蝦皮商品編碼（商品ID_規格ID）↔ 系統套餐 SKU 的對應記錄</p>

      <div className="mt-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋蝦皮商品名稱、編碼..." value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={load} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : mappings.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <Link2 className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無對應記錄</p>
          <p className="mt-1 text-xs text-gray-400">在訂單明細中對應商品後會自動記錄</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">蝦皮商品</th>
                <th className="text-left px-4 py-3 font-medium">蝦皮編碼</th>
                <th className="text-left px-4 py-3 font-medium">對應 BC SKU</th>
                <th className="text-left px-4 py-3 font-medium">Copies</th>
                <th className="text-left px-4 py-3 font-medium">更新時間</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mappings.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="text-xs font-medium">{m.shopee_product_name || '-'}</div>
                    <div className="text-xs text-gray-400">{m.shopee_variation_name || '-'}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{m.shopee_sku_code}</td>
                  <td className="px-4 py-2 font-mono text-xs text-blue-600">{m.bc_sku_id || '-'}</td>
                  <td className="px-4 py-2 text-xs">{m.copies || '-'}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.updated_at).toLocaleDateString('zh-TW')}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => handleDelete(m.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
