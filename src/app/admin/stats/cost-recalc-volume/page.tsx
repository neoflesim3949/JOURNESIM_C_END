'use client'

import { useEffect, useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import DateRange from '@/components/admin/DateRange'

interface FamRow {
  family: string; region: string; cards: number; gbs: string
  old_cost: number; new_cost: number; savings: number; savings_pct: number
  eligible: boolean; base_found: boolean; base_sku: string; base_name: string
  used_gb: number; mb_price: number; no_usage: number
}
interface MonthRow { ym: string; old: number; nw: number; savings: number }
interface Data {
  summary: { cards: number; pending_cards: number; pending_old: number; pending_no_base: number; no_usage_cards: number; old_cost: number; new_cost: number; savings: number; savings_pct: number }
  months: MonthRow[]
  families: FamRow[]
  params: { mode: string }
}

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

function LogicNote({ items }: { items: string[] }) {
  return (
    <details className="mt-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
      <summary className="cursor-pointer px-3 py-2 font-medium text-blue-700">計算邏輯說明</summary>
      <ul className="list-disc px-8 pb-3 space-y-1">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </details>
  )
}

function TrendChart({ months }: { months: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 900, H = 260, padL = 64, padR = 16, padT = 16, padB = 34
  const iw = W - padL - padR, ih = H - padT - padB
  const series = [
    { key: 'old' as const, name: '原成本', color: '#e11d48' },
    { key: 'nw' as const, name: '重算後', color: '#0d9488' },
    { key: 'savings' as const, name: '節省', color: '#2563eb' },
  ]
  const vals = months.flatMap(m => [m.old, m.nw, m.savings])
  const maxV = Math.max(1, ...vals), minV = Math.min(0, ...vals)
  const x = (i: number) => months.length <= 1 ? padL + iw / 2 : padL + (i / (months.length - 1)) * iw
  const y = (v: number) => padT + ih - ((v - minV) / (maxV - minV || 1)) * ih
  const labelStep = Math.ceil(months.length / 12)
  const gy = Array.from({ length: 5 }, (_, i) => minV + (i / 4) * (maxV - minV))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
      {gy.map((v, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#eee" /><text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#999">{yen(v)}</text></g>))}
      {months.map((m, i) => i % labelStep === 0 && (<text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="9" fill="#999">{m.ym.slice(2)}</text>))}
      {series.map(s => (<polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.8" points={months.map((m, i) => `${x(i)},${y(m[s.key])}`).join(' ')} />))}
      {series.map(s => months.map((m, i) => (<circle key={s.key + i} cx={x(i)} cy={y(m[s.key])} r={hover === i ? 3.5 : 2} fill={s.color} />)))}
      {months.map((m, i) => (<rect key={i} x={x(i) - iw / months.length / 2} y={padT} width={iw / months.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />))}
      {hover != null && (() => {
        const m = months[hover]; const bx = x(hover); const flip = bx > W - padR - 140; const tx = flip ? bx - 138 : bx + 8
        return (
          <g pointerEvents="none">
            <line x1={bx} x2={bx} y1={padT} y2={padT + ih} stroke="#cbd5e1" strokeDasharray="3 3" />
            <rect x={tx} y={padT + 6} width={130} height={80} rx="6" fill="white" stroke="#e5e7eb" />
            <text x={tx + 8} y={padT + 22} fontSize="10" fontWeight="bold" fill="#334155">{m.ym}</text>
            {series.map((s, j) => (<text key={s.key} x={tx + 8} y={padT + 38 + j * 15} fontSize="10" fill={s.color}>{s.name}：{yen(m[s.key])}</text>))}
          </g>
        )
      })()}
    </svg>
  )
}

export default function CostRecalcVolumePage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [excludeLegacy, setExcludeLegacy] = useState(true)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    p.set('mode', 'volume')
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (excludeLegacy) p.set('exclude_legacy', '1')
    const res = await fetch(`/api/admin/stats/cost-recalc?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  function exportCsv() {
    if (!d) return
    const head = '家族,地區,原始每日,卡數,可重算,總用量GB,MB單價,原成本,重算後,節省,節省%,1GB基準SKU,無用量卡'
    const body = d.families.map(f => [f.family, f.region, f.gbs, f.cards, f.eligible ? 'Y' : 'N', f.used_gb, f.mb_price, f.old_cost, f.new_cost, f.savings, f.savings_pct, f.base_sku, f.no_usage].map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cost-recalc-volume.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const s = d?.summary
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">成本重算（依流量均價）</h1>
          <p className="mt-1 text-sm text-gray-500">用 1GB 基礎方案「所有天數階梯的總價÷總量」算出平均每GB價，家族內所有品項一律「每GB價 × 實際總用量」計價；逐原始商品(SKU)呈現（基礎以下不動；¥ CNY）</p>
        </div>
        <button onClick={exportCsv} disabled={!d?.families.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"><Download className="w-4 h-4" /> 匯出 CSV</button>
      </div>

      <LogicNote items={[
        '納入範圍：與「成本重算（依方案）」相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。基礎方案以下（<1GB）不動。',
        '平均每GB價：取該組 1GB 基礎方案「實際有的所有天數階梯」，每GB價＝Σ(各階梯結算價) ÷ Σ(各階梯GB，N天=N GB)。含長天數的量大折扣，一支基礎方案一個固定值。',
        '重算後成本＝平均每GB價 × 該卡實際總用量(GB)；不分天數、不分原本幾GB或吃到飽，同家族一律套同一個每GB價。用量取自 card_usage_daily（F023）。',
        '呈現：每個原始商品(SKU)一列；同家族的 SKU 都套用該家族基礎方案的每GB價（MB單價＝每GB價÷1024）。',
        '舊成本＝原方案結算價 ×（依份數對應 tier，缺則 cost_price × 份數）。節省＝舊成本 − 重算後（可能為負＝純用量反而較貴）。沒有 1GB 基準者列「待處理」不計入。',
      ]} />

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="下單月份" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={excludeLegacy} onChange={e => setExcludeLegacy(e.target.checked)} /> 排除舊SIMPOMATION
        </label>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">重算</button>
      </div>

      {loading || !d || !s ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 計算中...</p> : (
        <>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">納入卡數</div><div className="mt-1 text-2xl font-bold">{s.cards.toLocaleString()}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">原採購成本</div><div className="mt-1 text-2xl font-bold text-rose-600">{yen(s.old_cost)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">重算後成本（純用量）</div><div className="mt-1 text-2xl font-bold text-teal-600">{yen(s.new_cost)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">預估{s.savings >= 0 ? '節省' : '增加'}</div><div className={`mt-1 text-2xl font-bold ${s.savings >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{yen(Math.abs(s.savings))}</div><div className="text-[11px] text-gray-400 mt-0.5">{s.savings >= 0 ? '↓' : '↑'} {Math.abs(s.savings_pct)}%</div></div>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            <span className={s.pending_cards ? 'text-amber-600' : ''}>待處理卡（無基準）：{s.pending_cards.toLocaleString()}（原成本 {yen(s.pending_old)}）</span>
            <span className={s.no_usage_cards ? 'text-amber-600' : ''}>無逐日用量卡：{s.no_usage_cards.toLocaleString()}</span>
          </div>

          {d.months.length > 0 && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-2">成本趨勢（依下單月份）</h3>
              <TrendChart months={d.months} />
            </div>
          )}

          <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-xs">
                <tr>
                  {['原始商品(SKU)', '每日', '卡數', '總用量(GB)', 'MB單價', '原成本', '重算後(純用量)', '節省', '節省%', '1GB基準'].map(h => <th key={h} className="px-3 py-2 text-left border-b font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.families.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">無資料</td></tr>
                ) : d.families.map((f, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${f.eligible ? '' : 'bg-amber-50/40'}`}>
                    <td className="px-3 py-2 max-w-xs truncate" title={f.family}>{f.family}{!f.eligible && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">待處理</span>}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{f.gbs}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.cards.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{f.eligible ? f.used_gb.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{f.eligible ? `¥${f.mb_price}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-rose-600">{yen(f.old_cost)}</td>
                    <td className="px-3 py-2 text-right font-mono text-teal-600">{f.eligible ? yen(f.new_cost) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${f.savings >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{f.eligible ? yen(f.savings) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono ${f.eligible ? (f.savings_pct >= 0 ? 'text-blue-600' : 'text-rose-600') : 'text-gray-400'}`}>{f.eligible ? `${f.savings_pct}%` : '—'}</td>
                    <td className="px-3 py-2 text-xs">{f.base_found ? <span className="text-emerald-600" title={f.base_name}>✓ {f.base_sku.slice(0, 8)}…</span> : <span className="text-amber-600">缺基準</span>}</td>
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
