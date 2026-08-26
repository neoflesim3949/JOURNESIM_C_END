'use client'

import { useEffect, useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import DateRange from '@/components/admin/DateRange'

interface Dist { name: string; cards: number; settle: number }
interface MonthRow { month: string; cards: number; settle: number; refund: number; net: number; orders: number; refund_cnt: number; net_cnt: number; avg: number }
interface Data {
  summary: { cards: number; orders: number; settle: number; actual: number; refund: number; net: number; refund_cnt: number; net_cnt: number }
  months: MonthRow[]
  products: Dist[]; channels: Dist[]; operators: Dist[]; types: Dist[]
}
type Series = { key: keyof MonthRow; name: string; color: string }

// 多序列折線圖（SVG 自畫）：series 指定要畫哪三條，fmt 決定 Y 軸/tooltip 格式
function LineChart({ months, series, fmt }: { months: MonthRow[]; series: Series[]; fmt: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (months.length === 0) return <p className="text-sm text-gray-400">無資料</p>
  const W = 900, H = 268, padL = 56, padR = 16, padT = 26, padB = 34
  const labelStep = Math.max(1, Math.ceil(months.length / 16))
  const iw = W - padL - padR, ih = H - padT - padB
  const val = (m: MonthRow, k: keyof MonthRow) => Number(m[k]) || 0
  const maxV = Math.max(1, ...months.flatMap(m => series.map(s => val(m, s.key))))
  const minV = Math.min(0, ...months.flatMap(m => series.map(s => val(m, s.key))))
  const x = (i: number) => padL + (months.length === 1 ? iw / 2 : (i / (months.length - 1)) * iw)
  const y = (v: number) => padT + ih - ((v - minV) / (maxV - minV || 1)) * ih
  const money = fmt
  const gy = [0, 0.25, 0.5, 0.75, 1].map(t => minV + t * (maxV - minV))

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs">
        {series.map(s => <span key={s.key} className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: s.color }} />{s.name}</span>)}
      </div>
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} className="block">
          {gy.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#eee" />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#999">{money(v)}</text>
            </g>
          ))}
          {months.map((m, i) => (i % labelStep === 0 || i === months.length - 1) && (
            <text key={m.month} x={x(i)} y={H - 12} textAnchor="middle" fontSize="9" fill="#999">{m.month.slice(2)}</text>
          ))}
          {series.map(s => (
            <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2"
              points={months.map((m, i) => `${x(i)},${y(val(m, s.key))}`).join(' ')} />
          ))}
          {series.map(s => months.map((m, i) => (
            <circle key={s.key + i} cx={x(i)} cy={y(val(m, s.key))} r={hover === i ? 3.5 : 2} fill={s.color} />
          )))}
          {/* 淨（最後一條線）直接在點上標數字：離線遠一點＋白色描邊當底，避免被其他線遮擋或糊在一起 */}
          {(() => { const s = series[series.length - 1]; return months.map((m, i) => (
            <text key={'nl' + i} x={x(i)} y={y(val(m, s.key)) - 12} textAnchor="middle" fontSize="9" fontWeight={700} fill={s.color}
              stroke="#fff" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{fmt(val(m, s.key))}</text>
          )) })()}
          {months.map((m, i) => (
            <rect key={'h' + i} x={x(i) - iw / months.length / 2} y={padT} width={iw / months.length} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#ddd" strokeDasharray="3" />}
          {hover != null && (() => {
            const m = months[hover], bx = x(hover), bw = 128, bh = 82
            const left = bx + bw + 10 > W - padR ? bx - bw - 10 : bx + 10
            const top = padT + 2
            return (
              <g pointerEvents="none">
                <rect x={left} y={top} width={bw} height={bh} rx={5} fill="#fff" stroke="#ddd" opacity={0.97} />
                <text x={left + 9} y={top + 16} fontSize="10" fontWeight={700} fill="#333">{m.month}</text>
                {series.map((s, si) => (
                  <text key={s.key} x={left + 9} y={top + 32 + si * 14} fontSize="10" fill={s.color}>{s.name} {money(val(m, s.key))}</text>
                ))}
                <text x={left + 9} y={top + 74} fontSize="9" fill="#999">{m.cards.toLocaleString()} 張 · {m.orders.toLocaleString()} 單</text>
              </g>
            )
          })()}
        </svg>
      </div>
    </div>
  )
}

export default function OrderAnalysisPage() {
  const [all, setAll] = useState<{ channels: string[]; data: Record<string, Data> } | null>(null)
  const [channel, setChannel] = useState('全部')
  const [metric, setMetric] = useState<'amount' | 'count' | 'cards' | 'avg'>('amount')   // 金額(採購) / 訂單量 / 卡量 / 卡均單價
  const [loading, setLoading] = useState(true)
  // 預設近一年
  const oneYearAgo = (() => { const t = new Date(); t.setFullYear(t.getFullYear() - 1); return t.toISOString().slice(0, 10) })()
  const [from, setFrom] = useState(oneYearAgo)
  const [to, setTo] = useState('')
  const [operator, setOperator] = useState('')
  const [facets, setFacets] = useState<{ operators: string[] }>({ operators: [] })

  const d = all ? (all.data[channel] || all.data['全部']) : null

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from); if (to) p.set('to', to); if (operator) p.set('operator', operator)
    const res = await fetch(`/api/admin/stats/order-analysis?${p}`)
    if (res.ok) { const j = await res.json(); setAll(j); if (!j.channels.includes(channel)) setChannel('全部') }
    setLoading(false)
  }
  async function loadFacets() { const res = await fetch('/api/admin/stats/order-analysis?facets=1'); if (res.ok) setFacets(await res.json()) }
  useEffect(() => { load(); loadFacets() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const nt = (n: number) => n.toLocaleString()
  const money = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })

  const isMoney = metric === 'amount' || metric === 'avg'    // $ 單位（金額 / 卡均單價）
  const avgOf = (x: Dist) => x.cards ? x.settle / x.cards : 0 // 卡均單價 = 採購 ÷ 卡數
  const chartSeries: Series[] =
    metric === 'count' ? [{ key: 'orders', name: '訂單', color: '#0d9488' }, { key: 'refund_cnt', name: '售後', color: '#e11d48' }, { key: 'net_cnt', name: '淨單', color: '#2563eb' }]
    : metric === 'cards' ? [{ key: 'cards', name: '卡量', color: '#0d9488' }]
    : metric === 'avg' ? [{ key: 'avg', name: '卡均單價', color: '#7c3aed' }]
    : [{ key: 'settle', name: '採購', color: '#0d9488' }, { key: 'refund', name: '售後', color: '#e11d48' }, { key: 'net', name: '淨額', color: '#2563eb' }]
  const chartFmt = isMoney ? (n: number) => '$' + Math.round(n).toLocaleString() : (n: number) => Math.round(n).toLocaleString()
  const chartTitle = metric === 'count' ? '訂單 / 售後 / 淨單 月趨勢' : metric === 'cards' ? '卡量 月趨勢' : metric === 'avg' ? '卡均採購單價 月趨勢' : '採購 / 售後 / 淨額 月趨勢'
  // 分佈：金額→採購、訂單量/卡量→卡數、卡均→卡均單價
  const distVal = (x: Dist) => metric === 'avg' ? avgOf(x) : metric === 'amount' ? x.settle : x.cards
  const distFmt = (n: number) => isMoney ? money(n) : nt(Math.round(n))
  const sortDist = (list: Dist[]) => metric === 'amount' ? list
    : metric === 'avg' ? [...list].sort((a, b) => avgOf(b) - avgOf(a))
    : [...list].sort((a, b) => b.cards - a.cards)

  function exportCsv() {
    if (!d) return
    const head = metric === 'amount' ? '商品,卡數,採購金額' : metric === 'avg' ? '商品,卡數,卡均單價' : '商品,卡數'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = sortDist(d.products).map(r => (metric === 'amount' ? [r.name, r.cards, r.settle] : metric === 'avg' ? [r.name, r.cards, Math.round(avgOf(r) * 100) / 100] : [r.name, r.cards]).map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'order-analysis-products.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">訂單統計分析</h1>
          <p className="mt-1 text-sm text-gray-500">
            來源：歷史採購訂單明細 · {metric === 'amount' ? '金額視角：以「應結算採購成本」計（採購、售後、淨額）' : metric === 'count' ? '訂單量視角：以「單數／筆數」計（訂單、售後、淨單）' : metric === 'cards' ? '卡量視角：明細卡數月趨勢與分佈' : '卡均單價視角：採購金額 ÷ 卡數（每張卡平均採購成本）'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={operator} onChange={e => setOperator(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部操作員</option>{facets.operators.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="創建" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        {([['amount', '金額（採購）'], ['count', '訂單量'], ['cards', '卡量'], ['avg', '卡均單價']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setMetric(k)}
            className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap ${metric === k ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>

      {all && all.channels.length > 1 && (
        <div className="mt-3 inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1 max-w-full overflow-x-auto ml-0 lg:ml-3">
          {all.channels.map(c => (
            <button key={c} onClick={() => setChannel(c)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap ${channel === c ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
              {c === '—' ? '（未標渠道）' : c}
            </button>
          ))}
        </div>
      )}

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            {(() => {
              const s = d.summary
              const cards: { label: string; text: string; cls?: string }[] =
                metric === 'count' ? [
                  { label: '訂單數', text: nt(s.orders), cls: 'text-teal-600' },
                  { label: '卡數（明細列）', text: nt(s.cards) },
                  { label: '售後筆數', text: nt(s.refund_cnt), cls: 'text-rose-600' },
                  { label: '淨單（訂單−售後）', text: nt(s.net_cnt), cls: 'text-blue-600' },
                ] : metric === 'cards' ? [
                  { label: '訂單數', text: nt(s.orders) },
                  { label: '卡數（明細列）', text: nt(s.cards), cls: 'text-teal-600' },
                  { label: '平均每單卡數', text: s.orders ? (s.cards / s.orders).toFixed(2) : '0' },
                  { label: '採購金額（應結算）', text: money(s.settle) },
                ] : metric === 'avg' ? [
                  { label: '卡數（明細列）', text: nt(s.cards) },
                  { label: '採購金額（應結算）', text: money(s.settle) },
                  { label: '卡均採購單價', text: money(s.cards ? s.settle / s.cards : 0), cls: 'text-violet-600' },
                ] : [
                  { label: '訂單數', text: nt(s.orders) },
                  { label: '卡數（明細列）', text: nt(s.cards) },
                  { label: '採購金額（應結算）', text: money(s.settle), cls: 'text-teal-600' },
                  { label: '售後退款', text: money(s.refund), cls: 'text-rose-600' },
                  { label: '淨額（採購−售後）', text: money(s.net), cls: 'text-blue-600' },
                ]
              return cards.map(c => (
                <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-xs text-gray-500">{c.label}</div>
                  <div className={`mt-1 text-2xl font-bold ${c.cls || ''}`}>{c.text}</div>
                </div>
              ))
            })()}
          </div>

          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">{chartTitle}</h3>
            <LineChart months={d.months} series={chartSeries} fmt={chartFmt} />
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {([['渠道', d.channels, 'bg-violet-500'], ['操作員', d.operators, 'bg-indigo-500'], ['訂單類型', d.types, 'bg-amber-500']] as const).map(([title, rawList, color]) => {
              const list = sortDist(rawList)
              const mx = list.length ? Math.max(...list.map(distVal)) : 1
              return (
                <div key={title} className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-2">{title}分佈</h3>
                  {list.length === 0 ? <p className="text-sm text-gray-400">無資料</p> : list.slice(0, 10).map(x => (
                    <div key={x.name} className="flex items-center gap-2 py-1">
                      <div className="w-24 text-xs text-gray-600 truncate" title={x.name}>{x.name}</div>
                      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden"><div className={`h-full ${color} rounded`} style={{ width: `${mx ? (distVal(x) / mx) * 100 : 0}%` }} /></div>
                      <div className="w-24 text-right text-xs font-mono">{distFmt(distVal(x))}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{metric === 'amount' ? '商品採購排行（前 30）' : metric === 'avg' ? '商品卡均單價排行（前 30）' : metric === 'cards' ? '商品卡量排行（前 30）' : '商品訂單量排行（前 30）'}</h3>
              <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700"><Download className="w-3.5 h-3.5" /> CSV</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs"><tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">商品</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">{metric === 'amount' ? '採購金額' : metric === 'avg' ? '卡均單價' : '占比'}</th>
                <th className="px-3 py-2 text-right border-b">{metric === 'amount' ? '平均/卡' : '—'}</th>
              </tr></thead>
              <tbody>
                {sortDist(d.products).map((p, i) => (
                  <tr key={p.name} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={p.name}>{p.name}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{nt(p.cards)}</td>
                    <td className="px-3 py-2 text-right font-mono">{metric === 'amount' ? money(p.settle) : metric === 'avg' ? money(avgOf(p)) : (d.summary.cards ? Math.round((p.cards / d.summary.cards) * 1000) / 10 + '%' : '0%')}</td>
                    <td className="px-3 py-2 text-right font-mono">{metric === 'amount' ? money(p.cards ? p.settle / p.cards : 0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
