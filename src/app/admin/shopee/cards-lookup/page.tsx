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
  const [onlyUnused, setOnlyUnused] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set()) // key = `${iccid}|${channelSubOrderId}`
  const [batchWorking, setBatchWorking] = useState(false)

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

  // 把目前可顯示的 row（含過濾後）全部攤平 — 用於全選
  function getVisibleRows() {
    const arr: { iccid: string; sub: PlanSub; order: PlanOrder; key: string }[] = []
    for (const r of rows) {
      if (!r.plan.ok) continue
      for (const o of r.plan.orders || []) {
        for (const s of o.subOrderList || []) {
          if (onlyUnused && (s.planStatus || '') !== '0') continue
          arr.push({ iccid: r.iccid, sub: s, order: o, key: `${r.iccid}|${s.channelSubOrderId || ''}` })
        }
      }
    }
    return arr
  }

  function toggleSelect(key: string) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleSelectAll() {
    const visible = getVisibleRows()
    const allKeys = visible.map(v => v.key)
    const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k))
    setSelected(allSelected ? new Set() : new Set(allKeys))
  }

  async function handleBatchAfterSale() {
    const visible = getVisibleRows()
    const picked = visible.filter(v => selected.has(v.key))
    if (picked.length === 0) { alert('請先勾選'); return }
    const reason = prompt(`對 ${picked.length} 張卡批次申請售後\n請輸入原因代碼：\n20 = 無理由退訂\n29 = eSIM 未下載退訂`)
    if (reason === null) return
    if (!reason.trim()) { alert('請填寫原因代碼'); return }
    if (!confirm(`確定對 ${picked.length} 張卡申請售後？同 channelOrderId 的會合併到同一張售後單，由 BC 自動拆。`)) return

    setBatchWorking(true)
    try {
      const res = await fetch('/api/admin/cards-lookup/aftersale-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          items: picked.map(p => ({
            iccid: p.iccid,
            channelSubOrderId: p.sub.channelSubOrderId,
            channelOrderId: p.order.channelOrderId,
            orderId: p.order.orderId,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) { alert('批次售後失敗：' + (d.error || '未知錯誤')); return }
      const ok = (d.results || []).filter((r: { ok: boolean }) => r.ok).length
      const fail = (d.results || []).filter((r: { ok: boolean }) => !r.ok).length
      const skipped = (d.failed || []).length
      const detail = (d.results || []).map((r: { ok: boolean; channelOrderId: string; iccids: string[]; afterSaleId?: string; error?: string }) =>
        r.ok
          ? `✅ ${r.channelOrderId} (${r.iccids.length} 張) → ${r.afterSaleId}`
          : `❌ ${r.channelOrderId} (${r.iccids.length} 張): ${r.error}`
      ).join('\n')
      alert(`批次完成\n成功 ${ok} 組 / 失敗 ${fail} 組${skipped > 0 ? ` / 跳過 ${skipped} 張（缺 channelOrderId）` : ''}\n\n${detail}`)
      setSelected(new Set())
    } finally { setBatchWorking(false) }
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
          <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={onlyUnused} onChange={e => setOnlyUnused(e.target.checked)} />
            只顯示「未使用」
          </label>
          {selected.size > 0 && (
            <button onClick={handleBatchAfterSale} disabled={batchWorking}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-60">
              {batchWorking ? '送出中…' : `批次申請售後 (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">
                  {(() => {
                    const visible = getVisibleRows()
                    const allSelected = visible.length > 0 && visible.every(v => selected.has(v.key))
                    return <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  })()}
                </th>
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
                    for (const s of o.subOrderList || []) {
                      if (onlyUnused && (s.planStatus || '') !== '0') continue
                      subs.push({ sub: s, order: o })
                    }
                  }
                }
                // 只顯示未使用 → 無未使用套餐的整列就不顯示
                if (subs.length === 0) {
                  if (onlyUnused) return []
                  return [(
                    <tr key={r.iccid} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 font-mono">{r.iccid}</td>
                      <td className="px-3 py-2">{CARD_STATUS[r.card?.status || ''] || r.card?.status || '—'}</td>
                      <td className="px-3 py-2">{r.card?.expirationDate || '—'}</td>
                      <td className="px-3 py-2 text-gray-400" colSpan={6}>{r.plan.ok ? '無套餐記錄' : <span className="text-red-600">F012 失敗：{r.plan.error}</span>}</td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  )]
                }
                return subs.map(({ sub, order }, i) => {
                  const key = `${r.iccid}|${sub.channelSubOrderId || ''}`
                  return (
                  <tr key={`${r.iccid}-${i}`} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} />
                    </td>
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
                  )
                })
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
