'use client'

import { Fragment, useEffect, useState, createContext, useContext } from 'react'
import DateRange from '@/components/admin/DateRange'
import { Loader2, Download, ChevronDown, ChevronRight } from 'lucide-react'

// 全域「排除舊SIMPOMATION」開關（各分頁共用；預設排除）
const ExcludeLegacyCtx = createContext(true)

interface SkuRow {
  sku_id: string
  sku_name: string
  plan_type: string | null
  plan_type_label: string | null
  plans: number
  cards: number
  copies: number
  share: number
  copies_dist: { copies: string; count: number }[]
}

function fmtKB(kb: number) {
  if (!kb) return '0'
  if (kb >= 1024 * 1024 * 1024) return (kb / 1024 / 1024 / 1024).toFixed(2) + ' TB'
  if (kb >= 1024 * 1024) return (kb / 1024 / 1024).toFixed(2) + ' GB'
  if (kb >= 1024) return (kb / 1024).toFixed(2) + ' MB'
  return Math.round(kb) + ' KB'
}

export default function StatsAnalysisPage() {
  const [tab, setTab] = useState<'sku' | 'usage' | 'dailyavg' | 'days' | 'util' | 'expiry' | 'lifecycle' | 'lag' | 'travel'>('sku')
  const [excludeLegacy, setExcludeLegacy] = useState(true)
  return (
    <ExcludeLegacyCtx.Provider value={excludeLegacy}>
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">方案統計分析</h1>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
          <input type="checkbox" checked={excludeLegacy} onChange={e => setExcludeLegacy(e.target.checked)} /> 排除舊SIMPOMATION（無逐日資料）
        </label>
      </div>
      <div className="mt-4 flex gap-1 border-b border-gray-200 flex-wrap">
        {([['sku', '方案分析'], ['usage', '數據用量'], ['dailyavg', '日均量'], ['days', '使用天數'], ['util', '利用率'], ['expiry', '到期提醒'], ['lifecycle', '生命週期'], ['lag', '開通時效'], ['travel', '出行分析']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'sku' ? <SkuSection /> : tab === 'usage' ? <UsageAnalysis /> : tab === 'dailyavg' ? <DailyAvgAnalysis /> : tab === 'days' ? <DaysAnalysis />
        : tab === 'util' ? <UtilizationAnalysis /> : tab === 'expiry' ? <ExpiryAnalysis /> : tab === 'lifecycle' ? <LifecycleAnalysis />
        : tab === 'lag' ? <ActivationLagAnalysis /> : <TravelAnalysis />}
    </div>
    </ExcludeLegacyCtx.Provider>
  )
}

// 水平長條（給分佈用）
function BarRow({ label, value, max, count, pct, color = 'bg-blue-500' }: { label: string; value: number; max: number; count: string; pct?: number; color?: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 text-sm text-gray-600 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden relative">
        <div className={`h-full ${color} rounded`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <div className="w-28 text-right text-sm font-mono shrink-0">{count}{pct != null ? <span className="text-gray-400 ml-1">{pct}%</span> : null}</div>
    </div>
  )
}

// 可展開的「計算邏輯」說明
function LogicNote({ items }: { items: string[] }) {
  return (
    <details className="mt-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
      <summary className="px-3 py-2 cursor-pointer font-medium text-blue-700 select-none">計算邏輯說明</summary>
      <ul className="px-5 pb-3 pt-1 space-y-1 leading-relaxed list-disc">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </details>
  )
}

function SkuAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [rows, setRows] = useState<SkuRow[]>([])
  const [totalPlans, setTotalPlans] = useState(0)
  const [totalSkus, setTotalSkus] = useState(0)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [planStatus, setPlanStatus] = useState('')
  const [planType, setPlanType] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function params() {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (planStatus) p.set('plan_status', planStatus)
    if (planType) p.set('plan_type', planType)
    if (excludeLegacy) p.set('exclude_legacy', '1')
    return p
  }
  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/stats/sku?${params()}`)
    if (res.ok) { const d = await res.json(); setRows(d.rows || []); setTotalPlans(d.total_plans || 0); setTotalSkus(d.total_skus || 0) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function exportCsv() {
    const head = 'SKU名稱,類型,方案數,卡數,份數合計,占比%'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = rows.map(r => [r.sku_name, r.plan_type_label || '', r.plans, r.cards, r.copies, r.share].map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sku-stats.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const maxPlans = rows.length ? rows[0].plans : 0

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans（每張卡 × 每個子訂單一列）。',
        '母體可依「啟用時間區間 / 方案類型 / 套餐狀態」篩選（對應 plan_start_time、plan_type、plan_status）。',
        '方案數＝符合條件的方案列數；卡數＝不重複 ICCID；份數合計＝各方案 copies 加總。',
        '占比＝該 SKU 方案數 ÷ 全部方案數。',
        '展開＝該 SKU 的份數(copies)分佈；子列占比＝該份數方案數 ÷ 該 SKU 方案數。',
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">使用的 SKU 統計 · 依方案數排行（點列展開看份數分佈）</p>
        <button onClick={exportCsv} disabled={!rows.length}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          <Download className="w-4 h-4" /> 匯出 CSV
        </button>
      </div>

      {/* 篩選 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="啟用" />
        <select value={planType} onChange={e => setPlanType(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部類型</option>
          <option value="0">總量型</option>
          <option value="1">單日型</option>
        </select>
        <select value={planStatus} onChange={e => setPlanStatus(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部套餐狀態</option>
          <option value="0">未使用</option>
          <option value="1">使用中</option>
          <option value="2">使用結束</option>
          <option value="3">已取消</option>
        </select>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
      </div>

      {/* 摘要 */}
      {!loading && (
        <div className="mt-4 flex gap-4">
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">方案總數</div>
            <div className="mt-1 text-2xl font-bold">{totalPlans.toLocaleString()}</div>
          </div>
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">使用的 SKU 種類</div>
            <div className="mt-1 text-2xl font-bold">{totalSkus.toLocaleString()}</div>
          </div>
        </div>
      )}

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">SKU 名稱</th>
                <th className="px-3 py-2 text-left border-b">類型</th>
                <th className="px-3 py-2 text-right border-b">方案數</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">份數合計</th>
                <th className="px-3 py-2 text-left border-b w-56">占比</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400">無資料（先到「統計明細列表」同步方案）</td></tr>
              ) : rows.map((r, i) => {
                const open = expanded.has(r.sku_id)
                const maxCopies = r.copies_dist.length ? Math.max(...r.copies_dist.map(c => c.count)) : 0
                return (
                <Fragment key={r.sku_id}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(r.sku_id) ? s.delete(r.sku_id) : s.add(r.sku_id); return s })}>
                  <td className="px-3 py-2 text-gray-400">
                    <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{i + 1}</span>
                  </td>
                  <td className="px-3 py-2 max-w-md truncate" title={r.sku_name}>{r.sku_name}</td>
                  <td className="px-3 py-2">{r.plan_type_label ? <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.plan_type_label === '單日型' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{r.plan_type_label}</span> : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{r.plans.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.copies.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded" style={{ width: `${maxPlans ? (r.plans / maxPlans) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{r.share}%</span>
                    </div>
                  </td>
                </tr>
                {open && r.copies_dist.map(c => {
                  const pct = r.plans > 0 ? Math.round((c.count / r.plans) * 1000) / 10 : 0
                  return (
                  <tr key={`${r.sku_id}-${c.copies}`} className="border-b bg-gray-50/60 text-xs text-gray-600">
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-8">└ {c.copies === '—' ? '未填' : `${c.copies} 份`}</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.count.toLocaleString()}</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-indigo-400 rounded" style={{ width: `${maxCopies ? (c.count / maxCopies) * 100 : 0}%` }} /></div>
                        <span className="w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                  )
                })}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 數據使用量分析：全域趨勢 / 依方案 / 國家 ──
interface CopiesCell { copies: string; usage: number; cards: number; avg: number; avg_card_day: number }
interface UsageRow { key: string; label: string; usage: number; cards: number; avg: number; avg_card_day: number; share: number; copies_dist: CopiesCell[]; sku_dist: { sku_id: string; sku_name: string; usage: number; cards: number; avg: number; avg_card_day: number; copies_dist: CopiesCell[] }[] }
function UsageAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [dim, setDim] = useState<'global' | 'sku' | 'country'>('global')
  const [rows, setRows] = useState<UsageRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalCards, setTotalCards] = useState(0)
  const [totalAvgCardDay, setTotalAvgCardDay] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expanded2, setExpanded2] = useState<Set<string>>(new Set())   // 國家維度：SKU 再展開份數
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function load(d = dim) {
    setLoading(true)
    const p = new URLSearchParams({ dim: d })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/usage?${p}`)
    if (res.ok) { const j = await res.json(); setRows(j.rows || []); setTotal(j.total || 0); setTotalCards(j.total_cards || 0); setTotalAvgCardDay(j.total_avg_card_day || 0) }
    setLoading(false)
  }
  useEffect(() => { load('global') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function pick(d: 'global' | 'sku' | 'country') { setDim(d); setExpanded(new Set()); setExpanded2(new Set()); load(d) }
  const maxUsage = rows.length ? Math.max(...rows.map(r => r.usage)) : 0

  function exportCsv() {
    const head = dim === 'global' ? '日期,用量KB,卡數,平均每卡KB' : dim === 'country' ? '國家,用量KB,卡數,平均每卡KB,占比%' : 'SKU,用量KB,卡數,平均每卡KB,占比%'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = rows.map(r => (dim === 'global' ? [r.label, r.usage, r.cards, r.avg] : [r.label, r.usage, r.cards, r.avg, r.share]).map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `usage-${dim}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <LogicNote items={
        dim === 'global' ? [
          '資料來源：card_usage_daily。沒指定區間時預設近 30 天，日期由新到舊。',
          '依「用量日期」彙總：用量＝當日 used_amount 加總；卡數＝當日有流量的不重複卡。',
          '平均/卡＝用量 ÷ 卡數；平均/卡/日＝用量 ÷ 卡日數（每列為單日，兩者相同）。',
        ] : dim === 'sku' ? [
          '資料來源：card_usage_daily，用 iccid→SKU 對照（取該卡出現最多的 SKU|copies 組合）把用量歸到 SKU。',
          '用量＝該 SKU 用量加總；卡數＝不重複卡；平均/卡＝用量÷卡數；平均/卡/日＝用量÷卡日數(iccid|date)。',
          '占比＝該 SKU 用量 ÷ 總用量。展開＝該 SKU 的份數(copies)用量分佈。',
        ] : [
          '資料來源：card_usage_daily，依國家彙總。',
          '用量＝該國用量加總；卡數＝不重複卡；平均/卡＝用量÷卡數；平均/卡/日＝用量÷卡日數。',
          '占比＝該國用量 ÷ 總用量。展開＝反查該國用量來自哪些方案(SKU)。',
        ]
      } />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([['global', '每日趨勢'], ['sku', '依方案'], ['country', '依國家']] as const).map(([k, label]) => (
            <button key={k} onClick={() => pick(k)}
              className={`px-3 py-1.5 text-sm rounded-md ${dim === k ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="日期" />
          <button onClick={() => load()} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && (
        <div className="mt-4 flex gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">總用量</div>
            <div className="mt-1 text-2xl font-bold">{fmtKB(total)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">用到數據的卡數</div>
            <div className="mt-1 text-2xl font-bold">{totalCards.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">平均每卡用量</div>
            <div className="mt-1 text-2xl font-bold">{fmtKB(totalCards > 0 ? Math.round(total / totalCards) : 0)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">平均每卡每日</div>
            <div className="mt-1 text-2xl font-bold">{fmtKB(totalAvgCardDay)}</div>
          </div>
        </div>
      )}

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">{dim === 'global' ? '日期' : dim === 'country' ? '國家' : '方案 SKU'}</th>
                {dim !== 'global' && <th className="px-3 py-2 text-left border-b">{dim === 'country' ? '方案' : '份數'}</th>}
                <th className="px-3 py-2 text-right border-b">用量</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">平均/卡</th>
                <th className="px-3 py-2 text-right border-b">平均/卡/日</th>
                <th className="px-3 py-2 text-left border-b w-48">{dim === 'global' ? '' : '占比'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={dim === 'global' ? 7 : 8} className="px-3 py-10 text-center text-gray-400">無資料（先到「統計明細列表」同步方案，會一併撈使用量）</td></tr>
              ) : rows.map((r, i) => {
                const canExpand = (dim === 'sku' && (r.copies_dist?.length || 0) > 0) || (dim === 'country' && (r.sku_dist?.length || 0) > 0)
                const open = expanded.has(r.key)
                const maxCd = dim === 'sku' && r.copies_dist.length ? Math.max(...r.copies_dist.map(c => c.usage)) : 0
                const maxSd = dim === 'country' && r.sku_dist.length ? Math.max(...r.sku_dist.map(c => c.usage)) : 0
                return (
                <Fragment key={r.key}>
                <tr className={`border-b hover:bg-gray-50 ${canExpand ? 'cursor-pointer' : ''}`}
                  onClick={() => canExpand && setExpanded(prev => { const s = new Set(prev); s.has(r.key) ? s.delete(r.key) : s.add(r.key); return s })}>
                  <td className="px-3 py-2 text-gray-400">
                    {canExpand ? <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{i + 1}</span> : i + 1}
                  </td>
                  <td className="px-3 py-2 max-w-md truncate" title={r.label}>{r.label}</td>
                  {dim !== 'global' && <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{dim === 'country' ? r.sku_dist.length : r.copies_dist.length} 種</td>}
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtKB(r.usage)}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.avg)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.avg_card_day)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div className={`h-full rounded ${dim === 'global' ? 'bg-teal-500' : dim === 'country' ? 'bg-violet-500' : 'bg-blue-500'}`}
                          style={{ width: `${maxUsage ? (r.usage / maxUsage) * 100 : 0}%` }} />
                      </div>
                      {dim !== 'global' && <span className="text-xs text-gray-500 w-10 text-right">{r.share}%</span>}
                    </div>
                  </td>
                </tr>
                {open && canExpand && dim === 'sku' && r.copies_dist.map(c => {
                  const pct = r.usage > 0 ? Math.round((c.usage / r.usage) * 1000) / 10 : 0
                  return (
                  <tr key={`${r.key}-${c.copies}`} className="border-b bg-gray-50/60 text-xs text-gray-600">
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-6">└ {c.copies === '—' ? '未填' : `${c.copies} 份`}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.usage)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.cards}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg_card_day)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-indigo-400 rounded" style={{ width: `${maxCd ? (c.usage / maxCd) * 100 : 0}%` }} /></div>
                        <span className="w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                  )
                })}
                {open && canExpand && dim === 'country' && r.sku_dist.map(c => {
                  const pct = r.usage > 0 ? Math.round((c.usage / r.usage) * 1000) / 10 : 0
                  const k2 = `${r.key}-${c.sku_id}`
                  const canExp2 = (c.copies_dist?.length || 0) > 0
                  const open2 = expanded2.has(k2)
                  const maxCd2 = canExp2 ? Math.max(...c.copies_dist.map(x => x.usage)) : 0
                  return (
                  <Fragment key={k2}>
                  <tr className={`border-b bg-gray-50/60 text-xs text-gray-600 ${canExp2 ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                    onClick={() => canExp2 && setExpanded2(prev => { const s = new Set(prev); s.has(k2) ? s.delete(k2) : s.add(k2); return s })}>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-6 max-w-xs truncate" title={c.sku_name}>
                      <span className="inline-flex items-center gap-1">
                        {canExp2 ? (open2 ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : null}
                        └ {c.sku_name}{canExp2 ? <span className="text-gray-400">（{c.copies_dist.length} 種份數）</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.usage)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.cards}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg_card_day)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-violet-400 rounded" style={{ width: `${maxSd ? (c.usage / maxSd) * 100 : 0}%` }} /></div>
                        <span className="w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                  {open2 && canExp2 && c.copies_dist.map(x => {
                    const pct2 = c.usage > 0 ? Math.round((x.usage / c.usage) * 1000) / 10 : 0
                    return (
                    <tr key={`${k2}-${x.copies}`} className="border-b bg-gray-100/70 text-xs text-gray-500">
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 pl-12">└ {x.copies === '—' ? '未填' : `${x.copies} 份`}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(x.usage)}</td>
                      <td className="px-3 py-1 text-right font-mono">{x.cards}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(x.avg)}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(x.avg_card_day)}</td>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded h-1 overflow-hidden"><div className="h-full bg-fuchsia-400 rounded" style={{ width: `${maxCd2 ? (x.usage / maxCd2) * 100 : 0}%` }} /></div>
                          <span className="w-10 text-right">{pct2}%</span>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  </Fragment>
                  )
                })}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── SKU 分析：子分頁（SKU 統計 / 覆蓋國家 / 依方案×國家組合 / 國家組合×方案） ──
function SkuSection() {
  const [sub, setSub] = useState<'stat' | 'cov' | 'combo' | 'pure'>('stat')
  return (
    <div>
      <div className="mt-4 flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {([['stat', 'SKU 排行'], ['cov', '方案覆蓋國家'], ['combo', '方案 → 國家組合'], ['pure', '國家組合 → 方案']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`px-3 py-1.5 text-sm rounded-md ${sub === k ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>
      {sub === 'stat' ? <SkuAnalysis /> : sub === 'cov' ? <SkuCoverage /> : sub === 'combo' ? <ComboCoverage /> : <PureCombo />}
    </div>
  )
}

interface CoverageRow { sku_id: string; sku_name: string; country_count: number; usage: number; cards: number; avg: number; avg_card_day: number; countries: { code: string; name: string; usage: number; cards: number; avg: number; avg_card_day: number }[] }
function SkuCoverage() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [totalSkus, setTotalSkus] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/sku-countries?${p}`)
    if (res.ok) { const j = await res.json(); setRows(j.rows || []); setTotalSkus(j.total_skus || 0) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function exportCsv() {
    const head = 'SKU名稱,使用國家數,總用量KB,卡數,平均每卡KB,平均每卡每日KB'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = rows.map(r => [r.sku_name, r.country_count, r.usage, r.cards, r.avg, r.avg_card_day].map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sku-coverage.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const maxCountries = rows.length ? rows[0].country_count : 0

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans（iccid→SKU 對照）＋ card_usage_daily（實際有流量的國家）。',
        '對每支 SKU 統計旗下卡片「實際跑出流量」的國家集合（非 SKU 名義涵蓋清單）。',
        '使用國家數＝該 SKU 有流量的不重複國家數；卡數＝有流量的不重複卡。',
        '平均/卡＝總用量 ÷ 卡數；平均/卡/日＝總用量 ÷（卡 × 有流量天數）。',
        '展開＝各國用量明細；子列占比＝該國用量 ÷ 該 SKU 總用量。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">方案覆蓋國家 · 依實際使用國家數排行（點列展開看各國用量）</p>
        <div className="flex items-center gap-2">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="日期" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && (
        <div className="mt-4 flex gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">有使用量的 SKU 種類</div>
            <div className="mt-1 text-2xl font-bold">{totalSkus.toLocaleString()}</div>
          </div>
        </div>
      )}

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">方案 SKU</th>
                <th className="px-3 py-2 text-right border-b">使用國家數</th>
                <th className="px-3 py-2 text-right border-b">總用量</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">平均/卡</th>
                <th className="px-3 py-2 text-right border-b">平均/卡/日</th>
                <th className="px-3 py-2 text-left border-b w-48">國家數占比</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">無資料（先到「統計明細列表」同步方案，會一併撈使用量）</td></tr>
              ) : rows.map((r, i) => {
                const open = expanded.has(r.sku_id)
                const maxU = r.countries.length ? r.countries[0].usage : 0
                return (
                <Fragment key={r.sku_id}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(r.sku_id) ? s.delete(r.sku_id) : s.add(r.sku_id); return s })}>
                  <td className="px-3 py-2 text-gray-400">
                    <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{i + 1}</span>
                  </td>
                  <td className="px-3 py-2 max-w-md truncate" title={r.sku_name}>{r.sku_name}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{r.country_count}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.usage)}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.avg)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.avg_card_day)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div className="h-full bg-rose-500 rounded" style={{ width: `${maxCountries ? (r.country_count / maxCountries) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right">{maxCountries ? Math.round((r.country_count / maxCountries) * 1000) / 10 : 0}%</span>
                    </div>
                  </td>
                </tr>
                {open && r.countries.map(c => {
                  const pct = r.usage > 0 ? Math.round((c.usage / r.usage) * 1000) / 10 : 0
                  return (
                  <tr key={`${r.sku_id}-${c.code}`} className="border-b bg-gray-50/60 text-xs text-gray-600">
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-8 max-w-xs truncate" title={c.name}>└ {c.name}</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.usage)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.cards.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg_card_day)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-rose-400 rounded" style={{ width: `${maxU ? (c.usage / maxU) * 100 : 0}%` }} /></div>
                        <span className="w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                  )
                })}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 國家組合分佈：SKU →（幾個國家）→（實際國家組合，各有幾張卡）──
interface ComboCell { label: string; names: string[]; size: number; plans: number; cards: number; usage: number; avg: number; avg_card_day: number; sku_dist: { sku_id: string; sku_name: string; plans: number; cards: number; usage: number; avg: number; avg_card_day: number }[] }
interface SizeGroup { size: number; plans: number; cards: number; usage: number; avg: number; avg_card_day: number; combos: ComboCell[] }
interface ComboSkuRow { sku_id: string; sku_name: string; plans: number; cards: number; usage: number; avg: number; avg_card_day: number; size_count: number; combo_count: number; size_groups: SizeGroup[] }
function ComboCoverage() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [rows, setRows] = useState<ComboSkuRow[]>([])
  const [totalSkus, setTotalSkus] = useState(0)
  const [totalUsage, setTotalUsage] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())     // 展開的 SKU
  const [expanded2, setExpanded2] = useState<Set<string>>(new Set())   // 展開的 size 群組
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [planStatus, setPlanStatus] = useState('')

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const p = new URLSearchParams({ today })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (planStatus) p.set('plan_status', planStatus)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/coverage-combos?${p}`)
    if (res.ok) { const j = await res.json(); setRows(j.rows || []); setTotalSkus(j.total_skus || 0); setTotalUsage(j.total_usage || 0) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function exportCsv() {
    const head = 'SKU,國家數,國家組合,方案數,卡數,平均每卡KB,平均每卡每日KB,用量KB'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines: string[] = []
    for (const r of rows) for (const g of r.size_groups) for (const c of g.combos)
      lines.push([r.sku_name, g.size, c.label, c.plans, c.cards, c.avg, c.avg_card_day, c.usage].map(esc).join(','))
    const blob = new Blob(['﻿' + head + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'coverage-combos.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans（方案啟用～到期窗口）＋ card_usage_daily。',
        '每個方案取其窗口內實際有流量的國家集合＝一個「國家組合」（依國碼排序去重，順序無關）。',
        '三層：SKU →「幾個國家」（依組合的國家數分群）→ 實際國家組合。',
        '方案數＝該層方案筆數；卡數＝不重複卡；平均/卡＝用量÷卡數；平均/卡/日＝用量÷（卡×有流量天數）。',
        '占比：頂層＝該 SKU 用量 ÷ 全表用量；子層＝該列用量 ÷ 其上一層用量。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">國家組合分佈 · 每支 SKU 的方案在啟用期間去了哪些地區組合（SKU →「幾國」→ 實際國家組合）</p>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="啟用" />
          <select value={planStatus} onChange={e => setPlanStatus(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部套餐狀態</option>
            <option value="0">未使用</option>
            <option value="1">使用中</option>
            <option value="2">使用結束</option>
            <option value="3">已取消</option>
          </select>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && <p className="mt-3 text-xs text-gray-500">有使用量的 SKU 種類：{totalSkus.toLocaleString()}</p>}

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">方案 SKU / 國家數 / 組合</th>
                <th className="px-3 py-2 text-right border-b">方案數</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">平均/卡</th>
                <th className="px-3 py-2 text-right border-b">平均/卡/日</th>
                <th className="px-3 py-2 text-right border-b">用量</th>
                <th className="px-3 py-2 text-left border-b w-40">用量占比</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">無資料（先到「統計明細列表」同步方案，會一併撈使用量）</td></tr>
              ) : rows.map((r, i) => {
                const open = expanded.has(r.sku_id)
                const share = totalUsage > 0 ? Math.round((r.usage / totalUsage) * 1000) / 10 : 0
                return (
                <Fragment key={r.sku_id}>
                {/* 第一層：SKU */}
                <tr className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(r.sku_id) ? s.delete(r.sku_id) : s.add(r.sku_id); return s })}>
                  <td className="px-3 py-2 text-gray-400">
                    <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{i + 1}</span>
                  </td>
                  <td className="px-3 py-2 max-w-lg truncate" title={r.sku_name}>
                    {r.sku_name}
                    <span className="ml-2 text-xs text-gray-400">{r.size_count} 種國家數 · {r.combo_count} 種組合</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{r.plans.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.avg)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.avg_card_day)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(r.usage)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div className="h-full bg-rose-500 rounded" style={{ width: `${share}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{share}%</span>
                    </div>
                  </td>
                </tr>
                {open && r.size_groups.map(g => {
                  const gKey = `${r.sku_id}|${g.size}`
                  const open2 = expanded2.has(gKey)
                  const gShare = r.usage > 0 ? Math.round((g.usage / r.usage) * 1000) / 10 : 0
                  return (
                  <Fragment key={gKey}>
                  {/* 第二層：幾個國家 */}
                  <tr className="border-b bg-gray-50/70 text-xs text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => setExpanded2(prev => { const s = new Set(prev); s.has(gKey) ? s.delete(gKey) : s.add(gKey); return s })}>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-6">
                      <span className="inline-flex items-center gap-1 font-medium">
                        {open2 ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        └ {g.size} 國家
                        <span className="ml-1 text-gray-400">（{g.combos.length} 種組合）</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{g.plans.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{g.cards.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(g.avg)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(g.avg_card_day)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(g.usage)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-rose-400 rounded" style={{ width: `${gShare}%` }} /></div>
                        <span className="w-10 text-right">{gShare}%</span>
                      </div>
                    </td>
                  </tr>
                  {/* 第三層：實際國家組合 */}
                  {open2 && g.combos.map((c, ci) => {
                    const pct = g.usage > 0 ? Math.round((c.usage / g.usage) * 1000) / 10 : 0
                    return (
                    <tr key={`${gKey}-${ci}`} className="border-b bg-gray-100/60 text-xs text-gray-600">
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 pl-12" title={c.label}>└ {c.label}</td>
                      <td className="px-3 py-1 text-right font-mono">{c.plans.toLocaleString()}</td>
                      <td className="px-3 py-1 text-right font-mono">{c.cards.toLocaleString()}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(c.avg)}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(c.avg_card_day)}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(c.usage)}</td>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-rose-400 rounded" style={{ width: `${pct}%` }} /></div>
                          <span className="w-10 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  </Fragment>
                  )
                })}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 純國家組合（不分方案）：全體 →（幾個國家）→（實際國家組合）──
function PureCombo() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [groups, setGroups] = useState<SizeGroup[]>([])
  const [summary, setSummary] = useState({ plans: 0, cards: 0, usage: 0, size_count: 0, combo_count: 0 })
  const [expanded, setExpanded] = useState<Set<number>>(new Set())      // 展開的國家數群組
  const [expanded2, setExpanded2] = useState<Set<string>>(new Set())    // 展開的組合（看方案）
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [planStatus, setPlanStatus] = useState('')

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const p = new URLSearchParams({ mode: 'combo', today })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (planStatus) p.set('plan_status', planStatus)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/coverage-combos?${p}`)
    if (res.ok) { const j = await res.json(); setGroups(j.size_groups || []); setSummary({ plans: j.plans || 0, cards: j.cards || 0, usage: j.usage || 0, size_count: j.size_count || 0, combo_count: j.combo_count || 0 }) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function exportCsv() {
    const head = '國家數,國家組合,方案數,卡數,平均每卡KB,平均每卡每日KB,用量KB'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines: string[] = []
    for (const g of groups) for (const c of g.combos) lines.push([g.size, c.label, c.plans, c.cards, c.avg, c.avg_card_day, c.usage].map(esc).join(','))
    const blob = new Blob(['﻿' + head + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'pure-combos.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans（方案啟用～到期窗口）＋ card_usage_daily。國家組合定義同「方案 → 國家組合」，但不分 SKU、全體一起算。',
        '三層：「幾個國家」→ 實際國家組合 → 使用該組合的方案(SKU)。',
        '用途：從國家組合反查是哪些方案(SKU)在使用。',
        '方案數＝該層方案筆數；卡數＝不重複卡；平均/卡、平均/卡/日、占比定義與「方案 → 國家組合」相同。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">國家組合 × 方案 ·「幾國」→ 實際國家組合 → 使用該組合的方案（點組合展開看方案）</p>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="啟用" />
          <select value={planStatus} onChange={e => setPlanStatus(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部套餐狀態</option>
            <option value="0">未使用</option>
            <option value="1">使用中</option>
            <option value="2">使用結束</option>
            <option value="3">已取消</option>
          </select>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!groups.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && (
        <div className="mt-4 flex gap-4 flex-wrap">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">方案數</div>
            <div className="mt-1 text-2xl font-bold">{summary.plans.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">卡數</div>
            <div className="mt-1 text-2xl font-bold">{summary.cards.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">國家數種類</div>
            <div className="mt-1 text-2xl font-bold">{summary.size_count.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">組合種類</div>
            <div className="mt-1 text-2xl font-bold">{summary.combo_count.toLocaleString()}</div>
          </div>
        </div>
      )}

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10"></th>
                <th className="px-3 py-2 text-left border-b">國家數 / 國家組合</th>
                <th className="px-3 py-2 text-right border-b">方案數</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-right border-b">平均/卡</th>
                <th className="px-3 py-2 text-right border-b">平均/卡/日</th>
                <th className="px-3 py-2 text-right border-b">用量</th>
                <th className="px-3 py-2 text-left border-b w-40">用量占比</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">無資料（先到「統計明細列表」同步方案，會一併撈使用量）</td></tr>
              ) : groups.map(g => {
                const open = expanded.has(g.size)
                const gShare = summary.usage > 0 ? Math.round((g.usage / summary.usage) * 1000) / 10 : 0
                return (
                <Fragment key={g.size}>
                {/* 第一層：幾個國家 */}
                <tr className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(g.size) ? s.delete(g.size) : s.add(g.size); return s })}>
                  <td className="px-3 py-2 text-gray-400">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                  <td className="px-3 py-2 font-medium">{g.size} 國家<span className="ml-2 text-xs text-gray-400">（{g.combos.length} 種組合）</span></td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{g.plans.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{g.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(g.avg)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(g.avg_card_day)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKB(g.usage)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div className="h-full bg-rose-500 rounded" style={{ width: `${gShare}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{gShare}%</span>
                    </div>
                  </td>
                </tr>
                {/* 第二層：實際國家組合（可再展開看方案） */}
                {open && g.combos.map((c, ci) => {
                  const pct = g.usage > 0 ? Math.round((c.usage / g.usage) * 1000) / 10 : 0
                  const cKey = `${g.size}-${ci}`
                  const open2 = expanded2.has(cKey)
                  const canExp2 = (c.sku_dist?.length || 0) > 0
                  return (
                  <Fragment key={cKey}>
                  <tr className={`border-b bg-gray-50/60 text-xs text-gray-600 ${canExp2 ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                    onClick={() => canExp2 && setExpanded2(prev => { const s = new Set(prev); s.has(cKey) ? s.delete(cKey) : s.add(cKey); return s })}>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-8" title={c.label}>
                      <span className="inline-flex items-center gap-1">
                        {canExp2 ? (open2 ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : null}
                        └ {c.label}{canExp2 ? <span className="ml-1 text-gray-400">（{c.sku_dist.length} 種方案）</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.plans.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.cards.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.avg_card_day)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtKB(c.usage)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-rose-400 rounded" style={{ width: `${pct}%` }} /></div>
                        <span className="w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                  {/* 第三層：使用此組合的方案(SKU) */}
                  {open2 && canExp2 && c.sku_dist.map(sd => {
                    const pct2 = c.usage > 0 ? Math.round((sd.usage / c.usage) * 1000) / 10 : 0
                    return (
                    <tr key={`${cKey}-${sd.sku_id}`} className="border-b bg-gray-100/70 text-xs text-gray-500">
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 pl-14 max-w-lg truncate" title={sd.sku_name}>└ {sd.sku_name}</td>
                      <td className="px-3 py-1 text-right font-mono">{sd.plans.toLocaleString()}</td>
                      <td className="px-3 py-1 text-right font-mono">{sd.cards.toLocaleString()}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(sd.avg)}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(sd.avg_card_day)}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmtKB(sd.usage)}</td>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded h-1 overflow-hidden"><div className="h-full bg-fuchsia-400 rounded" style={{ width: `${pct2}%` }} /></div>
                          <span className="w-10 text-right">{pct2}%</span>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  </Fragment>
                  )
                })}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 用量分佈 / 利用率 ──
interface UtilData {
  total_plans: number; total_cards: number; zero_plans: number; zero_pct: number
  usage_buckets: { key: string; label: string; plans: number; cards: number; usage: number; pct: number }[]
  daily_plans: number; avg_day_util: number; wasted_days: number
  day_buckets: { key: string; label: string; plans: number; pct: number }[]
}
function UtilizationAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<UtilData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [planType, setPlanType] = useState('')

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const p = new URLSearchParams({ today })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (planType) p.set('plan_type', planType)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/utilization?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  const maxUsage = d ? Math.max(...d.usage_buckets.map(b => b.plans), 1) : 1
  const maxDay = d ? Math.max(...d.day_buckets.map(b => b.plans), 1) : 1

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans（有啟用時間者）＋ card_usage_daily。可依啟用區間、方案類型篩選。',
        '用量分佈：每個方案在啟用期間的總用量落在哪個級距；「完全沒用」＝期間內用量為 0。',
        '天數利用率（僅單日型）：窗口鎖在 plan_start ～ plan_start＋total_days；利用率＝有流量天數 ÷ total_days，上限 100%。',
        '估算浪費天數＝total_days − 實際用到的天數（同一窗口內）。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">用量分佈 · 每方案在啟用期間的總用量級距；天數利用率 · 單日型「買的天數 vs 實際有用量的天數」</p>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="啟用" />
          <select value={planType} onChange={e => setPlanType(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部類型</option>
            <option value="0">總量型</option>
            <option value="1">單日型</option>
          </select>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">方案數</div>
              <div className="mt-1 text-2xl font-bold">{d.total_plans.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">完全沒用的方案</div>
              <div className="mt-1 text-2xl font-bold text-rose-600">{d.zero_plans.toLocaleString()} <span className="text-sm text-gray-400">{d.zero_pct}%</span></div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">單日型平均利用率</div>
              <div className="mt-1 text-2xl font-bold">{d.avg_day_util}%</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">估算浪費天數（單日型）</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">{d.wasted_days.toLocaleString()} 天</div>
            </div>
          </div>

          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">用量分佈（每方案總用量）</h3>
            {d.usage_buckets.map(b => (
              <BarRow key={b.key} label={b.label} value={b.plans} max={maxUsage} count={`${b.plans.toLocaleString()} 案`} pct={b.pct}
                color={b.key === 'zero' ? 'bg-rose-400' : b.key === 'gt50' ? 'bg-amber-500' : 'bg-blue-500'} />
            ))}
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">天數利用率（單日型 · 共 {d.daily_plans.toLocaleString()} 案）</h3>
            {d.daily_plans === 0 ? <p className="text-sm text-gray-400">此篩選下無單日型方案</p> : d.day_buckets.map(b => (
              <BarRow key={b.key} label={b.label} value={b.plans} max={maxDay} count={`${b.plans.toLocaleString()} 案`} pct={b.pct}
                color={b.key === '0' ? 'bg-rose-400' : b.key === '100' ? 'bg-emerald-500' : 'bg-indigo-500'} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── 到期提醒 ──
interface ExpiryData {
  today: string; total: number
  buckets: { key: string; label: string; plans: number; pct: number }[]
  monthly: { month: string; plans: number }[]
  upcoming: { iccid: string; card_status: string | null; card_type: string | null; expiration_date: string; days: number }[]
  upcoming_total: number
  status_labels: Record<string, string>
}
function ExpiryAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<ExpiryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeDead, setIncludeDead] = useState(false)

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const p = new URLSearchParams({ today })
    if (includeDead) p.set('include_dead', '1')
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/expiry?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [includeDead, excludeLegacy])

  const maxB = d ? Math.max(...d.buckets.map(b => b.plans), 1) : 1
  const maxM = d ? Math.max(...d.monthly.map(m => m.plans), 1) : 1

  return (
    <div>
      <LogicNote items={[
        '資料來源：manual_iccids.expiration_date（卡片效期）。',
        '剩餘天數＝效期 − 今天；分桶：已過期 / ≤7 / 8–30 / 31–90 / >90 天 / 無效期。',
        '預設排除已用盡(2)/失效(3)/報廢(5)，可勾選納入。',
        '下方清單＝30 天內到期的卡片，依剩餘天數排序。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">卡片效期到期倒數（manual_iccids.expiration_date）· 預設排除已用盡/失效/報廢</p>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={includeDead} onChange={e => setIncludeDead(e.target.checked)} /> 含已用盡/失效/報廢
        </label>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">到期倒數分佈（基準日 {d.today}，共 {d.total.toLocaleString()} 張）</h3>
            {d.buckets.map(b => (
              <BarRow key={b.key} label={b.label} value={b.plans} max={maxB} count={`${b.plans.toLocaleString()} 張`} pct={b.pct}
                color={b.key === 'expired' ? 'bg-gray-400' : b.key === 'd7' ? 'bg-rose-500' : b.key === 'd30' ? 'bg-amber-500' : 'bg-blue-500'} />
            ))}
          </div>

          {d.monthly.length > 0 && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-2">未來到期（依月份）</h3>
              {d.monthly.map(m => (
                <BarRow key={m.month} label={m.month} value={m.plans} max={maxM} count={`${m.plans.toLocaleString()} 張`} color="bg-teal-500" />
              ))}
            </div>
          )}

          <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <div className="px-5 pt-4 pb-2 text-sm font-semibold">30 天內到期清單（{d.upcoming_total.toLocaleString()} 張{d.upcoming_total > d.upcoming.length ? `，顯示前 ${d.upcoming.length}` : ''}）</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left border-b">ICCID</th>
                  <th className="px-3 py-2 text-left border-b">類型</th>
                  <th className="px-3 py-2 text-left border-b">狀態</th>
                  <th className="px-3 py-2 text-left border-b">效期</th>
                  <th className="px-3 py-2 text-right border-b">剩餘天數</th>
                </tr>
              </thead>
              <tbody>
                {d.upcoming.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">30 天內無到期卡片</td></tr>
                ) : d.upcoming.map(u => (
                  <tr key={u.iccid} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{u.iccid}</td>
                    <td className="px-3 py-2 text-gray-500">{u.card_type || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{u.card_status != null ? (d.status_labels[u.card_status] || u.card_status) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{u.expiration_date}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${u.days <= 7 ? 'text-rose-600' : 'text-amber-600'}`}>{u.days} 天</td>
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

// ── 卡片生命週期 ──
interface LifecycleData {
  total: number; activated: number; activated_pct: number; dead: number; dead_pct: number
  status_dist: { status: string; label: string; count: number; pct: number }[]
  span_total: number; span_buckets: { key: string; label: string; plans: number }[]
  span_by_day: { day: number; plans: number }[]
  seglen: number; segment_total: number
  segments: { prefix: string; cards: number; activated: number; activated_pct: number; dead: number; dead_pct: number; status: { status: string; label: string; count: number }[] }[]
}
function LifecycleAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<LifecycleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [seglen, setSeglen] = useState(10)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/stats/lifecycle?seglen=${seglen}${excludeLegacy ? '&exclude_legacy=1' : ''}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  const maxStatus = d ? Math.max(...d.status_dist.map(s => s.count), 1) : 1
  const maxSpan = d ? Math.max(...d.span_buckets.map(b => b.plans), 1) : 1
  const STATUS_COLOR: Record<string, string> = { '0': 'bg-sky-400', '1': 'bg-emerald-500', '2': 'bg-gray-400', '3': 'bg-rose-400', '4': 'bg-indigo-500', '5': 'bg-rose-600' }

  return (
    <div>
      <LogicNote items={[
        '資料來源：manual_iccids。',
        '狀態分佈＝依 card_status 計數（0已開卡/1使用中/2已用盡/3失效/4續期/5報廢）。',
        '已啟用＝有 activation_start_time；失效/報廢＝card_status ∈ {3, 5}。',
        '啟用時長＝activation_end_time − activation_start_time（天）。',
        '號段分析＝依 ICCID 前 N 碼分群，統計卡數、啟用率、報廢率。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">卡片生命週期 · 狀態分佈 / 啟用漏斗 / 啟用時長 / 號段分析（manual_iccids）</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">號段前綴長度</span>
          <select value={seglen} onChange={e => setSeglen(Number(e.target.value))} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            {[8, 10, 12, 14, 16].map(n => <option key={n} value={n}>{n} 碼</option>)}
          </select>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">總卡數</div>
              <div className="mt-1 text-2xl font-bold">{d.total.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">已啟用</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{d.activated.toLocaleString()} <span className="text-sm text-gray-400">{d.activated_pct}%</span></div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">失效/報廢</div>
              <div className="mt-1 text-2xl font-bold text-rose-600">{d.dead.toLocaleString()} <span className="text-sm text-gray-400">{d.dead_pct}%</span></div>
            </div>
          </div>

          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">狀態分佈</h3>
            {d.status_dist.map(s => (
              <BarRow key={s.status} label={s.label} value={s.count} max={maxStatus} count={`${s.count.toLocaleString()} 張`} pct={s.pct}
                color={STATUS_COLOR[s.status] || 'bg-blue-500'} />
            ))}
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-2">啟用時長分佈（啟用～到期 · 共 {d.span_total.toLocaleString()} 案）</h3>
            {d.span_total === 0 ? <p className="text-sm text-gray-400">無啟用時長資料</p> : d.span_buckets.map(b => (
              <BarRow key={b.key} label={b.label} value={b.plans} max={maxSpan} count={`${b.plans.toLocaleString()} 案`} color="bg-violet-500" />
            ))}
          </div>

          {d.span_total > 0 && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <div className="px-5 pt-4 pb-2 text-sm font-semibold">啟用時長 0–30 天逐日</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left border-b">時長</th>
                    <th className="px-3 py-2 text-right border-b">案數</th>
                    <th className="px-3 py-2 text-right border-b">占比</th>
                    <th className="px-3 py-2 text-left border-b w-1/2">分佈</th>
                  </tr>
                </thead>
                <tbody>
                  {d.span_by_day.map(r => {
                    const maxD = Math.max(...d.span_by_day.map(x => x.plans), 1)
                    const pct = d.span_total > 0 ? Math.round((r.plans / d.span_total) * 1000) / 10 : 0
                    return (
                    <tr key={r.day} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-1.5">{r.day} 天</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.plans.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-500">{pct}%</td>
                      <td className="px-3 py-1.5">
                        <div className="bg-gray-100 rounded h-2 overflow-hidden"><div className="h-full bg-violet-500 rounded" style={{ width: `${(r.plans / maxD) * 100}%` }} /></div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <div className="px-5 pt-4 pb-2 text-sm font-semibold">號段分析（前 {d.seglen} 碼 · 共 {d.segment_total.toLocaleString()} 段{d.segment_total > d.segments.length ? `，顯示前 ${d.segments.length}` : ''}）</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left border-b w-10">#</th>
                  <th className="px-3 py-2 text-left border-b">號段前綴</th>
                  <th className="px-3 py-2 text-right border-b">卡數</th>
                  <th className="px-3 py-2 text-right border-b">已啟用</th>
                  <th className="px-3 py-2 text-right border-b">失效/報廢</th>
                  <th className="px-3 py-2 text-left border-b w-40">報廢率</th>
                </tr>
              </thead>
              <tbody>
                {d.segments.map((s, i) => {
                  const open = expanded.has(s.prefix)
                  return (
                  <Fragment key={s.prefix}>
                  <tr className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(prev => { const x = new Set(prev); x.has(s.prefix) ? x.delete(s.prefix) : x.add(s.prefix); return x })}>
                    <td className="px-3 py-2 text-gray-400"><span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{i + 1}</span></td>
                    <td className="px-3 py-2 font-mono text-xs">{s.prefix}…</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{s.cards.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.activated.toLocaleString()} <span className="text-gray-400 text-xs">{s.activated_pct}%</span></td>
                    <td className="px-3 py-2 text-right font-mono">{s.dead.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden"><div className="h-full bg-rose-500 rounded" style={{ width: `${s.dead_pct}%` }} /></div>
                        <span className="text-xs text-gray-500 w-10 text-right">{s.dead_pct}%</span>
                      </div>
                    </td>
                  </tr>
                  {open && s.status.map(st => (
                    <tr key={`${s.prefix}-${st.status}`} className="border-b bg-gray-50/60 text-xs text-gray-600">
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 pl-8">└ {st.label}</td>
                      <td className="px-3 py-1 text-right font-mono">{st.count.toLocaleString()}</td>
                      <td className="px-3 py-1"></td><td className="px-3 py-1"></td><td className="px-3 py-1"></td>
                    </tr>
                  ))}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── 下單 → 開通 間隔 ──
interface LagData {
  matched: number; src_count: { shopee: number; bc: number }
  avg_days: number; median_days: number
  buckets: { key: string; label: string; plans: number; pct: number }[]
  by_day: { day: number; plans: number; pct: number }[]
  longest: { iccid: string; sku_name: string; order_time: string; plan_start_time: string; days: number; source: string | null }[]
}
function ActivationLagAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<LagData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [source, setSource] = useState('')

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (source) p.set('source', source)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/activation-lag?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  const maxB = d ? Math.max(...d.buckets.map(b => b.plans), 1) : 1

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans 的 order_time（下單時間）與 plan_start_time（開通/啟用）。',
        '下單時間來源：優先蝦皮購買時間(order_date)，沒有才用 BC 建單時間(F011 createTime)；時區統一 +8。',
        '間隔＝plan_start_time − order_time（天）。母體＝兩個時間都有的方案。',
        '分佈：異常(開通早於下單)／當日／1／2／3–6／7–13／14–29／30–59／60–89／≥90 天，另附 0–30 天逐日。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">下單 → 開通 間隔 · 下單時間（優先蝦皮購買，其次 BC 建單）到數據啟用（先到「統計明細列表」同步才會有下單時間）</p>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="下單" />
          <select value={source} onChange={e => setSource(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部來源</option>
            <option value="shopee">蝦皮購買</option>
            <option value="bc">BC 建單</option>
          </select>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">可計算的方案</div>
              <div className="mt-1 text-2xl font-bold">{d.matched.toLocaleString()}</div>
              <div className="mt-1 text-[11px] text-gray-400">蝦皮 {d.src_count.shopee.toLocaleString()} · BC {d.src_count.bc.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">平均間隔</div>
              <div className="mt-1 text-2xl font-bold">{d.avg_days} 天</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500">中位數間隔</div>
              <div className="mt-1 text-2xl font-bold">{d.median_days} 天</div>
            </div>
          </div>

          {d.matched === 0 ? (
            <p className="mt-6 text-sm text-gray-400">尚無下單時間資料。請先到「統計明細列表」按同步，會一併撈下單時間（蝦皮/BC）。</p>
          ) : (
            <>
              <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-2">間隔分佈</h3>
                {d.buckets.map(b => (
                  <BarRow key={b.key} label={b.label} value={b.plans} max={maxB} count={`${b.plans.toLocaleString()} 案`} pct={b.pct}
                    color={b.key === 'neg' ? 'bg-gray-400' : b.key === 'd0' ? 'bg-emerald-500' : (b.key === 'd60' || b.key === 'd90') ? 'bg-rose-500' : 'bg-blue-500'} />
                ))}
              </div>

              <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <div className="px-5 pt-4 pb-2 text-sm font-semibold">0–30 天逐日</div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left border-b">間隔</th>
                      <th className="px-3 py-2 text-right border-b">案數</th>
                      <th className="px-3 py-2 text-right border-b">占比</th>
                      <th className="px-3 py-2 text-left border-b w-1/2">分佈</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.by_day.map(r => {
                      const maxD = Math.max(...d.by_day.map(x => x.plans), 1)
                      return (
                      <tr key={r.day} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-1.5">{r.day} 天</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.plans.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-500">{r.pct}%</td>
                        <td className="px-3 py-1.5">
                          <div className="bg-gray-100 rounded h-2 overflow-hidden"><div className="h-full bg-blue-500 rounded" style={{ width: `${(r.plans / maxD) * 100}%` }} /></div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <div className="px-5 pt-4 pb-2 text-sm font-semibold">間隔最長 Top {d.longest.length}</div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left border-b">ICCID</th>
                      <th className="px-3 py-2 text-left border-b">方案 SKU</th>
                      <th className="px-3 py-2 text-left border-b">下單時間</th>
                      <th className="px-3 py-2 text-left border-b">來源</th>
                      <th className="px-3 py-2 text-left border-b">開通時間</th>
                      <th className="px-3 py-2 text-right border-b">間隔</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.longest.map((r, idx) => (
                      <tr key={`${r.iccid}-${r.order_time}-${idx}`} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{r.iccid}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={r.sku_name}>{r.sku_name}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.order_time}</td>
                        <td className="px-3 py-2 text-xs">{r.source === 'shopee' ? <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">蝦皮</span> : r.source === 'bc' ? <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">BC</span> : '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.plan_start_time}</td>
                        <td className={`px-3 py-2 text-right font-mono ${r.days < 0 ? 'text-gray-400' : r.days > 30 ? 'text-rose-600' : ''}`}>{r.days} 天</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── 出行分析：子分頁（出行地×月 / 每日在哪國） ──
function TravelAnalysis() {
  const [sub, setSub] = useState<'arrival' | 'daily' | 'path'>('arrival')
  return (
    <div>
      <div className="mt-4 flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {([['arrival', '首次抵達（卡數）'], ['daily', '停留卡日（卡日）'], ['path', '出行路徑']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`px-3 py-1.5 text-sm rounded-md ${sub === k ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>
      {sub === 'arrival' ? <TravelArrival /> : sub === 'daily' ? <TravelDaily /> : <TravelPath />}
    </div>
  )
}

// ── 出行地 × 出行日期：國家 × 月份 熱力矩陣（格子＝該月出行到該國的卡數） ──
interface TravelData {
  months: string[]
  month_totals: Record<string, number>
  rows: { code: string; name: string; total: number; by_month: Record<string, number> }[]
  total_countries: number; total_cards: number
}
function TravelArrival() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<TravelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (search) p.set('search', search)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/travel?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function exportCsv() {
    if (!d) return
    const head = ['國家', '合計', ...d.months].join(',')
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = d.rows.map(r => [r.name, r.total, ...d.months.map(m => r.by_month[m] || 0)].map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'travel-country-month.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const maxCell = d ? Math.max(1, ...d.rows.flatMap(r => d.months.map(m => r.by_month[m] || 0))) : 1
  const shade = (v: number) => v <= 0 ? undefined : `rgba(220, 38, 38, ${0.08 + 0.85 * (v / maxCell)})`

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_usage_daily（有流量者）。',
        '對每張卡 × 每個國家取「首次有流量的日期」＝抵達日。',
        '格子＝該月抵達到該國的不重複卡數（每張卡在每個國家只記抵達那一個月）。',
        '合計＝該國不重複抵達卡數；每月合計＝該月有抵達的不重複卡數。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">出行地 × 出行日期 · 每張卡在某國的首次用量日期＝出行日期，格子＝該月出行到該國的卡數</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="搜尋國家" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40" />
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="出行日" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!d?.rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && d && (
        <p className="mt-3 text-xs text-gray-500">出行國家 {d.total_countries.toLocaleString()} 個 · 出行卡數 {d.total_cards.toLocaleString()} 張{d.total_countries > d.rows.length ? `（顯示前 ${d.rows.length}，可搜尋）` : ''}</p>
      )}

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : d.rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">無資料（先到「SKU 分析 → 使用的 SKU」旁的統計明細列表同步使用量）</p>
      ) : (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b sticky left-0 bg-gray-50 z-10">國家</th>
                <th className="px-3 py-2 text-right border-b sticky left-0 bg-gray-50">合計</th>
                {d.months.map(m => (
                  <th key={m} className="px-2 py-2 text-center border-b whitespace-nowrap font-normal">{m.slice(2)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map(r => (
                <tr key={r.code} className="border-b hover:bg-rose-50/30">
                  <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-white max-w-[10rem] truncate" title={r.name}>{r.name}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold sticky left-0 bg-white">{r.total.toLocaleString()}</td>
                  {d.months.map(m => {
                    const v = r.by_month[m] || 0
                    return <td key={m} className="px-2 py-1.5 text-center font-mono text-xs tabular-nums" style={{ background: shade(v) }} title={`${r.name} · ${m}：${v} 張`}>{v || ''}</td>
                  })}
                </tr>
              ))}
              <tr className="border-t-2 bg-gray-50 text-xs font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-gray-50">每月合計</td>
                <td className="px-3 py-2 text-right font-mono sticky left-0 bg-gray-50">{d.total_cards.toLocaleString()}</td>
                {d.months.map(m => <td key={m} className="px-2 py-2 text-center font-mono">{(d.month_totals[m] || 0).toLocaleString()}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 在哪國（每月都計）：國家 × 月份 矩陣（格子＝該月在該國有流量的卡數；非首次） ──
function TravelDaily() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<(TravelData & { total_card_days?: number }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (search) p.set('search', search)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/travel-daily?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  function exportCsv() {
    if (!d) return
    const head = ['國家', '合計', ...d.months].join(',')
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = d.rows.map(r => [r.name, r.total, ...d.months.map(m => r.by_month[m] || 0)].map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'presence-country-month.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const maxCell = d ? Math.max(1, ...d.rows.flatMap(r => d.months.map(m => r.by_month[m] || 0))) : 1
  const shade = (v: number) => v <= 0 ? undefined : `rgba(220, 38, 38, ${0.08 + 0.85 * (v / maxCell)})`

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_usage_daily（有流量者）。',
        '每一筆「每日用量」＝一個卡日；同一天在多國會各記一次。',
        '格子＝該月該國的卡日數（在該國待幾天算幾天）。',
        '合計＝該國卡日總數；卡日合計＝所有格子加總；有流量卡數＝不重複卡。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">出行地 × 月份（依每日）· 國家 × 月份，格子＝該月該國的「卡·日數」（待幾天算幾天，同日多國各計）</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="搜尋國家" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40" />
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="日期" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!d?.rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && d && (
        <p className="mt-3 text-xs text-gray-500">出行國家 {d.total_countries.toLocaleString()} 個 · 有流量卡數 {d.total_cards.toLocaleString()} 張 · 卡日合計 {(d.total_card_days || 0).toLocaleString()}{d.total_countries > d.rows.length ? `（顯示前 ${d.rows.length}，可搜尋）` : ''}</p>
      )}

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : d.rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">無資料</p>
      ) : (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b sticky left-0 bg-gray-50 z-10">國家</th>
                <th className="px-3 py-2 text-right border-b sticky left-0 bg-gray-50">卡日合計</th>
                {d.months.map(m => (
                  <th key={m} className="px-2 py-2 text-center border-b whitespace-nowrap font-normal">{m.slice(2)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map(r => (
                <tr key={r.code} className="border-b hover:bg-rose-50/30">
                  <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-white max-w-[10rem] truncate" title={r.name}>{r.name}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold sticky left-0 bg-white">{r.total.toLocaleString()}</td>
                  {d.months.map(m => {
                    const v = r.by_month[m] || 0
                    return <td key={m} className="px-2 py-1.5 text-center font-mono text-xs tabular-nums" style={{ background: shade(v) }} title={`${r.name} · ${m}：${v} 卡日`}>{v || ''}</td>
                  })}
                </tr>
              ))}
              <tr className="border-t-2 bg-gray-50 text-xs font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-gray-50">每月卡日</td>
                <td className="px-3 py-2 text-right font-mono sticky left-0 bg-gray-50">{(d.total_card_days || 0).toLocaleString()}</td>
                {d.months.map(m => <td key={m} className="px-2 py-2 text-center font-mono">{(d.month_totals[m] || 0).toLocaleString()}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 出行路徑分析：外層＝國家集合（不分順序），展開＝各種順序的路徑 ──
interface PathData {
  rows: { label: string; stops: number; plans: number; cards: number; pct: number; path_count: number
    paths: { label: string; plans: number; cards: number; pct: number; top_sku: string }[] }[]
  total_combos: number; matched_plans: number; total_plans: number; min_stops: number
  stops_dist: { stops: number; plans: number }[]
}
function TravelPath() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [d, setD] = useState<PathData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [minStops, setMinStops] = useState(2)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const p = new URLSearchParams({ today, min_stops: String(minStops) })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (search) p.set('search', search)
        if (excludeLegacy) p.set('exclude_legacy', '1')
        const res = await fetch(`/api/admin/stats/travel-path?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [minStops, excludeLegacy])

  function exportCsv() {
    if (!d) return
    const head = '國家集合,順序路徑,站數,方案數,卡數,組內占比%,主要方案'
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines: string[] = []
    for (const r of d.rows) for (const pt of r.paths) lines.push([r.label, pt.label, r.stops, pt.plans, pt.cards, pt.pct, pt.top_sku].map(esc).join(','))
    const blob = new Blob(['﻿' + head + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'travel-path.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const maxPlans = d && d.rows.length ? d.rows[0].plans : 1

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_plans（方案啟用～到期窗口）＋ card_usage_daily。',
        '對每個方案（ICCID×子訂單）：把窗口內有流量的國家「依首次出現日期」排序（同日則用量大者在前）＝一條順序路徑。',
        '例：6/29 日本、6/30 日本+韓國、7/1 韓國+香港 → 路徑「日本 → 韓國 → 香港」。',
        '外層＝國家集合（不分順序，如 丹麥/瑞典/挪威/芬蘭 視為同一組）；展開才看該集合內各種順序的路徑。',
        '方案數＝走此集合/路徑的方案筆數；外層占比＝該集合 ÷ 符合站數門檻的方案數；子列占比＝該路徑 ÷ 該集合方案數。',
        '「最少站數」預設 2（只看有移動的行程）；設 1 會含只到一國的行程。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">出行路徑 · 外層看去了哪幾國（不分順序），展開看實際玩法順序</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="搜尋含某國" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40" />
          <select value={minStops} onChange={e => setMinStops(Number(e.target.value))} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>最少 {n} 國</option>)}
          </select>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="啟用" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!d?.rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {!loading && d && (
        <p className="mt-3 text-xs text-gray-500">
          方案總數 {d.total_plans.toLocaleString()} · 符合「最少 {d.min_stops} 國」{d.matched_plans.toLocaleString()} 案 · 不同國家集合 {d.total_combos.toLocaleString()} 種{d.total_combos > d.rows.length ? `（顯示前 ${d.rows.length}）` : ''}
        </p>
      )}

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : d.rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">此條件下無路徑（試著把「最少 N 國」調低）</p>
      ) : (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">國家集合 / 順序路徑</th>
                <th className="px-3 py-2 text-right border-b">站數</th>
                <th className="px-3 py-2 text-right border-b">方案數</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-left border-b">主要方案</th>
                <th className="px-3 py-2 text-left border-b w-40">占比</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => {
                const key = `${r.label}-${i}`
                const open = expanded.has(key)
                const canExpand = r.paths.length > 0
                const maxPath = r.paths.length ? r.paths[0].plans : 1
                return (
                <Fragment key={key}>
                <tr className={`border-b hover:bg-gray-50 ${canExpand ? 'cursor-pointer' : ''}`}
                  onClick={() => canExpand && setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })}>
                  <td className="px-3 py-2 text-gray-400">
                    <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{i + 1}</span>
                  </td>
                  <td className="px-3 py-2">{r.label}<span className="ml-2 text-xs text-gray-400">（{r.path_count} 種順序）</span></td>
                  <td className="px-3 py-2 text-right font-mono">{r.stops}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{r.plans.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">—</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden"><div className="h-full bg-indigo-500 rounded" style={{ width: `${maxPlans ? (r.plans / maxPlans) * 100 : 0}%` }} /></div>
                      <span className="text-xs text-gray-500 w-10 text-right">{r.pct}%</span>
                    </div>
                  </td>
                </tr>
                {open && r.paths.map((pt, pi) => (
                  <tr key={`${key}-${pi}`} className="border-b bg-gray-50/60 text-xs text-gray-600">
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 pl-8">└ {pt.label}</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 text-right font-mono">{pt.plans.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{pt.cards.toLocaleString()}</td>
                    <td className="px-3 py-1.5 max-w-xs truncate text-gray-500" title={pt.top_sku}>{pt.top_sku}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded h-1.5 overflow-hidden"><div className="h-full bg-indigo-400 rounded" style={{ width: `${maxPath ? (pt.plans / maxPath) * 100 : 0}%` }} /></div>
                        <span className="w-10 text-right">{pt.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 日均量：每卡「平均每日用量」的 100MB 級距分佈（匯總／一般／吃到飽）──
interface DailyAvgData {
  rows: { mb: number; all: number; general: number; unlimited: number }[]
  day_rows: { day: number; label: string; all: number; general: number; unlimited: number }[]
  total_cards: number; general_cards: number; unlimited_cards: number
  avg_all_mb: number; avg_general_mb: number; avg_unlimited_mb: number
  avg_days_all: number; avg_days_general: number; avg_days_unlimited: number
}
function DailyAvgAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [sub, setSub] = useState<'all' | 'general' | 'unlimited'>('all')
  const [d, setD] = useState<DailyAvgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [step, setStep] = useState(100)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams({ step: String(step) })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (excludeLegacy) p.set('exclude_legacy', '1')
    const res = await fetch(`/api/admin/stats/daily-avg?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy, step])

  const rows = d?.rows || []
  const key = sub
  const maxV = rows.length ? Math.max(1, ...rows.map(r => r[key])) : 1
  const totalSel = sub === 'all' ? (d?.total_cards || 0) : sub === 'general' ? (d?.general_cards || 0) : (d?.unlimited_cards || 0)
  const color = sub === 'unlimited' ? 'bg-emerald-500' : sub === 'general' ? 'bg-blue-500' : 'bg-violet-500'
  const fmtMb = (mb: number) => mb >= 1000 ? `${(mb / 1000).toFixed(mb % 1000 ? 1 : 0)}G` : `${mb}M`

  function exportCsv() {
    if (!d) return
    const head = '日均量級距MB,匯總卡數,一般,吃到飽'
    const esc = (v: unknown) => String(v ?? '')
    const body = d.rows.map(r => [r.mb, r.all, r.general, r.unlimited].map(esc).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'daily-avg.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_usage_daily（有流量）＋ card_plans（iccid→SKU）＋ sku_meta（吃到飽標註）。',
        '每張卡「日均量」＝總用量 ÷ 有流量天數，往上進位到級距（70→100、120→200）。',
        '級距寬度：≤3G 每 100MB、>3G 每 1G；柱狀圖為卡數分佈。',
        '匯總＝所有卡；一般＝SKU 未標吃到飽；吃到飽＝SKU 已在「方案列表」標為吃到飽。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([['all', '匯總'], ['general', '一般'], ['unlimited', '吃到飽']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSub(k)} className={`px-3 py-1.5 text-sm rounded-md ${sub === k ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={step} onChange={e => setStep(Number(e.target.value))} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            {[[100, '級距 100MB'], [200, '級距 200MB'], [500, '級距 500MB'], [1000, '級距 1GB']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="用量日" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">此分類卡數</div><div className="mt-1 text-2xl font-bold">{totalSel.toLocaleString()}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">匯總 / 一般 / 吃到飽</div><div className="mt-1 text-lg font-bold">{d.total_cards.toLocaleString()} / {d.general_cards.toLocaleString()} / {d.unlimited_cards.toLocaleString()}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">整體平均日均量</div><div className="mt-1 text-2xl font-bold">{fmtMb(d.avg_all_mb)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">一般平均</div><div className="mt-1 text-2xl font-bold text-blue-600">{fmtMb(d.avg_general_mb)}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">吃到飽平均</div><div className="mt-1 text-2xl font-bold text-emerald-600">{fmtMb(d.avg_unlimited_mb)}</div></div>
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">日均量分佈（≤3G每{step >= 1000 ? '1G' : step + 'M'} · &gt;3G每1G · {sub === 'all' ? '匯總' : sub === 'general' ? '一般' : '吃到飽'}）</h3>
            {rows.length === 0 ? <p className="text-sm text-gray-400">無資料（先到「方案列表」標註吃到飽、並同步方案）</p> : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1 min-w-max border-b border-gray-200" style={{ height: 256 }}>
                  {rows.map(r => {
                    const v = r[key]
                    const h = v > 0 ? Math.max(2, Math.round((v / maxV) * 240)) : 0
                    return (
                      <div key={r.mb} className="flex flex-col items-center justify-end w-8 group" title={`≤${fmtMb(r.mb)}：${v} 卡`}>
                        <span className="text-[10px] text-gray-500 mb-0.5 opacity-0 group-hover:opacity-100">{v}</span>
                        <div className={`w-5 ${color} rounded-t`} style={{ height: h }} />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 min-w-max mt-1">
                  {rows.map(r => <div key={r.mb} className="w-8 text-center text-[9px] text-gray-400">{fmtMb(r.mb)}</div>)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── 使用天數：每卡「有流量天數」的分佈（1~30 天、>30）──
function DaysAnalysis() {
  const excludeLegacy = useContext(ExcludeLegacyCtx)
  const [sub, setSub] = useState<'all' | 'general' | 'unlimited'>('all')
  const [d, setD] = useState<DailyAvgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (excludeLegacy) p.set('exclude_legacy', '1')
    const res = await fetch(`/api/admin/stats/daily-avg?${p}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excludeLegacy])

  const rows = d?.day_rows || []
  const key = sub
  const maxV = rows.length ? Math.max(1, ...rows.map(r => r[key])) : 1
  const totalSel = sub === 'all' ? (d?.total_cards || 0) : sub === 'general' ? (d?.general_cards || 0) : (d?.unlimited_cards || 0)
  const avgDays = d ? (sub === 'all' ? d.avg_days_all : sub === 'general' ? d.avg_days_general : d.avg_days_unlimited) : 0
  const color = sub === 'unlimited' ? 'bg-emerald-500' : sub === 'general' ? 'bg-blue-500' : 'bg-violet-500'

  function exportCsv() {
    if (!d) return
    const head = '使用天數,匯總卡數,一般,吃到飽'
    const body = d.day_rows.map(r => [r.label, r.all, r.general, r.unlimited].join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'usage-days.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <LogicNote items={[
        '資料來源：card_usage_daily（有流量）＋ card_plans（iccid→SKU）＋ sku_meta（吃到飽標註）。',
        '每張卡「使用天數」＝有流量的不重複日期數；柱狀圖 1~30 天，超過 30 天併入「30+」。',
        '匯總＝所有卡；一般＝SKU 未標吃到飽；吃到飽＝SKU 已標吃到飽。',
      ]} />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([['all', '匯總'], ['general', '一般'], ['unlimited', '吃到飽']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSub(k)} className={`px-3 py-1.5 text-sm rounded-md ${sub === k ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="用量日" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">此分類卡數</div><div className="mt-1 text-2xl font-bold">{totalSel.toLocaleString()}</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">平均使用天數</div><div className={`mt-1 text-2xl font-bold ${color.replace('bg-', 'text-')}`}>{avgDays} 天</div></div>
            <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">整體 / 一般 / 吃到飽 均天數</div><div className="mt-1 text-lg font-bold">{d.avg_days_all} / {d.avg_days_general} / {d.avg_days_unlimited} 天</div></div>
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">使用天數分佈（1~30 天 · &gt;30 · {sub === 'all' ? '匯總' : sub === 'general' ? '一般' : '吃到飽'}）</h3>
            {rows.length === 0 ? <p className="text-sm text-gray-400">無資料</p> : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1 min-w-max border-b border-gray-200" style={{ height: 256 }}>
                  {rows.map(r => {
                    const v = r[key]
                    const h = v > 0 ? Math.max(2, Math.round((v / maxV) * 240)) : 0
                    return (
                      <div key={r.day} className="flex flex-col items-center justify-end w-8 group" title={`${r.label} 天：${v} 卡`}>
                        <span className="text-[10px] text-gray-500 mb-0.5 opacity-0 group-hover:opacity-100">{v}</span>
                        <div className={`w-5 ${color} rounded-t`} style={{ height: h }} />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 min-w-max mt-1">
                  {rows.map(r => <div key={r.day} className="w-8 text-center text-[9px] text-gray-400">{r.label}</div>)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
