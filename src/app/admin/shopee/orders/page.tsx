'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Upload, Search, Package, ChevronRight, Settings, Printer, X } from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Code 128B 一維條碼 SVG 生成 ──────────────────────────
function generateCode128SVG(text: string, height = 30, barWidth = 1.5): string {
  const P = '212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232'.split(',')
  const STOP = '2331112'
  const START_B = 104
  const vals = Array.from(text).map(c => c.charCodeAt(0) - 32)
  let checksum = START_B
  vals.forEach((v, i) => { checksum += v * (i + 1) })
  checksum = checksum % 103
  const codes = [P[START_B], ...vals.map(v => P[v]), P[checksum], STOP]
  const quietZone = 10 * barWidth
  let x = quietZone
  const bars: string[] = []
  for (const code of codes) {
    for (let i = 0; i < code.length; i++) {
      const w = Number(code[i]) * barWidth
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`)
      x += w
    }
  }
  const totalWidth = x + quietZone
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" style="background:white">${bars.join('')}</svg>`
}

interface ShopeeSettlement {
  wallet_amount: number | null; original_price: number | null; seller_coupon: number | null
  ams_fee: number | null; transaction_fee: number | null; other_service_fee: number | null
  processing_fee: number | null
}

interface ShopeeOrder {
  id: string; shopee_order_number: string; order_status: string | null
  return_status: string | null
  buyer_account: string | null; order_date: string | null
  buyer_total_payment: number | null; recipient_name: string | null
  product_total: number | null; created_at: string
  shopee_account_id: string | null; shopee_tracking_code: string | null
  internal_status: string; shopee_order_items: { id: string; status: string }[]
  shopee_settlements: ShopeeSettlement[]
}

function getFinanceStatus(order: ShopeeOrder): { label: string; color: string } {
  const settlements = order.shopee_settlements || []
  if (settlements.length === 0) return { label: '未匯入', color: 'bg-gray-100 text-gray-500' }
  const s = settlements[0]
  const originalPrice = s.original_price ?? order.product_total ?? 0
  const sellerCoupon = Math.abs(s.seller_coupon ?? 0)
  const platformFees = Math.abs(s.ams_fee ?? 0) +
    Math.abs(s.transaction_fee ?? 0) + Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
  const walletAmount = s.wallet_amount ?? 0
  const expected = originalPrice - sellerCoupon - platformFees
  if (Math.abs(expected - walletAmount) > 1) return { label: '金流異常', color: 'bg-red-100 text-red-700' }
  return { label: '已匯入', color: 'bg-green-100 text-green-700' }
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
  // 篩選
  const [filterOrderDateFrom, setFilterOrderDateFrom] = useState('')
  const [filterOrderDateTo, setFilterOrderDateTo] = useState('')
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('')
  const [filterCreatedTo, setFilterCreatedTo] = useState('')
  const [filterReturnStatus, setFilterReturnStatus] = useState('')
  const [filterFinanceStatus, setFilterFinanceStatus] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  // 排序
  const [sortBy, setSortBy] = useState('order_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [importing, setImporting] = useState(false)
  const [importingSettlement, setImportingSettlement] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const settlementFileRef = useRef<HTMLInputElement>(null)
  const [showLabelSettings, setShowLabelSettings] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')
  const [labelSettings, setLabelSettings] = useState({ line1: 12, line2: 12, line3: 10 })
  // 帳號
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  // 勾選 & 批次列印
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchPrintModal, setBatchPrintModal] = useState<'detail' | 'product' | null>(null)
  const [batchPrintData, setBatchPrintData] = useState<{ order: any; items: any[] }[]>([])
  const [batchLoading, setBatchLoading] = useState(false)

  // 從 localStorage 載入設定 + 載入帳號
  useEffect(() => {
    const saved = localStorage.getItem('shopee_label_settings')
    if (saved) { try { setLabelSettings(JSON.parse(saved)) } catch {} }
    const savedExpiry = localStorage.getItem('shopee_expiry_date')
    if (savedExpiry) setExpiryDate(savedExpiry)
    fetch('/api/admin/shopee/accounts').then(r => r.json()).then(d => setAccounts(d || []))
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
    const params = new URLSearchParams({ page: String(page), pageSize: '20', sort_by: sortBy, sort_dir: sortDir })
    if (search) params.set('search', search)
    if (filterStatus) params.set('status', filterStatus)
    if (filterReturnStatus) params.set('return_status', filterReturnStatus)
    if (filterOrderDateFrom) params.set('order_date_from', filterOrderDateFrom)
    if (filterOrderDateTo) params.set('order_date_to', filterOrderDateTo)
    if (filterCreatedFrom) params.set('created_from', filterCreatedFrom)
    if (filterCreatedTo) params.set('created_to', filterCreatedTo)
    if (filterAccount) params.set('account_id', filterAccount)
    const res = await fetch(`/api/admin/shopee/orders?${params}`)
    if (res.ok) { const d = await res.json(); setOrders(d.data || []); setTotal(d.total || 0) }
    setLoading(false)
  }

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const accountMap = new Map(accounts.map(a => [a.id, a.name]))
  // 金流狀態在前端過濾（因為是計算欄位）
  const displayOrders = filterFinanceStatus
    ? orders.filter(o => getFinanceStatus(o).label === filterFinanceStatus)
    : orders

  useEffect(() => { load() }, [page, sortBy, sortDir])

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
      body: JSON.stringify({ rows, account_id: selectedAccount || undefined }),
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
      body: JSON.stringify({ rows, account_id: selectedAccount || undefined }),
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

  // 批次列印
  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSelectAll() {
    if (selectedIds.size === displayOrders.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(displayOrders.map(o => o.id)))
  }
  async function openBatchPrint(type: 'detail' | 'product') {
    if (selectedIds.size === 0) { alert('請先勾選訂單'); return }
    setBatchLoading(true); setBatchPrintModal(type)
    const res = await fetch('/api/admin/shopee/orders/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] }),
    })
    if (res.ok) setBatchPrintData(await res.json())
    setBatchLoading(false)
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
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">選擇帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-gray-500">已選 {selectedIds.size} 筆</span>
              <button onClick={() => openBatchPrint('detail')} className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">
                <Printer className="w-4 h-4" /> 批次商品明細
              </button>
              <button onClick={() => openBatchPrint('product')} className="flex items-center gap-1 px-3 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700">
                <Printer className="w-4 h-4" /> 批次商品標籤
              </button>
            </>
          )}
          <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer ${importing ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" /> {importing ? '匯入中...' : '匯入訂單 Excel'}
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

      <div className="mt-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="搜尋訂單號、買家、收件人..." value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button onClick={() => { setPage(1); load() }} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-gray-500">訂單日期：</span>
          <input type="date" value={filterOrderDateFrom} onChange={e => setFilterOrderDateFrom(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-400">~</span>
          <input type="date" value={filterOrderDateTo} onChange={e => setFilterOrderDateTo(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-500 ml-2">匯入日期：</span>
          <input type="date" value={filterCreatedFrom} onChange={e => setFilterCreatedFrom(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-400">~</span>
          <input type="date" value={filterCreatedTo} onChange={e => setFilterCreatedTo(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <select value={filterReturnStatus} onChange={e => setFilterReturnStatus(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs ml-2">
            <option value="">退貨/退款</option>
            <option value="has">有退貨/退款</option>
            <option value="none">無退貨/退款</option>
          </select>
          <select value={filterFinanceStatus} onChange={e => setFilterFinanceStatus(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">金流狀態</option>
            <option value="未匯入">未匯入</option>
            <option value="已匯入">已匯入</option>
            <option value="金流異常">金流異常</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">系統狀態</option>
            <option value="pending">待處理</option>
            <option value="processing">處理中</option>
            <option value="completed">已完成</option>
          </select>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">全部帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => { setPage(1); load() }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">篩選</button>
          <button onClick={() => { setFilterOrderDateFrom(''); setFilterOrderDateTo(''); setFilterCreatedFrom(''); setFilterCreatedTo(''); setFilterReturnStatus(''); setFilterFinanceStatus(''); setFilterStatus(''); setFilterAccount(''); setSearch(''); setPage(1); setTimeout(load, 0) }}
            className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">清除</button>
        </div>
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
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={displayOrders.length > 0 && selectedIds.size === displayOrders.length}
                    onChange={toggleSelectAll} className="rounded border-gray-300" />
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort('order_date')}>
                  訂單日期 {sortBy === 'order_date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort('created_at')}>
                  匯入日期 {sortBy === 'created_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left px-4 py-3 font-medium">帳號</th>
                <th className="text-left px-4 py-3 font-medium">蝦皮訂單號</th>
                <th className="text-left px-4 py-3 font-medium">買家</th>
                <th className="text-left px-4 py-3 font-medium">金額</th>
                <th className="text-left px-4 py-3 font-medium">商品數</th>
                <th className="text-left px-4 py-3 font-medium">蝦皮狀態</th>
                <th className="text-left px-4 py-3 font-medium">退貨/退款</th>
                <th className="text-left px-4 py-3 font-medium">金流狀態</th>
                <th className="text-left px-4 py-3 font-medium">系統狀態</th>
                <th className="text-left px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayOrders.map((o) => {
                const s = STATUS_LABELS[o.internal_status] || { label: o.internal_status, color: 'bg-gray-100 text-gray-600' }
                const fs = getFinanceStatus(o)
                const pendingItems = o.shopee_order_items?.filter(i => i.status === 'pending').length || 0
                const fmtDate = (d: string | null) => d ? d.slice(0, 10) : '-'
                const simplifyStatus = (st: string | null) => {
                  if (!st) return '-'
                  if (st.includes('已完成')) return '已完成'
                  return st
                }
                return (
                  <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(o.order_date)}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(o.created_at)}</td>
                    <td className="px-4 py-2 text-xs">{o.shopee_account_id ? accountMap.get(o.shopee_account_id) || '-' : '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {o.shopee_order_number}
                      {o.shopee_tracking_code && <div className="text-[10px] text-gray-400">({o.shopee_tracking_code})</div>}
                    </td>
                    <td className="px-4 py-2 text-xs">{o.buyer_account || '-'}</td>
                    <td className="px-4 py-2 text-xs font-medium">NT$ {o.buyer_total_payment || '-'}</td>
                    <td className="px-4 py-2 text-xs">
                      {o.shopee_order_items?.length || 0}
                      {pendingItems > 0 && <span className="ml-1 text-orange-500">({pendingItems} 待對應)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">{simplifyStatus(o.order_status)}</td>
                    <td className="px-4 py-2 text-xs">{o.return_status || '-'}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${fs.color}`}>{fs.label}</span></td>
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

      {/* 批次列印彈窗 */}
      {batchPrintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setBatchPrintModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">{batchPrintModal === 'detail' ? `批次明細標籤（${batchPrintData.length} 筆）` : `批次商品標籤（${batchPrintData.length} 筆）`}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const el = document.getElementById('batch-print-area')
                  if (!el) return
                  const w = window.open('', '', `width=${screen.width},height=${screen.height}`)
                  if (!w) return
                  if (batchPrintModal === 'product') {
                    w.document.write(`<html><head><style>
                      @page{size:30mm 15mm;margin:0}
                      body{margin:0;padding:0;font-family:sans-serif}
                      body>div{gap:0!important}
                      .label{width:30mm;height:15mm;padding:1mm 2mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:1mm;page-break-after:always;border:none!important}
                    </style></head><body>${el.innerHTML}</body></html>`)
                  } else {
                    w.document.write(`<html><head><style>
                      @page{size:100mm 150mm;margin:0}
                      body{margin:0;font-family:sans-serif}
                      .detail-label{page-break-after:always}
                    </style></head><body>${el.innerHTML}</body></html>`)
                  }
                  w.document.close(); w.print(); w.close()
                }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Printer className="w-4 h-4" /> 列印
                </button>
                <button onClick={() => setBatchPrintModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5" id="batch-print-area">
              {batchLoading ? <p className="text-gray-500 text-sm">載入中...</p> : batchPrintModal === 'detail' ? (
                /* 批次明細標籤 */
                batchPrintData.map((d, idx) => (
                  <div key={idx} className="detail-label" style={{ width: '100mm', minHeight: '150mm', padding: '5mm', fontSize: '11px', fontFamily: 'sans-serif', border: '1px solid #ccc', margin: '0 auto', marginBottom: '5mm', pageBreakAfter: 'always' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                      蝦皮訂單：{d.order.shopee_order_number}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '3mm' }}>日期：{d.order.order_date}</div>
                    <div style={{ borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>收件人：</strong>{d.order.recipient_name}</span><span><strong>電話：</strong>{d.order.recipient_phone}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>地址：</strong>{d.order.zip_code} {d.order.city}{d.order.district} {d.order.shipping_address}</span>
                        <span>{d.order.shipping_method && <><strong>寄送：</strong>{d.order.shipping_method}</>}{d.order.pickup_store_id && <> · <strong>門市：</strong>{d.order.pickup_store_id}</>}</span>
                      </div>
                    </div>
                    {d.order.shopee_tracking_code && (
                      <div style={{ borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '1mm' }}>包裹：{d.order.shopee_tracking_code}</div>
                        <div dangerouslySetInnerHTML={{ __html: generateCode128SVG(d.order.shopee_tracking_code, 25, 1.5) }} />
                      </div>
                    )}
                    <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>商品明細：</div>
                    {d.items.map((item: any, i: number) => (
                      <div key={i} style={{ border: '1px solid #000', borderRadius: '2mm', padding: '2mm', marginBottom: '2mm' }}>
                        <div><strong>{i + 1}. {item.shopee_product_name}</strong> × {item.quantity}</div>
                        <div style={{ fontSize: '10px', color: '#666' }}>{item.shopee_variation_name}</div>
                        {item.iccid?.map((ic: string, j: number) => <div key={j} style={{ fontSize: '9px', fontFamily: 'monospace' }}>ICCID: {ic}</div>)}
                      </div>
                    ))}
                    {d.order.buyer_note && <div style={{ marginTop: '3mm', padding: '2mm', background: '#fff3cd', borderRadius: '2mm', fontSize: '10px' }}><strong>買家備註：</strong>{d.order.buyer_note}</div>}
                    <div style={{ marginTop: '3mm', textAlign: 'right', fontWeight: 'bold' }}>金額：NT$ {d.order.buyer_total_payment}</div>
                  </div>
                ))
              ) : (
                /* 批次商品標籤 */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4mm', alignItems: 'center' }}>
                  {batchPrintData.flatMap((d, idx) =>
                    d.items.flatMap((item: any) =>
                      Array.from({ length: item.quantity }, (_, j) => (
                        <div key={`${idx}-${item.id}-${j}`} className="label"
                          style={{ width: '30mm', height: '15mm', border: '1px solid #ccc', padding: '1mm 2mm', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxSizing: 'border-box', pageBreakAfter: 'always' }}>
                          <div style={{ fontSize: `${labelSettings.line1}px`, fontWeight: 'bold', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {item.shopee_product_name}
                          </div>
                          <div style={{ fontSize: `${labelSettings.line2}px`, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {item.shopee_variation_name}
                          </div>
                          {expiryDate && (
                            <div style={{ fontSize: `${labelSettings.line3}px`, lineHeight: 1.2, whiteSpace: 'nowrap' }}>使用期限：{expiryDate.replace(/-/g, '/')}</div>
                          )}
                        </div>
                      ))
                    )
                  )}
                </div>
              )}
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
