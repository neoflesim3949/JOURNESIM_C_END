'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, AlertTriangle, Check } from 'lucide-react'

interface Row {
  sku_id: string; sku_name: string; plans: number; cards: number
  plan_type_label: string | null; in_bc: boolean; is_unlimited: boolean; tagged: boolean; name_hint_unlimited: boolean
  daily_gb: number | null; family_id: string | null; family_auto: string; family_eff: string; is_base: boolean
  accel_sku_id: string | null; accel_name: string | null; accel_price: number | null
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
  const [onlyMulti, setOnlyMulti] = useState(true)
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
          <button onClick={() => setView('flat')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'flat' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>平面清單</button>
          <button onClick={() => setView('group')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'group' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>群組檢視（設基礎）</button>
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
        {view === 'group' && (
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={onlyMulti} onChange={e => setOnlyMulti(e.target.checked)} /> 只顯示有多種每日GB的群組
          </label>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={excludeLegacy} onChange={e => setExcludeLegacy(e.target.checked)} /> 排除舊SIMPOMATION
        </label>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        view === 'flat' ? <FlatTable rows={rows} saving={saving} onToggle={toggleUnlimited} onAssign={saveAssign} onAccel={saveAccel} /> : <GroupView rows={rows} onlyMulti={onlyMulti} onSaved={load} />
      )}
    </div>
  )
}

function FlatTable({ rows, saving, onToggle, onAssign, onAccel }: { rows: Row[]; saving: string | null; onToggle: (r: Row, v: boolean) => void; onAssign: (r: Row, family_id: string, is_base: boolean) => void; onAccel: (r: Row, opt: AccelOption | null) => void }) {
  // 同組別數字自動靠一起，並圈成一個「筐」：有組別的排前面（依組別、再依每日GB），其餘依方案數
  const items = useMemo(() => {
    const num = (v: string | null) => { const n = Number(v); return v && !isNaN(n) ? n : null }
    const arr = [...rows].sort((a, b) => {
      const ga = a.family_id, gb = b.family_id
      if (ga && gb) {
        const na = num(ga), nb = num(gb)
        if (na != null && nb != null) { if (na !== nb) return na - nb } else if (ga !== gb) return ga < gb ? -1 : 1
        return (a.daily_gb ?? 99) - (b.daily_gb ?? 99)
      }
      if (ga && !gb) return -1
      if (!ga && gb) return 1
      return b.plans - a.plans
    })
    let band = -1
    return arr.map((r, i) => {
      const g = r.family_id
      const prev = arr[i - 1], next = arr[i + 1]
      const gStart = !!g && (!prev || prev.family_id !== g)
      const gEnd = !!g && (!next || next.family_id !== g)
      if (gStart) band++
      return { r, inGroup: !!g, gStart, gEnd, band, size: 0 }
    })
  }, [rows])

  // 每組筆數（顯示在該組第一列）
  const sizeByFam = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) if (it.r.family_id) m.set(it.r.family_id, (m.get(it.r.family_id) || 0) + 1)
    return m
  }, [items])

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
        <thead className="bg-gray-50 text-xs">
          <tr>
            {['#', '組別', 'SKU 名稱', 'SKU ID', '類型', '每日', '方案數', '卡數', 'BC 對照', '吃到飽', '基礎', '加速包(基礎組)'].map((h, k) => (
              <th key={h} className={`px-3 py-2 border-b ${k >= 6 && k <= 7 ? 'text-right' : k === 2 || k === 3 || k === 4 ? 'text-left' : 'text-center'} ${k === 0 ? 'w-10' : ''} ${k === 1 ? 'w-20' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">無資料（先到方案統計明細列表同步方案）</td></tr>
          ) : items.map(({ r, inGroup, gStart, gEnd, band }, i) => {
            // 組框邊：整組左右色條、頭尾上下框、交錯底色
            const frame = inGroup ? (band % 2 === 0 ? 'bg-blue-50/50' : 'bg-indigo-50/40') : (!r.in_bc ? 'bg-rose-50/40' : '')
            const top = gStart ? 'border-t-2 border-t-blue-300' : 'border-t border-t-gray-100'
            const bot = gEnd ? 'border-b-2 border-b-blue-300' : ''
            const td = `px-3 py-2 ${frame} ${top} ${bot}`
            const first = inGroup ? 'border-l-4 border-l-blue-400' : ''
            const last = inGroup ? 'border-r-2 border-r-blue-300' : ''
            return (
            <tr key={r.sku_id} className="hover:brightness-95">
              <td className={`${td} ${first} text-gray-400`}>{i + 1}</td>
              <td className={`${td} text-center`}>
                <div className="flex items-center justify-center gap-1">
                  <input type="number" min={1} defaultValue={r.family_id ?? ''} key={`${r.sku_id}:${r.family_id ?? ''}`}
                    disabled={saving === r.sku_id}
                    onBlur={e => { const v = e.target.value.trim(); if (v !== (r.family_id ?? '')) onAssign(r, v, r.is_base) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    placeholder="—" className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-sm bg-white" />
                  {gStart && <span className="text-[10px] text-blue-500 font-medium">×{sizeByFam.get(r.family_id!) || 1}</span>}
                </div>
              </td>
              <td className={`${td} max-w-md truncate`} title={r.sku_name}>{r.sku_name}
                {r.name_hint_unlimited && !r.is_unlimited && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">名稱疑似吃到飽</span>}
              </td>
              <td className={`${td} font-mono text-xs text-gray-500`}>{r.sku_id}</td>
              <td className={td}>{r.plan_type_label ? <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.plan_type_label === '單日型' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{r.plan_type_label}</span> : '—'}</td>
              <td className={`${td} text-center text-xs ${r.daily_gb === 1 ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>{gbLabel(r.daily_gb)}</td>
              <td className={`${td} text-right font-mono font-semibold`}>{r.plans.toLocaleString()}</td>
              <td className={`${td} text-right font-mono`}>{r.cards.toLocaleString()}</td>
              <td className={`${td} text-center`}>
                {r.in_bc ? <span className="text-emerald-600 text-xs">✓</span> : <span className="inline-flex items-center gap-1 text-rose-600 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> 缺</span>}
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" checked={r.is_unlimited} disabled={saving === r.sku_id} onChange={e => onToggle(r, e.target.checked)} />
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" checked={r.is_base} disabled={saving === r.sku_id || !r.family_id} title={!r.family_id ? '先填組別' : '設為該組的 1GB 基礎方案'}
                  onChange={e => onAssign(r, r.family_id ?? '', e.target.checked)} />
              </td>
              <td className={`${td} ${last}`}>
                {r.is_base ? <AccelPicker row={r} disabled={saving === r.sku_id} onSelect={opt => onAccel(r, opt)} /> : <span className="text-gray-300 text-xs">—</span>}
              </td>
            </tr>
          )})}
        </tbody>
      </table>
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

function GroupView({ rows, onlyMulti, onSaved }: { rows: Row[]; onlyMulti: boolean; onSaved: () => void }) {
  // 依 family_eff 分組（排除吃到飽）
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      if (r.is_unlimited) continue
      const k = r.family_eff
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    let arr = Array.from(m.entries()).map(([key, items]) => {
      const gbs = new Set(items.map(i => i.daily_gb).filter(g => g != null))
      const cards = items.reduce((s, i) => s + i.cards, 0)
      return { key, items: items.sort((a, b) => (a.daily_gb ?? 99) - (b.daily_gb ?? 99)), gbCount: gbs.size, cards, grouped: items.some(i => i.family_id) }
    })
    if (onlyMulti) arr = arr.filter(g => g.gbCount > 1)
    return arr.sort((a, b) => b.cards - a.cards)
  }, [rows, onlyMulti])

  if (groups.length === 0) return <p className="mt-8 text-sm text-gray-400">無符合的群組（試著取消「只顯示有多種每日GB的群組」）</p>
  return (
    <div className="mt-4 space-y-3">
      {groups.map(g => <GroupCard key={g.key} groupKey={g.key} items={g.items} cards={g.cards} grouped={g.grouped} onSaved={onSaved} />)}
    </div>
  )
}

