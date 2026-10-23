'use client'

import { useState } from 'react'
import { Search, Smartphone, Clock, Wifi, BarChart3, Package } from 'lucide-react'

interface PlanCountry { name?: string; apn?: string; operator?: string; apnType?: string }
interface PlanSub {
  skuName?: string; copies?: string; planStatus?: string; apn?: string
  planStartTime?: string | null; planEndTime?: string | null
  remainingDays?: string; totalDays?: string; totalTraffic?: string; remainingTraffic?: string
  highFlowSize?: string; limitFlowSpeed?: string; country?: PlanCountry[]
}
interface PlanOrder { subOrderList?: PlanSub[] }
interface Row {
  iccid: string
  card: { type?: string; status?: string; expirationDate?: string; usageCount?: string } | null
  plan: { ok: boolean; orders?: PlanOrder[]; error?: string }
}
interface TrafficRow { usedDate: string; country: string; usedAmountKB: number }

const CARD_STATUS: Record<string, string> = { '0': '已開卡', '1': '使用中', '2': '已用盡', '3': '失效', '4': '續期', '5': '報廢' }
const CARD_STATUS_COLOR: Record<string, string> = { '0': 'bg-blue-50 text-blue-600', '1': 'bg-green-50 text-green-600', '2': 'bg-gray-100 text-gray-500', '3': 'bg-red-50 text-red-500', '4': 'bg-amber-50 text-amber-600', '5': 'bg-gray-100 text-gray-500' }
const PLAN_STATUS: Record<string, string> = { '0': '未使用', '1': '正在使用', '2': '使用結束', '3': '已取消' }
const PLAN_STATUS_COLOR: Record<string, string> = { '0': 'bg-teal-50 text-teal-600', '1': 'bg-green-50 text-green-600', '2': 'bg-gray-100 text-gray-500', '3': 'bg-gray-100 text-gray-400' }

function fmtTraffic(s?: string) {
  if (s == null || s === '') return '—'
  const n = Number(s)
  if (isNaN(n)) return s
  if (n < 0) return '不限'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' GB'
  return n + ' MB'
}
function fmtSpeed(s?: string) {
  if (s == null || s === '') return '—'
  const n = Number(s)
  if (isNaN(n)) return s
  if (n >= 1024) { const m = n / 1024; return (m % 1 === 0 ? m : m.toFixed(1)) + ' Mbps' }
  return n + ' kbps'
}
function fmtKB(kb: number) {
  if (!kb) return '0'
  if (kb >= 1048576) return (kb / 1048576).toFixed(2) + ' GB'
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB'
  return Math.round(kb) + ' KB'
}
function taipeiToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()) }

