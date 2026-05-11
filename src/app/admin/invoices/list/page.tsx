'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Search, RefreshCw } from 'lucide-react'

interface Invoice {
  id: string
  invoice_number: string
  random_number: string
  invoice_date: string
  invoice_time: string
  invoice_type: string
  buyer_type: string
  tax_type: string
  total_amount: number
  orderid: string | null
  data_id: string | null
  status: string
}
interface Stats {
  b2c: { issued: number; sales: number; cancelled: number; voided: number }
  b2b: { issued: number; sales: number; cancelled: number; voided: number }
}

const TAX_LABEL: Record<string, string> = { '1': '應稅', '2': '零稅率', '3': '免稅', '4': '應稅(特種)', '9': '混合' }
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  issued: { label: '開立完成', color: 'text-green-600' },
  cancelled: { label: '作廢', color: 'text-red-500' },
  voided: { label: '註銷', color: 'text-gray-500' },
}

function tw(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(date)
}

export default function InvoiceListPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [taxType, setTaxType] = useState('')
  // 預設當月
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [dateFrom, setDateFrom] = useState(tw(firstOfMonth))
  const [dateTo, setDateTo] = useState(tw(today))
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Invoice[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (taxType) params.set('tax_type', taxType)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const res = await fetch(`/api/admin/invoices?${params}`)
    if (res.ok) {
      const d = await res.json()
      setRows(d.data || [])
      setTotal(d.total || 0)
      setStats(d.stats || null)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  function setPreset(preset: 'today' | 'week' | 'month') {
    const now = new Date()
    if (preset === 'today') { setDateFrom(tw(now)); setDateTo(tw(now)) }
    else if (preset === 'week') {
      const day = now.getDay() || 7
      const start = new Date(now); start.setDate(now.getDate() - day + 1)
      setDateFrom(tw(start)); setDateTo(tw(now))
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setDateFrom(tw(start)); setDateTo(tw(now))
    }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> 發票列表</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆</p>
        </div>
        <Link href="/admin/invoices/issue" className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ 開立發票</Link>
      </div>

      {/* 篩選 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="發票號碼 / 訂單號碼 / 統編 / 買受人..." value={search}
              onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPage(1), load())}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <button onClick={() => { setPage(1); load() }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">搜尋</button>
        </div>
        <div className="flex gap-2 items-center flex-wrap text-sm">
          <span className="text-xs text-gray-500">發票日期</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
          <span className="text-xs text-gray-400">到</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
          <button onClick={() => setPreset('today')} className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">本日</button>
          <button onClick={() => setPreset('week')} className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">本週</button>
          <button onClick={() => setPreset('month')} className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">本月</button>

          <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs ml-2">
            <option value="">全部狀態</option>
            <option value="issued">開立完成</option>
            <option value="cancelled">作廢</option>
            <option value="voided">註銷</option>
          </select>
          <select value={taxType} onChange={e => setTaxType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
            <option value="">全部稅率</option>
            {Object.entries(TAX_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => { setPage(1); load() }} className="px-3 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200">篩選</button>
          <button onClick={() => { setSearch(''); setStatus(''); setTaxType(''); setDateFrom(tw(firstOfMonth)); setDateTo(tw(today)); setPage(1); setTimeout(load, 0) }}
            className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">清除</button>
          <button onClick={load} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* 統計表 */}
      {stats && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left"></th>
                <th className="px-3 py-2 text-right">開立</th>
                <th className="px-3 py-2 text-right">銷售額（含稅）</th>
                <th className="px-3 py-2 text-right">作廢</th>
                <th className="px-3 py-2 text-right">註銷</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">B2C（二聯）</td>
                <td className="px-3 py-2 text-right text-amber-600 font-bold">{stats.b2c.issued}</td>
                <td className="px-3 py-2 text-right">{stats.b2c.sales.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-red-500">{stats.b2c.cancelled}</td>
                <td className="px-3 py-2 text-right text-gray-500">{stats.b2c.voided}</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium">B2B（三聯）</td>
                <td className="px-3 py-2 text-right text-amber-600 font-bold">{stats.b2b.issued}</td>
                <td className="px-3 py-2 text-right">{stats.b2b.sales.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-red-500">{stats.b2b.cancelled}</td>
                <td className="px-3 py-2 text-right text-gray-500">{stats.b2b.voided}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 列表 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">類型(稅率)</th>
              <th className="px-3 py-2 text-left">開立時間</th>
              <th className="px-3 py-2 text-left">發票號碼</th>
              <th className="px-3 py-2 text-right">金額</th>
              <th className="px-3 py-2 text-left">買受人</th>
              <th className="px-3 py-2 text-left">自訂編號</th>
              <th className="px-3 py-2 text-center">狀態</th>
              <th className="px-3 py-2 text-center">明細</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">載入中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">沒有發票</td></tr>}
            {!loading && rows.map(r => {
              const st = STATUS_LABEL[r.status] || { label: r.status, color: '' }
              return (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{r.buyer_type === 'B2C' ? '二聯' : '三聯'}({TAX_LABEL[r.tax_type] || '-'})</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.invoice_date} {r.invoice_time?.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono">{r.invoice_number}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(r.total_amount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">{r.buyer_type === 'B2C' ? '個人' : '公司'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.orderid || r.data_id || '-'}</td>
                  <td className={`px-3 py-2 text-center text-xs font-medium ${st.color}`}>{st.label}</td>
                  <td className="px-3 py-2 text-center">
                    <Link href={`/admin/invoices/${r.id}`} className="text-blue-600 hover:underline text-xs">查看</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">上一頁</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">下一頁</button>
        </div>
      )}
    </div>
  )
}
