'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, Trash2, Link2, Download, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'

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
  // 蝦皮商品名稱 lookup（from order items）
  const [skuNames, setSkuNames] = useState<Record<string, { product_name: string; variation_name: string }>>({})
  const [varNames, setVarNames] = useState<Record<string, { product_name: string; variation_name: string }>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      // 載入 ID mappings（API 已包含蝦皮商品名稱 from order items）
      const idRes = await fetch('/api/admin/shopee/id-mappings').then(r => r.json())
      setProductMappings(idRes.products || [])
      setVariationMappings(idRes.variations || [])
      setSkuNames(idRes.skuNames || {})
      setVarNames(idRes.varNames || {})
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

  // 下載範本
  function downloadTemplate() {
    const headers = tab === 'product'
      ? [['商品編碼', '自設名稱']]
      : [['規格ID', '自設名稱']]
    const ws = XLSX.utils.aoa_to_sheet(headers)
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '範本')
    XLSX.writeFile(wb, tab === 'product' ? '商品名稱範本.xlsx' : '規格名稱範本.xlsx')
  }

  // 批量上傳
  async function handleBatchUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { raw: false })

      let count = 0
      for (const row of rows) {
        const id = tab === 'product'
          ? (row['商品編碼'] || '').trim()
          : (row['規格ID'] || '').trim()
        const name = (row['自設名稱'] || '').trim()
        if (!id || !name) continue
        await fetch('/api/admin/shopee/id-mappings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: tab, shopee_id: id, display_name: name }),
        })
        count++
      }
      alert(`成功匯入 ${count} 筆`)
      load()
    } catch {
      alert('檔案解析失敗')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const tabs: { key: Tab; label: string; desc: string }[] = [
    { key: 'sku', label: '商品對應', desc: '蝦皮商品編碼（商品ID_規格ID）↔ 億點 BC SKU 對應' },
    { key: 'product', label: '商品名稱', desc: '蝦皮商品編碼（商品ID_規格ID）↔ 自設商品名稱' },
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

      {/* 搜尋 + 批量操作 */}
      <div className="mt-4 flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋..." value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={load} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
        {(tab === 'product' || tab === 'variation') && (
          <>
            <button onClick={downloadTemplate} className="flex items-center gap-1 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              <Download className="w-4 h-4" /> 下載範本
            </button>
            <label className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg cursor-pointer ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              <Upload className="w-4 h-4" /> {uploading ? '匯入中...' : '批量上傳'}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBatchUpload} disabled={uploading} />
            </label>
          </>
        )}
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
        <>
          {/* 商品對應表 */}
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
              <p className="mt-1 text-xs text-gray-400">在訂單明細中設定商品編碼的顯示名稱後會自動記錄</p>
            </div>
          ) : (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">蝦皮商品</th>
                    <th className="text-left px-4 py-3 font-medium">商品編碼</th>
                    <th className="text-left px-4 py-3 font-medium">自設名稱</th>
                    <th className="text-left px-4 py-3 font-medium">建立時間</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map(m => {
                    const sn = skuNames[m.shopee_product_id || '']
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="text-xs font-medium">{sn?.product_name || '-'}</div>
                          <div className="text-xs text-gray-400">{sn?.variation_name || '-'}</div>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{m.shopee_product_id}</td>
                        <td className="px-4 py-2 text-sm font-medium text-purple-600">{m.display_name}</td>
                        <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString('zh-TW')}</td>
                        <td className="px-2 py-2">
                          <button onClick={() => handleDeleteIdMapping('product', m.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
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
                    <th className="text-left px-4 py-3 font-medium">蝦皮商品</th>
                    <th className="text-left px-4 py-3 font-medium">規格 ID</th>
                    <th className="text-left px-4 py-3 font-medium">自設名稱</th>
                    <th className="text-left px-4 py-3 font-medium">建立時間</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredVariations.map(m => {
                    const vn = varNames[m.shopee_variation_id || '']
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="text-xs font-medium">{vn?.product_name || '-'}</div>
                          <div className="text-xs text-gray-400">{vn?.variation_name || '-'}</div>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{m.shopee_variation_id}</td>
                        <td className="px-4 py-2 text-sm font-medium text-purple-600">{m.display_name}</td>
                        <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString('zh-TW')}</td>
                        <td className="px-2 py-2">
                          <button onClick={() => handleDeleteIdMapping('variation', m.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
