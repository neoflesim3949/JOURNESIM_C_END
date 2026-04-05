'use client'

import { useEffect, useState } from 'react'
import { Search, Trash2, Link2 } from 'lucide-react'

interface SkuMapping {
  id: string; shopee_sku_code: string; shopee_product_name: string | null
  shopee_variation_name: string | null; shopee_product_id: string | null
  package_id: string | null; package_plan_id: string | null; copies: string | null
  bc_sku_id: string | null; updated_at: string
}

interface IdMapping {
  id: string; shopee_product_id?: string; shopee_variation_id?: string
  display_name: string; created_at: string
}

type Tab = 'sku' | 'product' | 'variation'

export default function ShopeeMappingsPage() {
  const [tab, setTab] = useState<Tab>('sku')
  const [skuMappings, setSkuMappings] = useState<SkuMapping[]>([])
  const [bcNameMap, setBcNameMap] = useState<Map<string, string>>(new Map())
  const [productMappings, setProductMappings] = useState<IdMapping[]>([])
  const [variationMappings, setVariationMappings] = useState<IdMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    if (tab === 'sku') {
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/admin/shopee/mappings${params}`)
      if (res.ok) {
        const data: SkuMapping[] = await res.json()
        setSkuMappings(data)
        // 查 BC 商品名稱
        const bcIds = [...new Set(data.map(m => m.bc_sku_id).filter(Boolean))] as string[]
        if (bcIds.length > 0) {
          const bcRes = await fetch(`/api/admin/shopee/bc-search?action=names&sku_ids=${bcIds.join(',')}`)
          if (bcRes.ok) {
            const bcData: { sku_id: string; name: string }[] = await bcRes.json()
            setBcNameMap(new Map(bcData.map(b => [b.sku_id, b.name])))
          }
        }
      }
    } else {
      const res = await fetch('/api/admin/shopee/id-mappings')
      if (res.ok) {
        const data = await res.json()
        setProductMappings(data.products || [])
        setVariationMappings(data.variations || [])
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  async function handleDeleteSku(id: string) {
    if (!confirm('確定刪除此對應？')) return
    await fetch('/api/admin/shopee/mappings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  async function handleDeleteIdMapping(type: 'product' | 'variation', id: string) {
    if (!confirm('確定刪除此對應？')) return
    await fetch('/api/admin/shopee/id-mappings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    })
    load()
  }

  const tabs: { key: Tab; label: string; desc: string }[] = [
    { key: 'sku', label: '商品編碼', desc: '蝦皮商品編碼（商品ID_規格ID）↔ 億點 BC SKU 對應' },
    { key: 'product', label: '商品名稱', desc: '蝦皮商品ID ↔ 自設商品名稱' },
    { key: 'variation', label: '規格名稱', desc: '蝦皮規格ID ↔ 自設規格名稱' },
  ]

  const currentTab = tabs.find(t => t.key === tab)!

  // 篩選 ID mappings
  const filteredProducts = search
    ? productMappings.filter(m => m.display_name.toLowerCase().includes(search.toLowerCase()) || m.shopee_product_id?.includes(search))
    : productMappings
  const filteredVariations = search
    ? variationMappings.filter(m => m.display_name.toLowerCase().includes(search.toLowerCase()) || m.shopee_variation_id?.includes(search))
    : variationMappings

  return (
    <div>
      <h1 className="text-2xl font-bold">商品對應</h1>

      {/* Tab 切換 */}
      <div className="mt-4 flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-gray-500">{currentTab.desc}</p>

      {/* 搜尋 */}
      <div className="mt-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋..." value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={load} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
        <>
          {/* 商品編碼對應表 */}
          {tab === 'sku' && (skuMappings.length === 0 ? (
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
                  {skuMappings.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="text-xs font-medium">{m.shopee_product_name || '-'}</div>
                        <div className="text-xs text-gray-400">{m.shopee_variation_name || '-'}</div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{m.shopee_sku_code}</td>
                      <td className="px-4 py-2">
                        {m.bc_sku_id ? (
                          <>
                            <div className="text-xs font-medium text-blue-600">{bcNameMap.get(m.bc_sku_id) || ''}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{m.bc_sku_id}</div>
                          </>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-2 text-xs">{m.copies || '-'}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.updated_at).toLocaleDateString('zh-TW')}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => handleDeleteSku(m.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* 商品名稱對應表 */}
          {tab === 'product' && (filteredProducts.length === 0 ? (
            <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
              <Link2 className="mx-auto w-12 h-12 text-gray-300" />
              <p className="mt-4 text-gray-500">尚無商品名稱對應</p>
              <p className="mt-1 text-xs text-gray-400">在訂單明細中設定商品ID的顯示名稱後會自動記錄</p>
            </div>
          ) : (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">商品 ID</th>
                    <th className="text-left px-4 py-3 font-medium">自設名稱</th>
                    <th className="text-left px-4 py-3 font-medium">建立時間</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{m.shopee_product_id}</td>
                      <td className="px-4 py-2 text-sm font-medium text-purple-600">{m.display_name}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString('zh-TW')}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => handleDeleteIdMapping('product', m.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* 規格名稱對應表 */}
          {tab === 'variation' && (filteredVariations.length === 0 ? (
            <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
              <Link2 className="mx-auto w-12 h-12 text-gray-300" />
              <p className="mt-4 text-gray-500">尚無規格名稱對應</p>
              <p className="mt-1 text-xs text-gray-400">在訂單明細中設定規格ID的顯示名稱後會自動記錄</p>
            </div>
          ) : (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">規格 ID</th>
                    <th className="text-left px-4 py-3 font-medium">自設名稱</th>
                    <th className="text-left px-4 py-3 font-medium">建立時間</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredVariations.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{m.shopee_variation_id}</td>
                      <td className="px-4 py-2 text-sm font-medium text-purple-600">{m.display_name}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString('zh-TW')}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => handleDeleteIdMapping('variation', m.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
