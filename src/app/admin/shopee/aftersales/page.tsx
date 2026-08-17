'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

interface Row {
  id: string
  after_sale_id: string | null
  channel_order_id: string
  channel_sub_order_id: string | null
  shopee_order_id: string | null
  shopee_order_number: string | null
  iccids: string[] | null
  card_count: number
  reason: string
  refund_cny: number | null
  refund_twd: number | null
  status: string
  source: string | null
  created_at: string
}
interface Summary { count: number; card_count: number; refund_cny: number; refund_twd: number }

const REASON_LABEL: Record<string, string> = { '20': '20 無理由退訂', '29': '29 eSIM未下載' }
const SOURCE_LABEL: Record<string, string> = { order_detail: '訂單詳情', cards_lookup: '卡片查詢退卡' }

export default function ShopeeAftersalesPage() {
  // 預設當月（台灣時區）
  const fmtTW = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const now = new Date()
  const twParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const twYear = Number(twParts.find(p => p.type === 'year')?.value || now.getFullYear())
  const twMonth = Number(twParts.find(p => p.type === 'month')?.value || now.getMonth() + 1) - 1
  const [from, setFrom] = useState(fmtTW(new Date(twYear, twMonth, 1, 12)))
  const [to, setTo] = useState(fmtTW(new Date(twYear, twMonth + 1, 0, 12)))
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageSize = 50

  async function load(p = page) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/admin/shopee/aftersales?${params}`)
    if (res.ok) {
      const d = await res.json()
      setRows(d.data || []); setTotal(d.total || 0); setSummary(d.summary || null)
    }
    setLoading(false)
  }
  useEffect(() => { load(1); setPage(1) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  function pickMonth(offset: number) {
    const m = twMonth + offset
    setFrom(fmtTW(new Date(twYear, m, 1, 12)))
    setTo(fmtTW(new Date(twYear, m + 1, 0, 12)))
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">蝦皮售後</h1>
          <p className="mt-1 text-sm text-gray-500">售後訂單（F017）· 依售後日期統計退卡與退回成本</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="text-sm outline-none" />
            <span className="text-gray-400 text-sm">~</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="text-sm outline-none" />
          </div>
          <button onClick={() => pickMonth(0)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">本月</button>
          <button onClick={() => pickMonth(-1)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">上月</button>
          <button onClick={() => { setPage(1); load(1) }} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" /> 查詢
          </button>
        </div>
      </div>

      {summary && (
        <div className="mt-4 flex items-center gap-6 bg-rose-50 border border-rose-200 rounded-xl px-5 py-3 text-sm">
          <span className="font-semibold text-rose-700">區間合計</span>
          <span className="text-rose-700">{summary.count} 筆售後單</span>
          <span className="text-rose-700">退卡 {summary.card_count.toLocaleString()} 張</span>
          <span className="text-rose-700 font-semibold">退回成本 NT$ {summary.refund_twd.toLocaleString()}（¥{summary.refund_cny.toLocaleString()}）</span>
        </div>
      )}

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : rows.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">此區間沒有售後紀錄</p>
          <p className="mt-1 text-xs text-gray-400">售後訂單於「訂單詳情 → 使用狀況 → 批量售後」或「卡片查詢退卡」申請成功後生成</p>
        </div>
      ) : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">售後日期</th>
                <th className="px-3 py-2 text-left border-b">售後單號</th>
                <th className="px-3 py-2 text-left border-b">蝦皮訂單</th>
                <th className="px-3 py-2 text-left border-b">渠道單號</th>
                <th className="px-3 py-2 text-left border-b">退卡</th>
                <th className="px-3 py-2 text-left border-b">原因</th>
                <th className="px-3 py-2 text-right border-b">退回成本</th>
                <th className="px-3 py-2 text-left border-b">來源</th>
                <th className="px-3 py-2 text-left border-b">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const iccids = Array.isArray(r.iccids) ? r.iccids : []
                return (
                  <tr key={r.id} className="border-b hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString('zh-TW')}</td>
                    <td className="px-3 py-2 font-mono">{r.after_sale_id || '—'}</td>
                    <td className="px-3 py-2 font-mono">
                      {r.shopee_order_id
                        ? <Link href={`/admin/shopee/orders/${r.shopee_order_id}`} className="text-blue-600 hover:underline">{r.shopee_order_number || '查看'}</Link>
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.channel_order_id}{r.channel_sub_order_id && <div className="text-gray-400">{r.channel_sub_order_id}</div>}</td>
                    <td className="px-3 py-2 font-mono" title={iccids.join('\n')}>
                      {r.card_count} 張{iccids.length > 0 && <div className="text-gray-400">{iccids.slice(0, 2).join(', ')}{iccids.length > 2 ? '…' : ''}</div>}
                    </td>
                    <td className="px-3 py-2">{REASON_LABEL[r.reason] || r.reason || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {r.refund_cny != null ? `¥${Number(r.refund_cny).toFixed(2)}` : '—'}
                      {r.refund_twd != null && <div className="text-gray-400">NT$ {Math.round(Number(r.refund_twd))}</div>}
                    </td>
                    <td className="px-3 py-2">{SOURCE_LABEL[r.source || ''] || r.source || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status === 'cancelled' ? (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px]">已取消</span>
                      ) : r.status === 'reordered' ? (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">已重新下單</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px]">已送出</span>
                          {r.after_sale_id && (
                            <button
                              onClick={async () => {
                                if (!confirm(`確定取消售後單 ${r.after_sale_id}？\n未審核 → F018 取消，套餐直接恢復；\n已審核成功 → 自動以 F007 充值原套餐回同一批卡（重新下單）。`)) return
                                const res = await fetch('/api/admin/shopee/aftersales', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'cancel', id: r.id }),
                                })
                                const d = await res.json()
                                if (!res.ok) { alert(d.error || '取消失敗'); return }
                                alert(d.mode === 'reordered'
                                  ? `售後已審核無法取消，已自動重新下單\nBC 訂單號：${d.order_id}（渠道單 ${d.channel_order_id}）`
                                  : '已取消售後，套餐恢復')
                                load(page)
                              }}
                              className="px-2 py-1 text-[10px] border border-red-300 text-red-500 rounded hover:bg-red-50">
                              取消售後
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-gray-500">共 {total} 筆</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p) }} disabled={page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages || 1}</span>
              <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p) }} disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
