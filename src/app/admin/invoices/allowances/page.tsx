'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

interface Row {
  id: string
  invoice_id: string
  allowance_number: string
  allowance_date: string
  allowance_type: string
  total_sales: number
  total_tax: number
  total_amount: number
  status: string
  created_at: string
  invoice: { invoice_number: string; buyer_type: string; buyer_id: string | null; buyer_name: string | null; buyer_company: string | null; invoice_date: string } | null
}

function tw(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export default function AllowancesPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [dateFrom, setDateFrom] = useState(tw(firstOfMonth))
  const [dateTo, setDateTo] = useState(tw(today))
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (dateFrom) p.set('date_from', dateFrom)
    if (dateTo) p.set('date_to', dateTo)
    if (status) p.set('status', status)
    const res = await fetch(`/api/admin/invoice-allowances?${p}`)
    if (res.ok) { const d = await res.json(); setRows(d.data || []); setTotal(d.total || 0) }
    setLoading(false)
  }
  useEffect(() => { load() }, [page]) // eslint-disable-line

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">折讓列表</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆折讓單</p>
        </div>
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-3 flex gap-2 items-center flex-wrap text-sm">
        <span className="text-xs text-gray-500">折讓日期</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
        <span className="text-xs text-gray-400">到</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
          <option value="">全部狀態</option>
          <option value="active">有效</option>
          <option value="cancelled">已作廢</option>
        </select>
        <button onClick={() => { setPage(1); load() }} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">篩選</button>
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">折讓日期</th>
              <th className="px-3 py-2 text-left">折讓單號</th>
              <th className="px-3 py-2 text-left">類型</th>
              <th className="px-3 py-2 text-left">對應發票</th>
              <th className="px-3 py-2 text-left">買受人</th>
              <th className="px-3 py-2 text-right">未稅</th>
              <th className="px-3 py-2 text-right">稅金</th>
              <th className="px-3 py-2 text-right">含稅總計</th>
              <th className="px-3 py-2 text-center">狀態</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">載入中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">沒有折讓單</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.allowance_date}</td>
                <td className="px-3 py-2 font-mono">{r.allowance_number}</td>
                <td className="px-3 py-2 text-xs">{r.allowance_type === '1' ? '買方開立' : '賣方開立'}</td>
                <td className="px-3 py-2">
                  {r.invoice ? (
                    <Link href={`/admin/invoices/${r.invoice_id}`} className="font-mono text-blue-600 hover:underline">{r.invoice.invoice_number}</Link>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">{r.invoice?.buyer_company || r.invoice?.buyer_name || (r.invoice?.buyer_type === 'B2C' ? '個人' : '公司') || '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{Number(r.total_sales).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{Number(r.total_tax).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{Number(r.total_amount).toLocaleString()}</td>
                <td className="px-3 py-2 text-center text-xs">
                  {r.status === 'active'
                    ? <span className="text-green-600">有效</span>
                    : <span className="text-red-500">已作廢</span>}
                </td>
              </tr>
            ))}
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
