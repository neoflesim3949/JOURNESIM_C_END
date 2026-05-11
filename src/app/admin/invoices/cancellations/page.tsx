'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

interface Row {
  id: string
  invoice_number: string
  invoice_date: string
  invoice_type: string
  buyer_type: string
  buyer_id: string | null
  buyer_name: string | null
  buyer_company: string | null
  total_amount: number
  cancelled_at: string | null
  cancel_reason: string | null
}

function tw(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export default function CancellationsPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [dateFrom, setDateFrom] = useState(tw(firstOfMonth))
  const [dateTo, setDateTo] = useState(tw(today))
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page), pageSize: '50', status: 'cancelled' })
    if (dateFrom) p.set('date_from', dateFrom)
    if (dateTo) p.set('date_to', dateTo)
    const res = await fetch(`/api/admin/invoices?${p}`)
    if (res.ok) { const d = await res.json(); setRows(d.data || []); setTotal(d.total || 0) }
    setLoading(false)
  }
  useEffect(() => { load() }, [page]) // eslint-disable-line

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">作廢列表</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆作廢發票（號碼仍占用）</p>
        </div>
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-3 flex gap-2 items-center flex-wrap text-sm">
        <span className="text-xs text-gray-500">發票日期</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
        <span className="text-xs text-gray-400">到</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
        <button onClick={() => { setPage(1); load() }} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">篩選</button>
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">發票號碼</th>
              <th className="px-3 py-2 text-left">發票日期</th>
              <th className="px-3 py-2 text-left">類型</th>
              <th className="px-3 py-2 text-left">買受人</th>
              <th className="px-3 py-2 text-right">金額</th>
              <th className="px-3 py-2 text-left">作廢時間</th>
              <th className="px-3 py-2 text-left">作廢原因</th>
              <th className="px-3 py-2 text-center">明細</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">載入中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">沒有作廢發票</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-red-600">{r.invoice_number}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.invoice_date}</td>
                <td className="px-3 py-2 text-xs">{r.buyer_type === 'B2C' ? '二聯' : '三聯'}</td>
                <td className="px-3 py-2 text-xs">{r.buyer_company || r.buyer_name || (r.buyer_type === 'B2C' ? '個人' : '公司')}</td>
                <td className="px-3 py-2 text-right font-mono">{Number(r.total_amount).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.cancelled_at ? new Date(r.cancelled_at).toLocaleString('zh-TW') : '—'}</td>
                <td className="px-3 py-2 text-xs">{r.cancel_reason || '—'}</td>
                <td className="px-3 py-2 text-center"><Link href={`/admin/invoices/${r.id}`} className="text-blue-600 hover:underline text-xs">查看</Link></td>
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
