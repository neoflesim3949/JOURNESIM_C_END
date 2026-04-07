'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Upload, Search, Package, ChevronRight, Settings } from 'lucide-react'
import * as XLSX from 'xlsx'

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
                  <tr key={o.id} className="hover:bg-gray-50">
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
