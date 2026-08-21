'use client'

import { useEffect, useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import DateRange from '@/components/admin/DateRange'

interface Dist { name: string; cards: number; settle: number }
interface MonthRow { month: string; cards: number; settle: number; refund: number; net: number; orders: number }
interface Data {
  summary: { cards: number; orders: number; settle: number; actual: number; refund: number; net: number }
  months: MonthRow[]
  products: Dist[]; channels: Dist[]; operators: Dist[]; types: Dist[]
}

// 多序列折線圖（SVG 自畫）
function LineChart({ months }: { months: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (months.length === 0) return <p className="text-sm text-gray-400">無資料</p>
  const W = 900, H = 260, padL = 56, padR = 16, padT = 16, padB = 34
  const labelStep = Math.max(1, Math.ceil(months.length / 16))
  const iw = W - padL - padR, ih = H - padT - padB
  const series = [
    { key: 'settle' as const, name: '採購', color: '#0d9488' },
    { key: 'refund' as const, name: '售後', color: '#e11d48' },
    { key: 'net' as const, name: '淨額', color: '#2563eb' },
  ]
  const maxV = Math.max(1, ...months.flatMap(m => [m.settle, m.refund, m.net]))
  const minV = Math.min(0, ...months.map(m => m.net))
  const x = (i: number) => padL + (months.length === 1 ? iw / 2 : (i / (months.length - 1)) * iw)
  const y = (v: number) => padT + ih - ((v - minV) / (maxV - minV || 1)) * ih
  const money = (n: number) => '$' + Math.round(n).toLocaleString()
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
              points={months.map((m, i) => `${x(i)},${y(m[s.key])}`).join(' ')} />
          ))}
          {series.map(s => months.map((m, i) => (
            <circle key={s.key + i} cx={x(i)} cy={y(m[s.key])} r={hover === i ? 3.5 : 2} fill={s.color} />
          )))}
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
                <text x={left + 9} y={top + 32} fontSize="10" fill="#0d9488">採購 {money(m.settle)}</text>
                <text x={left + 9} y={top + 46} fontSize="10" fill="#e11d48">售後 {money(m.refund)}</text>
                <text x={left + 9} y={top + 60} fontSize="10" fill="#2563eb">淨額 {money(m.net)}</text>
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
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  // 預設近一年
  const oneYearAgo = (() => { const t = new Date(); t.setFullYear(t.getFullYear() - 1); return t.toISOString().slice(0, 10) })()
  const [from, setFrom] = useState(oneYearAgo)
  const [to, setTo] = useState('')
  const [channel, setChannel] = useState('')
  const [operator, setOperator] = useState('')
  const [facets, setFacets] = useState<{ channels: string[]; operators: string[] }>({ channels: [], operators: [] })

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from); if (to) p.set('to', to); if (channel) p.set('channel', channel); if (operator) p.set('operator', operator)
    const res = await fetch(`/api/admin/stats/order-analysis?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  async function loadFacets() { const res = await fetch('/api/admin/stats/order-analysis?facets=1'); if (res.ok) setFacets(await res.json()) }
  useEffect(() => { load(); loadFacets() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const nt = (n: number) => n.toLocaleString()
  const money = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })

  function exportCsv() {
    if (!d) return
    const head = '商品,卡數,採購金額'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = d.products.map(r => [r.name, r.cards, r.settle].map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'order-analysis-products.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">訂單統計分析</h1>
          <p className="mt-1 text-sm text-gray-500">採購訂單彙總（來源：歷史採購訂單明細）· 金額為應結算(採購成本)加總</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={channel} onChange={e => setChannel(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部渠道</option>{facets.channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={operator} onChange={e => setOperator(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部操作員</option>{facets.operators.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="創建" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">訂單數</div><div className="mt-1 text-2xl font-bold">{nt(d.summary.orders)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">卡數（明細列）</div><div className="mt-1 text-2xl font-bold">{nt(d.summary.cards)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">採購金額（應結算）</div><div className="mt-1 text-2xl font-bold text-teal-600">{money(d.summary.settle)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">售後退款</div><div className="mt-1 text-2xl font-bold text-rose-600">{money(d.summary.refund)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">淨額（採購−售後）</div><div className="mt-1 text-2xl font-bold text-blue-600">{money(d.summary.net)}</div></div>
          </div>

          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">採購 / 售後 / 淨額 月趨勢</h3>
            <LineChart months={d.months} />
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {([['渠道', d.channels, 'bg-violet-500'], ['操作員', d.operators, 'bg-indigo-500'], ['訂單類型', d.types, 'bg-amber-500']] as const).map(([title, list, color]) => {
              const mx = list.length ? Math.max(...list.map(x => x.settle)) : 1
              return (
                <div key={title} className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-2">{title}分佈</h3>
                  {list.length === 0 ? <p className="text-sm text-gray-400">無資料</p> : list.slice(0, 10).map(x => (
                    <div key={x.name} className="flex items-center gap-2 py-1">
                      <div className="w-24 text-xs text-gray-600 truncate" title={x.name}>{x.name}</div>
                      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden"><div className={`h-full ${color} rounded`} style={{ width: `${mx ? (x.settle / mx) * 100 : 0}%` }} /></div>
                      <div className="w-24 text-right text-xs font-mono">{money(x.settle)}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">商品採購排行（前 30）</h3>
              <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700"><Download className="w-3.5 h-3.5" /> CSV</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs"><tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">商品</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">採購金額</th>
                <th className="px-3 py-2 text-right border-b">平均/卡</th>
              </tr></thead>
              <tbody>
                {d.products.map((p, i) => (
                  <tr key={p.name} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={p.name}>{p.name}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(p.cards)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{money(p.settle)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(p.cards ? p.settle / p.cards : 0)}</td>
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
