'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, AlertTriangle } from 'lucide-react'

interface Row {
  sku_id: string; sku_name: string; plans: number; cards: number
  plan_type_label: string | null; in_bc: boolean; is_unlimited: boolean; tagged: boolean; name_hint_unlimited: boolean
  daily_gb: number | null; family_id: string | null; family_auto: string; family_eff: string; is_base: boolean; is_base_system: boolean
  accel_sku_id: string | null; accel_name: string | null; accel_price: number | null
  product_id: string | null; product_name: string | null
}
interface AccelOption { sku_id: string; name: string; accelerate_price: number; high_flow_size: string | null }

const gbLabel = (g: number | null) => g == null ? '—' : g >= 1 ? `${g}G` : `${Math.round(g * 1000)}M`

export default function SkuListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState({ total_skus: 0, missing_in_bc: 0, unlimited_count: 0 })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'flat' | 'group'>('flat')
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [excludeLegacy, setExcludeLegacy] = useState(true)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (only) p.set('only', only)
    if (excludeLegacy) p.set('exclude_legacy', '1')
    const res = await fetch(`/api/admin/stats/sku-list?${p}`)
    if (res.ok) { const d = await res.json(); setRows(d.rows || []); setSummary({ total_skus: d.total_skus || 0, missing_in_bc: d.missing_in_bc || 0, unlimited_count: d.unlimited_count || 0 }) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [only, excludeLegacy])

  async function toggleUnlimited(r: Row, val: boolean) {
    setSaving(r.sku_id)
    setRows(prev => prev.map(x => x.sku_id === r.sku_id ? { ...x, is_unlimited: val, tagged: true } : x))
    await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_id: r.sku_id, sku_name: r.sku_name, is_unlimited: val }),
    })
    setSaving(null)
  }

  // 平面清單：設定該列的組別(family_id) / 基礎(is_base)
  async function saveAssign(r: Row, family_id: string, is_base: boolean) {
    const fid = family_id.trim()
    setSaving(r.sku_id)
    setRows(prev => prev.map(x => x.sku_id === r.sku_id ? { ...x, family_id: fid || null, is_base: fid ? is_base : false, tagged: true } : x))
    await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assign: [{ sku_id: r.sku_id, family_id: fid, is_base, sku_name: r.sku_name }] }),
    })
    setSaving(null)
  }

  // 系統組別（product_id）的基礎：只動 is_base_system，與自訂分組的 is_base 獨立
  async function saveSystemBase(members: Row[], baseSkuId: string) {
    setSaving(baseSkuId)
    const ids = new Set(members.map(m => m.sku_id))
    setRows(prev => prev.map(x => ids.has(x.sku_id) ? { ...x, is_base_system: x.sku_id === baseSkuId, tagged: true } : x))
    await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_base: members.map(m => ({ sku_id: m.sku_id, is_base_system: m.sku_id === baseSkuId, sku_name: m.sku_name })) }),
    })
    setSaving(null)
  }

  // 自訂分組：把手動組別號重新壓成連續 1,2,3…（保留各組基礎）
  async function renumber() {
    const nums = [...new Set(rows.filter(r => r.family_id).map(r => r.family_id!))]
      .sort((a, b) => { const na = Number(a), nb = Number(b); if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb; return a < b ? -1 : 1 })
    if (nums.length === 0) return
    const map = new Map(nums.map((g, i) => [g, String(i + 1)]))
    const assign = rows.filter(r => r.family_id).map(r => ({ sku_id: r.sku_id, family_id: map.get(r.family_id!)!, is_base: r.is_base, sku_name: r.sku_name }))
    setSaving('__renumber__')
    setRows(prev => prev.map(x => x.family_id ? { ...x, family_id: map.get(x.family_id)!, family_eff: map.get(x.family_id)! } : x))
    await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assign }),
    })
    setSaving(null)
  }

  // 為基礎方案人工選定加速包
  async function saveAccel(r: Row, opt: AccelOption | null) {
    setSaving(r.sku_id)
    setRows(prev => prev.map(x => x.sku_id === r.sku_id ? { ...x, accel_sku_id: opt?.sku_id ?? null, accel_name: opt?.name ?? null, accel_price: opt?.accelerate_price ?? null } : x))
    await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accel: { sku_id: r.sku_id, accel_sku_id: opt?.sku_id ?? null, sku_name: r.sku_name } }),
    })
    setSaving(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">方案列表</h1>
          <p className="mt-1 text-sm text-gray-500">標註「吃到飽」供日均量分群 · 檢核沒對到 BC 的 SKU · 群組檢視可把同系列拉一組並指定「1GB 基礎方案」（供成本重算）</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setView('flat')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'flat' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>自訂分組</button>
          <button onClick={() => setView('group')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'group' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>系統組別</button>
        </div>
      </div>

      <div className="mt-4 flex gap-4 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">使用的 SKU 種類</div><div className="mt-1 text-2xl font-bold">{summary.total_skus.toLocaleString()}</div></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">已標吃到飽</div><div className="mt-1 text-2xl font-bold text-emerald-600">{summary.unlimited_count.toLocaleString()}</div></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">沒對到 BC 商品</div><div className={`mt-1 text-2xl font-bold ${summary.missing_in_bc ? 'text-rose-600' : ''}`}>{summary.missing_in_bc.toLocaleString()}</div></div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="搜尋 SKU 名稱 / ID" className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-72" />
        </div>
        {view === 'flat' && (
          <select value={only} onChange={e => setOnly(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部</option>
            <option value="missing">只看沒對到 BC</option>
            <option value="unlimited">只看吃到飽</option>
            <option value="untagged">只看未標註</option>
            <option value="grouped">只看已分組</option>
            <option value="ungrouped">只看未分組（非吃到飽）</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={excludeLegacy} onChange={e => setExcludeLegacy(e.target.checked)} /> 排除舊SIMPOMATION
        </label>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
        {view === 'flat' && <button onClick={renumber} disabled={saving === '__renumber__'} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50" title="把自訂組別號重新壓成連續 1,2,3…">重新編號</button>}
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <FlatTable mode={view === 'group' ? 'system' : 'custom'} rows={rows} saving={saving} onToggle={toggleUnlimited} onAssign={saveAssign} onAccel={saveAccel} onSystemBase={saveSystemBase} />
      )}
    </div>
  )
}

function FlatTable({ mode, rows, saving, onToggle, onAssign, onAccel, onSystemBase }: { mode: 'custom' | 'system'; rows: Row[]; saving: string | null; onToggle: (r: Row, v: boolean) => void; onAssign: (r: Row, family_id: string, is_base: boolean) => void; onAccel: (r: Row, opt: AccelOption | null) => void; onSystemBase: (members: Row[], baseSkuId: string) => void }) {
  // 自訂分組＝依 family_eff（手動組別優先）；系統組別＝依 family_auto（product_id）
  const groups = useMemo(() => {
    const keyOf = (r: Row) => mode === 'system' ? r.family_auto : r.family_eff
    const m = new Map<string, Row[]>()
    for (const r of rows) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return Array.from(m.entries()).map(([key, items]) => ({
      key, items: items.sort((a, b) => (a.daily_gb ?? 99) - (b.daily_gb ?? 99) || b.plans - a.plans),
      cards: items.reduce((s, i) => s + i.cards, 0),
      plans: items.reduce((s, i) => s + i.plans, 0),
      grouped: items.some(i => i.family_id),
      label: items.find(i => i.product_name)?.product_name || key,
    })).sort((a, b) => {
      // 自訂分組：手動組別號依數字連續在前，其餘依方案數
      if (mode === 'custom') {
        const na = Number(a.key), nb = Number(b.key), an = !isNaN(na), bn = !isNaN(nb)
        if (an && bn && na !== nb) return na - nb
        if (an !== bn) return an ? -1 : 1
      }
      return b.plans - a.plans
    })
  }, [rows, mode])

  if (groups.length === 0) return <p className="mt-8 text-sm text-gray-400">無資料（先到方案統計明細列表同步方案）</p>
  return (
    <div className="mt-4 space-y-3">
      {groups.map(g => {
        const members = g.items
        // 系統組別首次（該組還沒設過系統基礎）→ 先沿用自訂分組的基礎當預設
        const groupHasSysBase = members.some(m => m.is_base_system)
        const isBaseOf = (r: Row) => mode === 'system' ? (groupHasSysBase ? r.is_base_system : r.is_base) : r.is_base
        return (
        <div key={g.key} className={`bg-white border rounded-xl overflow-hidden ${g.grouped ? 'border-emerald-300' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/60 border-b border-emerald-100 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate max-w-lg" title={g.label}>{g.label}</span>
            <span className="text-xs text-gray-400">{members.length} SKU · {g.cards.toLocaleString()} 卡</span>
            {g.grouped && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">已分組</span>}
            <span className="ml-auto font-mono text-[10px] text-gray-400">{g.key}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {['組別', 'SKU 名稱', 'SKU ID', '類型', '每日', '方案數', '卡數', 'BC', '吃到飽', '基礎', '加速包'].map((h, k) => (
                    <th key={h} className={`px-3 py-1.5 border-b font-normal ${k >= 5 && k <= 6 ? 'text-right' : k === 1 || k === 2 || k === 3 ? 'text-left' : 'text-center'} ${k === 0 ? 'w-16' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(r => (
                  <tr key={r.sku_id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-center">
                      {mode === 'system' ? (
                        <span className="font-mono text-[10px] text-gray-400" title="BC product_id（系統分類，不可編輯）">{r.product_id || '—'}</span>
                      ) : (
                        <input type="number" min={1} defaultValue={r.family_id ?? ''} key={`${r.sku_id}:${r.family_id ?? ''}`}
                          disabled={saving === r.sku_id}
                          onBlur={e => { const v = e.target.value.trim(); if (v !== (r.family_id ?? '')) onAssign(r, v, r.is_base) }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          placeholder="—" title="改成不同數字即可搬到別組" className="w-12 px-1 py-1 border border-gray-200 rounded text-center text-xs" />
                      )}
                    </td>
                    <td className="px-3 py-1.5 max-w-md truncate" title={r.sku_name}>{r.sku_name}
                      {r.name_hint_unlimited && !r.is_unlimited && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">名稱疑似吃到飽</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-400">{r.sku_id}</td>
                    <td className="px-3 py-1.5">{r.plan_type_label ? <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.plan_type_label === '單日型' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{r.plan_type_label}</span> : '—'}</td>
                    <td className={`px-3 py-1.5 text-center text-xs ${r.daily_gb === 1 ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>{gbLabel(r.daily_gb)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{r.plans.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.cards.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-center">{r.in_bc ? <span className="text-emerald-600 text-xs">✓</span> : <span className="inline-flex items-center gap-1 text-rose-600 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> 缺</span>}</td>
                    <td className="px-3 py-1.5 text-center">
                      <input type="checkbox" checked={r.is_unlimited} disabled={saving === r.sku_id} onChange={e => onToggle(r, e.target.checked)} />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {mode === 'system' ? (
                        <input type="radio" name={`sysbase-${g.key}`} checked={isBaseOf(r)} disabled={saving === r.sku_id}
                          title={groupHasSysBase ? '設為該 product_id 組的 1GB 基礎方案（與自訂分組獨立）' : '首次沿用自訂分組的基礎；點選即改為系統組別自己的基礎'}
                          onChange={() => onSystemBase(members, r.sku_id)} />
                      ) : (
                        <input type="checkbox" checked={r.is_base} disabled={saving === r.sku_id || !r.family_id}
                          title={!r.family_id ? '先填組別數字' : '設為該組的 1GB 基礎方案'}
                          onChange={e => onAssign(r, r.family_id ?? '', e.target.checked)} />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {isBaseOf(r) ? <AccelPicker row={r} disabled={saving === r.sku_id} onSelect={opt => onAccel(r, opt)} /> : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )
      })}
    </div>
  )
}

// 為基礎方案人工挑選加速包（F056 同步下來的 accel_prices）
function AccelPicker({ row, disabled, onSelect }: { row: Row; disabled: boolean; onSelect: (opt: AccelOption | null) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState<AccelOption[]>([])
  const [loading, setLoading] = useState(false)

  async function search(term: string) {
    setLoading(true)
    const res = await fetch(`/api/admin/stats/sku-list?accel_options=1&q=${encodeURIComponent(term)}`)
    if (res.ok) { const d = await res.json(); setOpts(d.options || []) }
    setLoading(false)
  }
  function toggle() {
    const nx = !open; setOpen(nx)
    if (nx) { const seed = (row.sku_name || '').split('-')[0] || ''; setQ(seed); search(seed) }
  }

  return (
    <div className="relative">
      <button onClick={toggle} disabled={disabled} className={`text-xs px-2 py-1 rounded border ${row.accel_sku_id ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'} max-w-[13rem] truncate`} title={row.accel_name || '選加速包'}>
        {row.accel_sku_id ? `${row.accel_name?.slice(0, 14) || '已選'}… ¥${row.accel_price}` : '選加速包'}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <input value={q} autoFocus onChange={e => { setQ(e.target.value) }} onKeyDown={e => e.key === 'Enter' && search(q)}
              placeholder="搜尋加速包名稱（先按同步F056）" className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs" />
            <button onClick={() => search(q)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">搜</button>
            {row.accel_sku_id && <button onClick={() => { onSelect(null); setOpen(false) }} className="px-2 py-1 border rounded text-xs text-rose-600">清除</button>}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? <p className="text-xs text-gray-400 p-2">搜尋中…</p> : opts.length === 0 ? <p className="text-xs text-gray-400 p-2">無結果（記得先在成本重算頁按「同步加速包價格 F056」）</p> : opts.map(o => (
              <button key={o.sku_id} onClick={() => { onSelect(o); setOpen(false) }}
                className="block w-full text-left px-2 py-1.5 rounded hover:bg-violet-50 text-xs border-b border-gray-50">
                <span className="text-gray-700">{o.name}</span>
                <span className="ml-2 font-mono text-violet-600">¥{o.accelerate_price}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
