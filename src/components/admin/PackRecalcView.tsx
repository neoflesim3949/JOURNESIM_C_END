'use client'

import { useEffect, useState } from 'react'
import { Loader2, Download, RefreshCw, Globe } from 'lucide-react'
import DateRange from '@/components/admin/DateRange'

interface FamRow {
  family: string; region: string; cards: number; gbs: string
  old_cost: number; new_cost: number; base_cost: number; accel_cost: number
  savings: number; savings_pct: number; packs: number; over_days: number
  eligible: boolean; base_found: boolean; base_sku: string; base_name: string
  accel_price: number | null; accel_source: string; no_usage: number
}
interface MonthRow { ym: string; old: number; nw: number; savings: number }
interface Data {
  summary: { cards: number; pending_cards: number; pending_old: number; pending_no_base: number; pending_no_accel: number; no_usage_cards: number; old_cost: number; new_cost: number; base_cost: number; accel_cost: number; savings: number; savings_pct: number; total_packs: number }
  months: MonthRow[]
  families: FamRow[]
  params: { accel_priced: number }
}

const yen = (n: number) => '¥' + (Math.round(n)).toLocaleString()

function LogicNote({ items }: { items: string[] }) {
  return (
    <details className="mt-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
      <summary className="cursor-pointer px-3 py-2 font-medium text-blue-700">計算邏輯說明</summary>
      <ul className="list-disc px-8 pb-3 space-y-1">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </details>
  )
}

// 成本趨勢折線圖（舊/新/節省），游標旁顯示數字
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
      {gy.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#eee" />
          <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#999">{yen(v)}</text>
        </g>
      ))}
      {months.map((m, i) => i % labelStep === 0 && (
        <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="9" fill="#999">{m.ym.slice(2)}</text>
      ))}
      {series.map(s => (
        <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.8"
          points={months.map((m, i) => `${x(i)},${y(m[s.key])}`).join(' ')} />
      ))}
      {series.map(s => months.map((m, i) => (
        <circle key={s.key + i} cx={x(i)} cy={y(m[s.key])} r={hover === i ? 3.5 : 2} fill={s.color} />
      )))}
      {months.map((m, i) => (
        <rect key={i} x={x(i) - iw / months.length / 2} y={padT} width={iw / months.length} height={ih}
          fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
      ))}
      {hover != null && (() => {
        const m = months[hover]; const bx = x(hover); const flip = bx > W - padR - 140
        const tx = flip ? bx - 138 : bx + 8
        return (
          <g pointerEvents="none">
            <line x1={bx} x2={bx} y1={padT} y2={padT + ih} stroke="#cbd5e1" strokeDasharray="3 3" />
            <rect x={tx} y={padT + 6} width={130} height={80} rx="6" fill="white" stroke="#e5e7eb" />
            <text x={tx + 8} y={padT + 22} fontSize="10" fontWeight="bold" fill="#334155">{m.ym}</text>
            {series.map((s, j) => (
              <text key={s.key} x={tx + 8} y={padT + 38 + j * 15} fontSize="10" fill={s.color}>{s.name}：{yen(m[s.key])}</text>
            ))}
          </g>
        )
      })()}
    </svg>
  )
}

