'use client'

import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface PlanSub {
  skuName?: string
  copies?: string
  planStatus?: string
  planStartTime?: string | null
  planEndTime?: string | null
  remainingDays?: string
  totalDays?: string
  totalTraffic?: string
  remainingTraffic?: string
  subOrderId?: string
  channelSubOrderId?: string
}
interface PlanOrder {
  orderId?: string
  channelOrderId?: string
  subOrderList?: PlanSub[]
}
interface Row {
  iccid: string
  card: { type?: string; status?: string; expirationDate?: string; usageCount?: string } | null
  plan: { ok: boolean; orders?: PlanOrder[]; error?: string }
}

const CARD_STATUS: Record<string, string> = { '0': '載體有效', '1': '載體無效', '2': '已停用' }
const PLAN_STATUS: Record<string, string> = { '0': '未使用', '1': '使用中', '2': '已用完', '3': '已過期', '4': '已退訂' }

function fmtTraffic(s?: string) {
  if (s == null || s === '') return '—'
  const n = Number(s)
  if (isNaN(n)) return s
  if (n < 0) return '不限'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' GB'
  return n + ' MB'
}

export default function CardsLookupPage() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null) // 正在送 F017 的 channelSubOrderId

  async function handleLookup() {
    const iccids = [...new Set(text.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean))]
    if (iccids.length === 0) { alert('請輸入 ICCID'); return }
    if (iccids.length > 200) { alert('單次最多 200 筆，請分批查詢'); return }
    setLoading(true); setError(null); setRows([])
    try {
      const res = await fetch('/api/admin/cards-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iccids }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || '查詢失敗'); return }
      setRows(d.rows || [])
    } finally { setLoading(false) }
  }

  async function handleAfterSale(iccid: string, sub: PlanSub, order: PlanOrder) {
    const reason = prompt('請輸入售後原因代碼：\n20 = 無理由退訂\n29 = eSIM 未下載退訂')
    if (reason === null) return
    if (!reason.trim()) { alert('請填寫原因代碼'); return }
    if (!confirm(`確定對 ICCID ${iccid} 申請售後退卡？\n子單：${sub.channelSubOrderId}\n原因：${reason}`)) return

    setWorking(sub.channelSubOrderId || iccid)
    try {
      const res = await fetch('/api/admin/cards-lookup/aftersale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iccid,
          channelSubOrderId: sub.channelSubOrderId,
          channelOrderId: order.channelOrderId || '',
          orderId: order.orderId || '',
          reason: reason.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) { alert('售後申請失敗：' + (d.error || '未知錯誤')); return }
      alert(`售後申請成功\n售後單號：${d.afterSaleId}`)
    } finally { setWorking(null) }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">卡片查詢退卡</h1>
      <p className="mt-1 text-sm text-gray-500">貼入多筆 ICCID（每行一個或以逗號 / 空白分隔），一次查 F010 卡狀態 + F012 套餐使用，可直接申請 F017 售後</p>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="22107859520&#10;22107859511&#10;22107859512"
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
        <div className="mt-2 flex items-center gap-3">
          <button onClick={handleLookup} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? '查詢中…' : '查詢'}
          </button>
          {rows.length > 0 && <span className="text-xs text-gray-500">已查詢 {rows.length} 筆</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">ICCID</th>
                <th className="px-3 py-2 text-left border-b">載體狀態</th>
                <th className="px-3 py-2 text-left border-b">截止日</th>
                <th className="px-3 py-2 text-left border-b">套餐 (skuName ×copies)</th>
                <th className="px-3 py-2 text-left border-b">套餐狀態</th>
                <th className="px-3 py-2 text-left border-b">激活時間</th>
                <th className="px-3 py-2 text-left border-b">結束時間</th>
                <th className="px-3 py-2 text-left border-b">剩餘天數</th>
                <th className="px-3 py-2 text-left border-b">剩餘流量</th>
                <th className="px-3 py-2 text-left border-b">BC 訂單</th>
                <th className="px-3 py-2 text-left border-b">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap(r => {
                const subs: { sub: PlanSub; order: PlanOrder }[] = []
                if (r.plan.ok) {
                  for (const o of r.plan.orders || []) {
                    for (const s of o.subOrderList || []) subs.push({ sub: s, order: o })
                  }
                }
                if (subs.length === 0) {
                  return [(
                    <tr key={r.iccid} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono">{r.iccid}</td>
                      <td className="px-3 py-2">{CARD_STATUS[r.card?.status || ''] || r.card?.status || '—'}</td>
                      <td className="px-3 py-2">{r.card?.expirationDate || '—'}</td>
                      <td className="px-3 py-2 text-gray-400" colSpan={6}>{r.plan.ok ? '無套餐記錄' : <span className="text-red-600">F012 失敗：{r.plan.error}</span>}</td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  )]
                }
                return subs.map(({ sub, order }, i) => (
                  <tr key={`${r.iccid}-${i}`} className="border-b hover:bg-gray-50">
                    {i === 0 && (
                      <>
                        <td className="px-3 py-2 font-mono align-top" rowSpan={subs.length}>{r.iccid}</td>
                        <td className="px-3 py-2 align-top" rowSpan={subs.length}>{CARD_STATUS[r.card?.status || ''] || r.card?.status || '—'}</td>
                        <td className="px-3 py-2 align-top" rowSpan={subs.length}>{r.card?.expirationDate || '—'}</td>
                      </>
                    )}
                    <td className="px-3 py-2">{sub.skuName || '—'}{sub.copies ? ` ×${sub.copies}` : ''}</td>
                    <td className="px-3 py-2">{PLAN_STATUS[sub.planStatus || ''] || sub.planStatus || '—'}</td>
                    <td className="px-3 py-2">{sub.planStartTime || '—'}</td>
                    <td className="px-3 py-2">{sub.planEndTime || '—'}</td>
                    <td className="px-3 py-2">{sub.remainingDays != null ? `${sub.remainingDays}/${sub.totalDays || '—'}` : '—'}</td>
                    <td className="px-3 py-2">{fmtTraffic(sub.remainingTraffic)}</td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[10px] text-gray-600">{order.orderId || '—'}</div>
                      <div className="font-mono text-[10px] text-gray-400">{sub.channelSubOrderId || '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleAfterSale(r.iccid, sub, order)}
                        disabled={working === (sub.channelSubOrderId || r.iccid)}
                        className="px-2 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                        {working === (sub.channelSubOrderId || r.iccid) ? '送出中…' : '申請售後'}
                      </button>
                    </td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