export default function MobileCardsPage() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [queried, setQueried] = useState(false)

  async function query() {
    const iccids = [...new Set(text.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean))]
    if (iccids.length === 0) { setErr('請輸入至少一個卡號'); return }
    if (iccids.length > 200) { setErr('一次最多 200 筆，請分批'); return }
    setLoading(true); setErr(''); setQueried(true)
    try {
      const res = await fetch('/api/admin/cards-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iccids }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d) { setErr(d?.error || '查詢失敗'); setRows([]); return }
      setRows(d.rows || [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-5">
      <h1 className="text-xl font-bold text-gray-800">卡片查詢</h1>
      <p className="text-xs text-gray-400 mt-0.5">輸入 ICCID（可多筆，換行或空白分隔）查卡狀態 / 套餐使用</p>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
        placeholder={'22108439765\n22108439767'}
        className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono resize-y" />
      <button onClick={query} disabled={loading}
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-3 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 disabled:opacity-50">
        <Search className="w-4 h-4" />{loading ? '查詢中…' : '查詢'}
      </button>

      {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

      {queried && !loading && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-gray-400">共 {rows.length} 筆</div>
          {rows.map(r => <CardResult key={r.iccid} row={r} />)}
          {rows.length === 0 && <div className="text-center text-gray-400 py-8">查無資料</div>}
        </div>
      )}
    </div>
  )
}

function CardResult({ row: r }: { row: Row }) {
  const subs: PlanSub[] = r.plan?.ok ? (r.plan.orders || []).flatMap(o => o.subOrderList || []) : []
  const [open, setOpen] = useState<'usage' | 'traffic' | null>(null)
  const [traffic, setTraffic] = useState<TrafficRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  function dateRange(): [string, string] {
    const starts: string[] = [], ends: string[] = []
    for (const s of subs) { if (s.planStartTime) starts.push(s.planStartTime.slice(0, 10)); if (s.planEndTime) ends.push(s.planEndTime.slice(0, 10)) }
    const today = taipeiToday()
    const d30 = (() => { const dt = new Date(); dt.setDate(dt.getDate() - 30); return dt.toISOString().slice(0, 10) })()
    const begin = starts.length ? starts.sort()[0] : d30
    let end = ends.length ? ends.sort().slice(-1)[0] : today
    if (end > today) end = today
    return [begin, end]
  }

  async function toggle(type: 'usage' | 'traffic') {
    if (open === type) { setOpen(null); return }
    setOpen(type)
    // 套餐資訊（含 APN）直接用初次 F012 查到的資料，不另打 API
    if (type !== 'traffic') return
    if (traffic !== null) return
    setBusy(true)
    try {
      const [b, e] = dateRange()
      const d = await fetch(`/api/admin/cards?action=traffic&iccid=${encodeURIComponent(r.iccid)}&beginDate=${b}&endDate=${e}`).then(x => x.json()).catch(() => null)
      setTraffic(d?.traffic || [])
    } finally { setBusy(false) }
  }

  const trafficTotal = (traffic || []).reduce((a, t) => a + (t.usedAmountKB || 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-gray-800">{r.iccid}</span>
        {r.card?.status != null
          ? <span className={`text-xs px-2 py-0.5 rounded-full ${CARD_STATUS_COLOR[r.card.status] || 'bg-gray-100 text-gray-500'}`}>{CARD_STATUS[r.card.status] || r.card.status}</span>
          : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">查無卡</span>}
      </div>
      {r.card?.expirationDate && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500"><Clock className="w-3.5 h-3.5" />有效期截止：{r.card.expirationDate}</div>
      )}

      {subs.length > 0 ? (
        <div className="mt-3 space-y-2">
          {subs.map((s, i) => (
            <div key={i} className="rounded-xl bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-gray-700 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-gray-400 shrink-0" />{s.skuName || '—'}{s.copies ? ` ×${s.copies}` : ''}</div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${PLAN_STATUS_COLOR[s.planStatus || ''] || 'bg-gray-100 text-gray-500'}`}>{PLAN_STATUS[s.planStatus || ''] || '—'}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-gray-500">
                <div className="flex items-center gap-1"><Clock className="w-3 h-3" />剩餘 {s.remainingDays ?? '—'} 天</div>
                <div className="flex items-center gap-1"><Wifi className="w-3 h-3" />剩餘 {fmtTraffic(s.remainingTraffic)}</div>
                <div>激活：{s.planStartTime || '—'}</div>
                <div>結束：{s.planEndTime || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs text-gray-400">{r.plan?.ok ? '無套餐記錄' : `套餐查詢失敗${r.plan?.error ? '：' + r.plan.error : ''}`}</div>
      )}

      {/* 兩個查詢鍵 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => toggle('traffic')}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-sm border ${open === 'traffic' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-200 text-gray-600'}`}>
          <BarChart3 className="w-4 h-4" />查詢用量
        </button>
        <button onClick={() => toggle('usage')}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-sm border ${open === 'usage' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-200 text-gray-600'}`}>
          <Package className="w-4 h-4" />查詢套餐資訊
        </button>
      </div>

      {/* 展開區 */}
      {open === 'traffic' && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {busy ? <div className="text-xs text-gray-400 py-2">查詢中…</div> : (traffic && traffic.length > 0) ? (
            <div>
              <div className="text-xs text-gray-500 mb-1.5">每日用量（合計 <span className="font-medium text-gray-700">{fmtKB(trafficTotal)}</span>）</div>
              <div className="space-y-1">
                {traffic.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{t.usedDate}</span>
                    <span className="text-gray-500 flex-1 px-2 truncate">{t.country || '—'}</span>
                    <span className="font-medium text-gray-700">{fmtKB(t.usedAmountKB)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-xs text-gray-400 py-1">查無日流量資料（套餐未使用或當期無用量）</div>}
        </div>
      )}

      {open === 'usage' && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {subs.length === 0 ? <div className="text-xs text-gray-400 py-1">查無套餐資訊</div> : (
            <div className="space-y-2">
              {subs.map((s, i) => (
                <div key={i} className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <div className="text-sm text-gray-800">{s.skuName || '—'}{s.copies ? ` ×${s.copies}` : ''}</div>
                  {/* 規格（上） */}
                  <div className="mt-2 space-y-0.5">
                    {s.limitFlowSpeed && <div>降速：{fmtSpeed(s.limitFlowSpeed)}</div>}
                    {s.highFlowSize && <div>高速額度：{fmtTraffic(s.highFlowSize)}</div>}
                    <div>天數：{s.remainingDays ?? '—'} / {s.totalDays ?? '—'} 天</div>
                    <div>流量：剩餘 {fmtTraffic(s.remainingTraffic)} / 總 {fmtTraffic(s.totalTraffic)}</div>
                  </div>
                  {/* 國家｜電信商｜APN 表（下） */}
                  {s.country && s.country.length > 0 && (
                    <table className="mt-2.5 w-full text-[11px]">
                      <thead>
                        <tr className="text-gray-400 text-left border-b border-gray-200">
                          <th className="py-1 font-medium">國家</th>
                          <th className="py-1 font-medium">電信商</th>
                          <th className="py-1 font-medium">APN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.country.map((c, j) => (
                          <tr key={j} className="border-b border-gray-100 last:border-0 align-top">
                            <td className="py-1 pr-2 text-gray-700">{c.name || '—'}</td>
                            <td className="py-1 pr-2 text-gray-500">{c.operator || '—'}</td>
                            <td className="py-1 font-mono text-teal-700 break-all">{c.apn || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