export default function PackRecalcView() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [excludeLegacy, setExcludeLegacy] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [computing, setComputing] = useState<'' | 'range' | 'all'>('')
  const [snap, setSnap] = useState<{ computed_at: string; opts?: { from?: string; to?: string; exclude_legacy?: boolean; scope?: string } } | null>(null)

  async function syncAccel() {
    setSyncing(true); setSyncMsg('同步中…（呼叫 F056 撈全部加速包報價）')
    try {
      const res = await fetch('/api/admin/stats/cost-recalc/sync-accel', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) setSyncMsg(`同步失敗：${j.error || res.status}`)
      else setSyncMsg(`同步完成：F056 共 ${j.total?.toLocaleString?.() || j.total} 筆、有報價 ${j.priced?.toLocaleString?.() || j.priced} 筆、寫入 ${j.upserted?.toLocaleString?.() || j.upserted} 筆（請按「計算」或「全域重算」套用）`)
    } catch (e) { setSyncMsg(`同步失敗：${e instanceof Error ? e.message : String(e)}`) }
    setSyncing(false)
  }

  // 打開：讀最近一次快照，不重算
  useEffect(() => {
    (async () => {
      setLoading(true)
      const res = await fetch('/api/admin/stats/cost-recalc?cached=1')
      if (res.ok) { const j = await res.json(); if (!j.empty) { setD(j); setSnap(j.snapshot || null) } }
      setLoading(false)
    })() /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  async function compute(scope: 'range' | 'all') {
    setComputing(scope)
    const p = new URLSearchParams()
    if (scope === 'range') { if (from) p.set('from', from); if (to) p.set('to', to) }
    if (excludeLegacy) p.set('exclude_legacy', '1')
    const res = await fetch(`/api/admin/stats/cost-recalc?${p}`)
    if (res.ok) { const j = await res.json(); setD(j); setSnap(j.snapshot || null) }
    setComputing('')
  }

  function exportCsv() {
    if (!d) return
    const head = '家族,地區,原始每日,卡數,可重算,原成本,重算後,基礎成本,加速包成本,節省,節省%,加速包數,超量天數,對到1GB基準,基準SKU,加速包單價,加速來源,無用量卡'
    const body = d.families.map(f => [f.family, f.region, f.gbs, f.cards, f.eligible ? 'Y' : 'N', f.old_cost, f.new_cost, f.base_cost, f.accel_cost, f.savings, f.savings_pct, f.packs, f.over_days, f.base_found ? 'Y' : 'N', f.base_sku, f.accel_price ?? '', f.accel_source, f.no_usage].map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cost-recalc.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const s = d?.summary
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500 max-w-3xl">把「每日型且 ≥1GB」的方案改買同區 1GB 基礎方案＋超量補 1GB 加速包，模擬採購成本能降多少（幣別 ¥ CNY）</p>
        <div className="flex items-center gap-2">
          <button onClick={syncAccel} disabled={syncing} className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 同步加速包價格 (F056)
          </button>
          <button onClick={exportCsv} disabled={!d?.families.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"><Download className="w-4 h-4" /> 匯出 CSV</button>
        </div>
      </div>
      {syncMsg && <div className="mt-3 text-sm bg-violet-50 border border-violet-100 text-violet-700 rounded-lg px-3 py-2">{syncMsg}</div>}

      <LogicNote items={[
        '納入範圍：單日型（plan_type=1）、原 SKU 在 bc_products。已在方案列表分組者：組內「日容量≥1GB 或 已勾吃到飽」的成員都納入（吃到飽卡也改用 1GB 基礎＋加速包重算）；未分組者：僅名稱日容量≥1GB 且非吃到飽（走自動家族）。同 iccid 取天數最長方案為主方案。',
        '基準對應：優先用「方案列表→群組檢視」你手動指定的 1GB 基礎方案；未手動分組者才用品名自動歸家族、取同家族「每日1GB」那支。基準成本＝該方案 BC 結算價。',
        '舊成本＝原方案結算價 ×（依份數對應 tier，缺則 cost_price × 份數）。新成本＝1GB 基準同法 ＋ 加速包成本。',
        '加速包數：每個「當日用量 > 1GB」的日子補 ceil(當日GB − 1) 個 1GB 加速包（無條件進位）；用量取自 card_usage_daily（F023）。',
        '加速包單價：先按「同步加速包價格(F056)」把 acceleratePrice 撈進 DB；再到方案列表為每組基礎方案「人工選定加速包 SKU」，重算就用你選的那支報價（來源「選定」）。未選則暫用「基礎單日價」估（來源「基礎日價」）。',
        '無法重算的家族（沒有 1GB 基準，或基準無價可算）才不計入節省，另以「待處理」呈現。「無用量卡」＝無 F023 逐日資料（超量估 0）。',
      ]} />

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="下單月份" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={excludeLegacy} onChange={e => setExcludeLegacy(e.target.checked)} /> 排除舊SIMPOMATION
        </label>
        <button onClick={() => compute('range')} disabled={computing !== ''} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {computing === 'range' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 計算（選定區間）
        </button>
        <button onClick={() => compute('all')} disabled={computing !== ''} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {computing === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} 全域重算（全部到當日）
        </button>
        {snap && <span className="text-xs text-gray-400">上次計算：{new Date(snap.computed_at).toLocaleString('zh-TW')}（{snap.opts?.scope === 'all' ? '全部' : `${snap.opts?.from || '起'}~${snap.opts?.to || '迄'}`}{snap.opts?.exclude_legacy ? '·排除舊卡' : ''}）</span>}
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入最近結果...</p>
        : !d || !s ? <p className="mt-8 text-sm text-gray-400">尚無結果，請按「計算」或「全域重算」。</p> : (
        <>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">納入卡數</div><div className="mt-1 text-2xl font-bold">{s.cards.toLocaleString()}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">原採購成本</div><div className="mt-1 text-2xl font-bold text-rose-600">{yen(s.old_cost)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">重算後成本</div><div className="mt-1 text-2xl font-bold text-teal-600">{yen(s.new_cost)}</div><div className="text-[11px] text-gray-400 mt-0.5">基礎 {yen(s.base_cost)} ＋ 加速 {yen(s.accel_cost)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">預估節省</div><div className="mt-1 text-2xl font-bold text-blue-600">{yen(s.savings)}</div><div className="text-[11px] text-gray-400 mt-0.5">↓ {s.savings_pct}%</div></div>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>加速包總數：{s.total_packs.toLocaleString()} 個</span>
            <span className={s.pending_cards ? 'text-amber-600' : ''}>待處理卡：{s.pending_cards.toLocaleString()}（無基準家族 {s.pending_no_base}／缺加速包家族 {s.pending_no_accel}，原成本 {yen(s.pending_old)}）</span>
            <span className={s.no_usage_cards ? 'text-amber-600' : ''}>無逐日用量卡：{s.no_usage_cards.toLocaleString()}</span>
            <span>DB 加速包報價數：{d.params.accel_priced}</span>
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
                  {['家族（地區/網路/降速）', '原始每日', '卡數', '原成本', '重算後', '加速包', '節省', '節省%', '超量天數/包數', '1GB基準', '加速包單價'].map(h => <th key={h} className="px-3 py-2 text-left border-b font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.families.length === 0 ? (
                  <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">無資料</td></tr>
                ) : d.families.map((f, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${f.eligible ? '' : 'bg-amber-50/40'}`}>
                    <td className="px-3 py-2 max-w-xs truncate" title={f.family}>{f.family}{!f.eligible && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">待處理</span>}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{f.gbs}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.cards.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-rose-600">{yen(f.old_cost)}</td>
                    <td className="px-3 py-2 text-right font-mono text-teal-600">{f.eligible ? yen(f.new_cost) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">{f.eligible ? yen(f.accel_cost) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">{f.eligible ? yen(f.savings) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono ${f.eligible && f.savings_pct > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{f.eligible ? `${f.savings_pct}%` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{f.over_days}/{f.packs}</td>
                    <td className="px-3 py-2 text-xs">
                      {f.base_found ? <span className="text-emerald-600" title={f.base_name}>✓ {f.base_sku.slice(0, 8)}…</span> : <span className="text-amber-600">缺基準</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{f.accel_price != null ? yen(f.accel_price) : '—'}<span className="ml-1 text-gray-400">{f.accel_source}</span></td>
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
