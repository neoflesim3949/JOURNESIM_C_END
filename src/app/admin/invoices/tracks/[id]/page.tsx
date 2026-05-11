'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface NumRow {
  invoice_number: string
  status: 'unused' | 'issued' | 'cancelled' | 'voided'
  invoice_id?: string
  invoice_date?: string
  invoice_time?: string
  total_amount?: number
  buyer?: string
}
interface TrackInfo {
  id: string
  track_prefix: string
  period_year: number
  period_start_month: number
  period_end_month: number
  start_number: string | number
  end_number: string | number
  next_number: string | number
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  unused: { label: '未使用', color: 'bg-gray-100 text-gray-500' },
  issued: { label: '開立完成', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '作廢', color: 'bg-red-100 text-red-700' },
  voided: { label: '註銷', color: 'bg-gray-200 text-gray-600' },
}

export default function TrackNumbersPage() {
  const { id } = useParams<{ id: string }>()
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [rows, setRows] = useState<NumRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState<'' | 'unused' | 'issued' | 'cancelled' | 'voided'>('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '100' })
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/invoice-tracks/${id}/numbers?${params}`)
    if (res.ok) {
      const d = await res.json()
      setTrack(d.track); setRows(d.rows || []); setTotal(d.total || 0)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [page, filterStatus, id]) // eslint-disable-line

  const totalPages = Math.ceil(total / 100)

  return (
    <div className="max-w-5xl">
      <Link href="/admin/invoices/tracks" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> 返回字軌列表
      </Link>

      <h1 className="mt-3 text-2xl font-bold">
        字軌號碼明細 {track && <span className="font-mono text-blue-600">{track.track_prefix}</span>}
      </h1>
      {track && (
        <p className="mt-1 text-sm text-gray-500">
          {track.period_year}年 {track.period_start_month}-{track.period_end_month}月 ·
          {' '}{track.start_number} ~ {track.end_number} · 共 {total} 筆
        </p>
      )}

      <div className="mt-4 flex gap-2 items-center text-xs">
        {(['', 'unused', 'issued', 'cancelled', 'voided'] as const).map(s => (
          <button key={s || 'all'} onClick={() => { setPage(1); setFilterStatus(s) }}
            className={`px-3 py-1.5 rounded ${filterStatus === s ? 'bg-blue-600 text-white' : 'border border-gray-300 hover:bg-gray-50'}`}>
            {s === '' ? '全部' : STATUS_LABEL[s]?.label || s}
          </button>
        ))}
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">發票號碼</th>
              <th className="px-3 py-2 text-center">狀態</th>
              <th className="px-3 py-2 text-left">開立時間</th>
              <th className="px-3 py-2 text-left">買受人</th>
              <th className="px-3 py-2 text-right">金額</th>
              <th className="px-3 py-2 text-center">明細</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">載入中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">無資料</td></tr>}
            {!loading && rows.map(r => {
              const st = STATUS_LABEL[r.status]
              return (
                <tr key={r.invoice_number} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono">{r.invoice_number}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded ${st?.color || 'bg-gray-100'}`}>{st?.label || r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.invoice_date ? `${r.invoice_date} ${(r.invoice_time || '').slice(0, 8)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.buyer || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.total_amount != null ? Number(r.total_amount).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.invoice_id ? (
                      <Link href={`/admin/invoices/${r.invoice_id}`} className="text-blue-600 hover:underline text-xs">查看</Link>
                    ) : <span className="text-gray-300">—</span>}
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
