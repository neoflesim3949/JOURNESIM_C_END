'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShoppingCart, CreditCard, DollarSign, Search } from 'lucide-react'

type Preset = 'today' | 'week' | 'month' | 'lastmonth' | 'custom'

// ── 日期工具（以台灣時區 Asia/Taipei 計算）─────────────────────────
function taipeiTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}
function ymd(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}
// 回傳 [from, to]（YYYY-MM-DD）
function rangeFor(p: Exclude<Preset, 'custom'>): [string, string] {
  const [y, m, d] = taipeiTodayStr().split('-').map(Number)
  const today = new Date(Date.UTC(y, m - 1, d))
  const todayStr = ymd(today)
  if (p === 'today') return [todayStr, todayStr]
  if (p === 'week') {
    const dow = today.getUTCDay()            // 0=日..6=六
    const offset = (dow + 6) % 7              // 到本週一的天數
    const mon = new Date(today); mon.setUTCDate(today.getUTCDate() - offset)
    return [ymd(mon), todayStr]
  }
  if (p === 'month') {
    return [ymd(new Date(Date.UTC(y, m - 1, 1))), todayStr]
  }
  // lastmonth：上個月 1 號 ~ 上個月最後一天
  const firstLast = new Date(Date.UTC(y, m - 2, 1))
  const lastLast = new Date(Date.UTC(y, m - 1, 0))
  return [ymd(firstLast), ymd(lastLast)]
}

const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'today', label: '本日' },
  { key: 'week', label: '本週' },
  { key: 'month', label: '本月' },
  { key: 'lastmonth', label: '上月' },
]

interface Stats { orders: number; cards: number; revenue: number }

export default function MobileShopeeDashboard() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState<Preset>('today')
  const [data, setData] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const query = useCallback(async (f: string, t: string) => {
    if (!f || !t) return
    setLoading(true); setErr('')
    try {
      const res = await fetch(`/api/admin/shopee/dashboard?from=${f}&to=${t}`)
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.settled) { setErr(d?.error || '查詢失敗'); setData(null); return }
      // 排除「不成立」已由 API 處理；這裡把「已結算＋未結算」加總（已回填是未結算的子集，不另加）
      setData({
        orders: (d.settled.order_count || 0) + (d.unsettled.order_count || 0),
        cards: (d.settled.card_count || 0) + (d.unsettled.card_count || 0),
        revenue: (d.settled.total_revenue || 0) + (d.unsettled.total_revenue || 0),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  function applyPreset(p: Exclude<Preset, 'custom'>) {
    const [f, t] = rangeFor(p)
    setFrom(f); setTo(t); setPreset(p)
    query(f, t)
  }

  // 進頁預設「本日」
  useEffect(() => { applyPreset('today') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const cards = [
    { label: '訂單數', value: data ? data.orders.toLocaleString() : '—', unit: '筆', icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '卡數', value: data ? data.cards.toLocaleString() : '—', unit: '張', icon: CreditCard, color: 'text-cyan-600 bg-cyan-50' },
    { label: '銷售額', value: data ? `NT$ ${data.revenue.toLocaleString()}` : '—', unit: '', icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
  ]

  return (
    <div className="max-w-md mx-auto px-4 py-5">
      <h1 className="text-xl font-bold text-gray-800">蝦皮銷售</h1>
      <p className="text-xs text-gray-400 mt-0.5">已排除「不成立」等無效訂單</p>

      {/* 快捷區間 */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => applyPreset(p.key)}
            className={`py-2 rounded-lg text-sm font-medium transition ${preset === p.key ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* 自訂日期區間 + 查詢 */}
      <div className="mt-3 flex items-center gap-2">
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset('custom') }}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white" />
        <span className="text-gray-300">~</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset('custom') }}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white" />
        <button onClick={() => query(from, to)} disabled={loading || !from || !to}
          className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-40 shrink-0">
          <Search className="w-4 h-4" />{loading ? '…' : '查詢'}
        </button>
      </div>

      {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

      {/* KPI 卡 */}
      <div className="mt-5 space-y-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">{c.label}</div>
              <div className="mt-1 text-3xl font-bold text-gray-800">
                {loading ? <span className="text-gray-300">…</span> : c.value}
                {c.unit && <span className="ml-1 text-base font-medium text-gray-400">{c.unit}</span>}
              </div>
            </div>
            <div className={`p-3 rounded-xl ${c.color}`}><c.icon className="w-6 h-6" /></div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] text-gray-400">
        {from && to ? `${from} ~ ${to}` : ''}
      </p>
    </div>
  )
}
