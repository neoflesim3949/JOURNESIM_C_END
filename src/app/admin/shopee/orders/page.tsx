'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Upload, Search, Package, ChevronRight, Settings } from 'lucide-react'
import * as XLSX from 'xlsx'

interface ShopeeOrder {
  id: string; shopee_order_number: string; order_status: string | null
  buyer_account: string | null; order_date: string | null
  buyer_total_payment: number | null; recipient_name: string | null
  internal_status: string; shopee_order_items: { id: string; status: string }[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '處理中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
}

export default function ShopeeOrdersPage() {
  const [orders, setOrders] = useState<ShopeeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [importingSettlement, setImportingSettlement] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const settlementFileRef = useRef<HTMLInputElement>(null)
  const [showLabelSettings, setShowLabelSettings] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')
  const [labelSettings, setLabelSettings] = useState({ line1: 12, line2: 12, line3: 10 })

  // 從 localStorage 載入設定
  useEffect(() => {
    const saved = localStorage.getItem('shopee_label_settings')
    if (saved) { try { setLabelSettings(JSON.parse(saved)) } catch {} }
    const savedExpiry = localStorage.getItem('shopee_expiry_date')
    if (savedExpiry) setExpiryDate(savedExpiry)
  }, [])

  function saveExpiryDate(date: string) {
    setExpiryDate(date)
    localStorage.setItem('shopee_expiry_date', date)
  }

  function saveLabelSettings(s: { line1: number; line2: number; line3: number }) {
    setLabelSettings(s)
    localStorage.setItem('shopee_label_settings', JSON.stringify(s))
    setShowLabelSettings(false)
  }

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/shopee/orders?${params}`)
    if (res.ok) { const d = await res.json(); setOrders(d.data || []); setTotal(d.total || 0) }
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportResult(null)

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

    const res = await fetch('/api/admin/shopee/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    const data = await res.json()
    setImportResult(`匯入完成：新增 ${data.created} 筆、更新 ${data.updated} 筆、商品 ${data.items} 項`)
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function handleSettlementImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingSettlement(true); setImportResult(null)

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

    const res = await fetch('/api/admin/shopee/import-settlement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    const data = await res.json()
    if (res.ok) {
      setImportResult(`金流匯入完成：新增 ${data.created} 筆、更新 ${data.updated} 筆`)
    } else {
      setImportResult(`金流匯入失敗：${data.error}`)
    }
    setImportingSettlement(false)
    if (settlementFileRef.current) settlementFileRef.current.value = ''
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">蝦皮訂單</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆訂單</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-gray-500">使用期限：</span>
            <input type="date" value={expiryDate} onChange={(e) => saveExpiryDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          <button onClick={() => setShowLabelSettings(true)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50" title="標籤設定">
            <Settings className="w-4 h-4" />
          </button>
          <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer ${importing ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" /> {importing ? '匯入中...' : '匯入 Excel'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
          <label className={`flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 cursor-pointer ${importingSettlement ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" /> {importingSettlement ? '匯入中...' : '匯入金流 Excel'}
            <input ref={settlementFileRef} type="file" accept=".xlsx,.xls" onChange={handleSettlementImport} className="hidden" disabled={importingSettlement} />
          </label>
        </div>
      </div>

      {importResult && (
        <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{importResult}</div>
      )}

      <div className="mt-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋訂單號、買家、收件人..." value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={() => { setPage(1); load() }} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : orders.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無蝦皮訂單</p>
          <p className="mt-1 text-xs text-gray-400">從蝦皮後台匯出 Excel 後點擊「匯入 Excel」</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">蝦皮訂單號</th>
                <th className="text-left px-4 py-3 font-medium">買家</th>
                <th className="text-left px-4 py-3 font-medium">收件人</th>
                <th className="text-left px-4 py-3 font-medium">金額</th>
                <th className="text-left px-4 py-3 font-medium">商品數</th>
                <th className="text-left px-4 py-3 font-medium">蝦皮狀態</th>
                <th className="text-left px-4 py-3 font-medium">系統狀態</th>
                <th className="text-left px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => {
                const s = STATUS_LABELS[o.internal_status] || { label: o.internal_status, color: 'bg-gray-100 text-gray-600' }
                const pendingItems = o.shopee_order_items?.filter(i => i.status === 'pending').length || 0
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{o.shopee_order_number}</td>
                    <td className="px-4 py-2 text-xs">{o.buyer_account || '-'}</td>
                    <td className="px-4 py-2 text-xs">{o.recipient_name || '-'}</td>
                    <td className="px-4 py-2 text-xs font-medium">NT$ {o.buyer_total_payment || '-'}</td>
                    <td className="px-4 py-2 text-xs">
                      {o.shopee_order_items?.length || 0}
                      {pendingItems > 0 && <span className="ml-1 text-orange-500">({pendingItems} 待對應)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">{o.order_status || '-'}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${s.color}`}>{s.label}</span></td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/shopee/orders/${o.id}`} className="text-gray-400 hover:text-blue-600"><ChevronRight className="w-4 h-4" /></Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">共 {total} 筆</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}

      {/* 標籤字體設定彈窗 */}
      {showLabelSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowLabelSettings(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold mb-4">商品標籤字體設定</h2>
            <div className="space-y-3">
              {([['line1', '第一行（商品名稱）'], ['line2', '第二行（規格名稱）'], ['line3', '第三行（使用期限）']] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={labelSettings[key]} onChange={(e) => setLabelSettings({ ...labelSettings, [key]: Number(e.target.value) })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" /> <span className="text-xs text-gray-400">pt</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-center" style={{ width: '30mm', height: '15mm', margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px solid #ccc' }}>
              <div style={{ fontSize: `${labelSettings.line1}px`, fontWeight: 'bold', lineHeight: 1.2 }}>商品名稱預覽</div>
              <div style={{ fontSize: `${labelSettings.line2}px`, lineHeight: 1.2 }}>規格名稱預覽</div>
              <div style={{ fontSize: `${labelSettings.line3}px`, lineHeight: 1.2 }}>使用期限：2026/04/06</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => saveLabelSettings(labelSettings)} className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">儲存</button>
              <button onClick={() => setShowLabelSettings(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