function GroupCard({ groupKey, items, cards, grouped, onSaved }: { groupKey: string; items: Row[]; cards: number; grouped: boolean; onSaved: () => void }) {
  const initialBase = items.find(i => i.is_base)?.sku_id
    || items.find(i => i.daily_gb != null && Math.abs(i.daily_gb - 1) < 0.01)?.sku_id
    || ''
  const [base, setBase] = useState(initialBase)
  const [gkey, setGkey] = useState(groupKey)
  const [keys, setKeys] = useState<Record<string, string>>(() => Object.fromEntries(items.map(i => [i.sku_id, groupKey])))
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const has1G = items.some(i => i.daily_gb != null && Math.abs(i.daily_gb - 1) < 0.01)

  function applyAll() { setKeys(Object.fromEntries(items.map(i => [i.sku_id, gkey]))) }

  async function save() {
    setSaving(true); setDone(false)
    const assign = items.map(i => ({ sku_id: i.sku_id, family_id: (keys[i.sku_id] || gkey).trim() || groupKey, is_base: i.sku_id === base, sku_name: i.sku_name }))
    const res = await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assign }),
    })
    setSaving(false)
    if (res.ok) { setDone(true); setTimeout(onSaved, 600) }
  }

  return (
    <div className={`bg-white border rounded-xl p-4 ${grouped ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <input value={gkey} onChange={e => setGkey(e.target.value)} title="群組鍵"
            className="font-mono text-xs px-2 py-1 border border-gray-200 rounded w-[26rem] max-w-full text-gray-600" />
          <button onClick={applyAll} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 shrink-0" title="把此鍵套用到全組所有列（可用來合併／改名整組）">套用全組</button>
          <span className="text-xs text-gray-400 shrink-0">{items.length} SKU · {cards.toLocaleString()} 卡</span>
          {grouped && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">已分組</span>}
          {!has1G && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">無 1GB 版本</span>}
        </div>
        <button onClick={save} disabled={saving} className={`px-3 py-1.5 text-sm rounded-lg text-white ${done ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 flex items-center gap-1.5`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : null}{done ? '已儲存' : '儲存'}
        </button>
      </div>
      <table className="w-full text-sm mt-3">
        <tbody>
          {items.map(r => {
            const moved = (keys[r.sku_id] || gkey).trim() !== gkey.trim()
            return (
              <tr key={r.sku_id} className={`border-t hover:bg-gray-50 ${moved ? 'bg-amber-50/60' : ''}`}>
                <td className="py-1.5 pr-2 w-16 text-center">
                  <label className="inline-flex items-center gap-1 cursor-pointer text-xs">
                    <input type="radio" name={`base-${groupKey}`} checked={base === r.sku_id} onChange={() => setBase(r.sku_id)} /> 基礎
                  </label>
                </td>
                <td className="py-1.5 pr-2 w-14 text-center">
                  <span className={`text-xs font-semibold ${r.daily_gb === 1 ? 'text-blue-600' : 'text-gray-500'}`}>{gbLabel(r.daily_gb)}</span>
                </td>
                <td className="py-1.5 pr-2 max-w-md truncate" title={r.sku_name}>{r.sku_name}</td>
                <td className="py-1.5 pr-2 font-mono text-[11px] text-gray-400">{r.sku_id}</td>
                <td className="py-1.5 pr-2 text-right font-mono text-xs text-gray-500">{r.cards.toLocaleString()} 卡</td>
                <td className="py-1.5 pr-2 text-center w-10">{r.in_bc ? <span className="text-emerald-600 text-xs">✓</span> : <span className="text-rose-500 text-xs" title="沒對到 BC，無成本價">缺</span>}</td>
                <td className="py-1.5 w-56">
                  <input value={keys[r.sku_id] ?? gkey} onChange={e => setKeys(k => ({ ...k, [r.sku_id]: e.target.value }))}
                    title="此列的群組鍵（改成別組的鍵即可搬過去）"
                    className={`font-mono text-[10px] px-1.5 py-1 border rounded w-full ${moved ? 'border-amber-300 text-amber-700' : 'border-gray-200 text-gray-400'}`} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
