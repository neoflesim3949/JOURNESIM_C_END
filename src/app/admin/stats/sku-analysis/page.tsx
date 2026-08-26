'use client'

import { Fragment, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Download, Search, ChevronRight, ChevronDown } from 'lucide-react'

interface Cell { total: number; esim: number; sim: number; accel: number }
interface CountryRow extends Cell { mcc: string; name: string }
interface ContRow extends Cell { name: string; countries: CountryRow[] }
interface ProdRow { product_id: string; product_name: string; versions: number; esim: number; sim: number; accel: number; countries: number }
interface Payload {
  summary: { total: number; esim: number; sim: number; accel: number; products: number; countries: number; continents: number }
  continents: ContRow[]
  countries: CountryRow[]
  products: ProdRow[]
}

const CAT = [
  { key: 'esim' as const, label: 'eSIM', color: '#2563eb' },
  { key: 'sim' as const, label: 'SIM', color: '#059669' },
  { key: 'accel' as const, label: '加速包', color: '#d97706' },
]

// 單條總量條（unique SKU 數）；eSIM/SIM/加速包 會重疊，故不堆疊，數字看右側各欄
function Bar({ row, max }: { row: Cell; max: number }) {
  return (
    <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden" title={`eSIM ${row.esim} · SIM ${row.sim} · 加速包 ${row.accel}`}>
      <div className="h-full bg-slate-400 rounded" style={{ width: `${max ? (row.total / max) * 100 : 0}%` }} />
    </div>
  )
}

export default function SkuAnalysisPage() {
  const [d, setD] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'all' | 'used'>('all')
  const [view, setView] = useState<'cat' | 'continent' | 'country' | 'product'>('cat')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 首載不同步 setState（避免 effect 內 cascading render）；重新整理／切 scope 才顯示 spinner
  async function load(sc = scope) {
    const res = await fetch(`/api/admin/stats/sku-analysis?scope=${sc}`)
    if (res.ok) setD(await res.json())
    setLoading(false)
  }
  // 依國家展開：懶載該國 SKU 清單（scope 相依，切 scope 要清快取）
  const [expandedC, setExpandedC] = useState<Set<string>>(new Set())
  type SkuItem = { sku_id: string; name: string; product_name: string | null; cats: string[]; orders: number }
  const [skusByMcc, setSkusByMcc] = useState<Record<string, SkuItem[] | 'loading'>>({})

  function pickScope(sc: 'all' | 'used') {
    if (sc === scope) return
    setScope(sc); setLoading(true)
    setExpanded(new Set()); setExpandedC(new Set()); setSkusByMcc({})
    load(sc)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function toggleExp(name: string) { setExpanded(p => { const n = new Set(p); if (n.has(name)) n.delete(name); else n.add(name); return n }) }
  async function toggleCountry(mcc: string) {
    setExpandedC(p => { const n = new Set(p); if (n.has(mcc)) n.delete(mcc); else n.add(mcc); return n })
    if (!skusByMcc[mcc]) {
      setSkusByMcc(s => ({ ...s, [mcc]: 'loading' }))
      const res = await fetch(`/api/admin/stats/sku-analysis?scope=${scope}&mcc=${encodeURIComponent(mcc)}`)
      const j = res.ok ? await res.json() : { skus: [] }
      setSkusByMcc(s => ({ ...s, [mcc]: j.skus || [] }))
    }
  }

  const nt = (n: number) => n.toLocaleString()

  function exportCsv() {
    if (!d) return
    let head = '', rows: (string | number)[][] = []
    if (view === 'continent') { head = '洲別,總SKU,eSIM,SIM,加速包'; rows = d.continents.map(r => [r.name, r.total, r.esim, r.sim, r.accel]) }
    else if (view === 'country') { head = 'MCC,國家,總SKU,eSIM,SIM,加速包'; rows = d.countries.map(r => [r.mcc, r.name, r.total, r.esim, r.sim, r.accel]) }
    else if (view === 'product') { head = 'productId,產品名稱,SKU版本數,eSIM,SIM,加速包,涵蓋國家'; rows = d.products.map(r => [r.product_id, r.product_name, r.versions, r.esim, r.sim, r.accel, r.countries]) }
    else { head = '類型,SKU數'; rows = CAT.map(c => [c.label, d.summary[c.key]]) }
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const blob = new Blob(['﻿' + head + '\n' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sku-analysis-${scope}-${view}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const kw = q.trim().toLowerCase()
  const continents = d?.continents || []
  const countries = (d?.countries || []).filter(r => !kw || r.name.toLowerCase().includes(kw) || r.mcc.toLowerCase().includes(kw))
  const products = (d?.products || []).filter(r => !kw || r.product_name.toLowerCase().includes(kw) || r.product_id.toLowerCase().includes(kw))
  const maxCont = Math.max(1, ...continents.map(r => r.total))
  const maxCtry = Math.max(1, ...countries.map(r => r.total))

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">SKU 分析</h1>
          <p className="mt-1 text-sm text-gray-500">商品目錄（bc_products）· 類型分法：eSIM / SIM / 加速包 · 維度：類型 / 洲別（可展開國家）/ 國家 / productId</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {([['all', '全部上架'], ['used', '有被使用到']] as const).map(([k, label]) => (
              <button key={k} onClick={() => pickScope(k)}
                className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap ${scope === k ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => { setLoading(true); load() }} disabled={loading} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 重新整理
          </button>
          <button onClick={exportCsv} disabled={!d} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {loading || !d ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <>
          {/* 摘要 */}
          <div className="mt-4 flex gap-4 flex-wrap">
            {([[scope === 'used' ? '有使用 SKU' : '總 SKU（上架）', d.summary.total, ''], ['eSIM', d.summary.esim, 'text-blue-600'], ['SIM', d.summary.sim, 'text-emerald-600'], ['加速包', d.summary.accel, 'text-amber-600'], ['產品數 (productId)', d.summary.products, ''], ['涵蓋國家', d.summary.countries, ''], ['涵蓋洲別', d.summary.continents, '']] as const).map(([label, val, cls]) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-500">{label}</div>
                <div className={`mt-1 text-2xl font-bold ${cls}`}>{nt(val)}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
            <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {([['cat', '依類型'], ['continent', '依洲別'], ['country', '依國家'], ['product', '依產品 (productId)']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setView(k)}
                  className={`px-3 py-1.5 text-sm rounded-md ${view === k ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
              ))}
            </div>
            {(view === 'country' || view === 'product') && (
              <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 min-w-56">
                <Search className="w-4 h-4 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={view === 'country' ? '搜尋國家 / MCC…' : '搜尋產品…'} className="flex-1 text-sm outline-none" />
              </div>
            )}
          </div>

          {/* 圖例 + 重疊說明 */}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-600 flex-wrap">
            {CAT.map(c => <span key={c.key} className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: c.color }} />{c.label}</span>)}
            <span className="text-gray-400">分法同套餐列表：可複充的實體 SIM 會同時計入 SIM 與 eSIM，故三類加總可能大於總數（灰條為 unique 總量）</span>
          </div>

          {/* 依類型 */}
          {view === 'cat' && (
            <div className="mt-3 bg-white border border-gray-200 rounded-xl p-5 max-w-2xl">
              {CAT.map(c => {
                const val = d.summary[c.key]
                const pct = d.summary.total ? Math.round((val / d.summary.total) * 1000) / 10 : 0
                return (
                  <div key={c.key} className="flex items-center gap-3 py-2">
                    <div className="w-16 text-sm font-medium">{c.label}</div>
                    <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden"><div className="h-full rounded" style={{ width: `${pct}%`, background: c.color }} /></div>
                    <div className="w-28 text-right text-sm font-mono">{nt(val)} <span className="text-gray-400">({pct}%)</span></div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 依洲別（可展開國家） */}
          {view === 'continent' && (
            <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs"><tr>
                  <th className="px-3 py-2 text-left border-b">洲別</th>
                  <th className="px-3 py-2 text-left border-b w-1/3">分佈</th>
                  <th className="px-3 py-2 text-right border-b">SKU 數</th>
                  <th className="px-3 py-2 text-right border-b text-blue-600">eSIM</th>
                  <th className="px-3 py-2 text-right border-b text-emerald-600">SIM</th>
                  <th className="px-3 py-2 text-right border-b text-amber-600">加速包</th>
                </tr></thead>
                <tbody>
                  {continents.map((r) => {
                    const open = expanded.has(r.name)
                    return (
                      <Fragment key={r.name}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleExp(r.name)}>
                          <td className="px-3 py-2 font-medium">
                            <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{r.name}<span className="text-gray-400 text-xs">（{r.countries.length} 國）</span></span>
                          </td>
                          <td className="px-3 py-2"><Bar row={r} max={maxCont} /></td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{nt(r.total)}</td>
                          <td className="px-3 py-2 text-right font-mono text-blue-600">{r.esim || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-600">{r.sim || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-600">{r.accel || '—'}</td>
                        </tr>
                        {open && r.countries.map(c => (
                          <tr key={r.name + '|' + c.mcc} className="border-b bg-sky-50/40">
                            <td className="px-3 py-1.5 pl-9"><span className="text-gray-400 font-mono text-xs mr-1">{c.mcc}</span>{c.name}</td>
                            <td className="px-3 py-1.5"><Bar row={c} max={r.total || 1} /></td>
                            <td className="px-3 py-1.5 text-right font-mono">{nt(c.total)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-blue-600">{c.esim || '—'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{c.sim || '—'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-amber-600">{c.accel || '—'}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                  {continents.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">無資料</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* 依國家（平面） */}
          {view === 'country' && (
            <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs"><tr>
                  <th className="px-3 py-2 text-left border-b">國家</th>
                  <th className="px-3 py-2 text-left border-b w-1/3">分佈</th>
                  <th className="px-3 py-2 text-right border-b">SKU 數</th>
                  <th className="px-3 py-2 text-right border-b text-blue-600">eSIM</th>
                  <th className="px-3 py-2 text-right border-b text-emerald-600">SIM</th>
                  <th className="px-3 py-2 text-right border-b text-amber-600">加速包</th>
                </tr></thead>
                <tbody>
                  {countries.map((r) => {
                    const open = expandedC.has(r.mcc)
                    const list = skusByMcc[r.mcc]
                    return (
                      <Fragment key={r.mcc}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleCountry(r.mcc)}>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}<span className="text-gray-400 font-mono text-xs">{r.mcc}</span>{r.name}</span>
                          </td>
                          <td className="px-3 py-2"><Bar row={r} max={maxCtry} /></td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{nt(r.total)}</td>
                          <td className="px-3 py-2 text-right font-mono text-blue-600">{r.esim || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-600">{r.sim || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-600">{r.accel || '—'}</td>
                        </tr>
                        {open && (
                          <tr className="border-b bg-sky-50/40">
                            <td colSpan={6} className="px-3 py-2">
                              {list === 'loading' || !list ? (
                                <span className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 載入商品…</span>
                              ) : list.length === 0 ? <span className="text-xs text-gray-400">無商品</span> : (
                                <div className="pl-6 max-h-96 overflow-auto divide-y divide-gray-100">
                                  {list.map(s => (
                                    <div key={s.sku_id} className="flex items-center gap-2 py-1 text-xs">
                                      <span className="flex gap-1 shrink-0">
                                        {CAT.filter(c => s.cats.includes(c.key)).map(c => (
                                          <span key={c.key} className="px-1.5 py-0.5 rounded text-white text-[10px]" style={{ background: c.color }}>{c.label}</span>
                                        ))}
                                      </span>
                                      <span className="truncate" title={s.name}>{s.name}</span>
                                      {s.product_name && <span className="text-gray-400 truncate">· {s.product_name}</span>}
                                      <span className="ml-auto shrink-0 font-mono tabular-nums text-gray-600" title="有用在此國家的卡數（該國有用量的卡 ∩ 此 SKU）">{s.orders > 0 ? `${nt(s.orders)} 張` : <span className="text-gray-300">0</span>}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {countries.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">無資料</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* 依產品 (productId) */}
          {view === 'product' && (
            <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs"><tr>
                  <th className="px-3 py-2 text-left border-b w-10">#</th>
                  <th className="px-3 py-2 text-left border-b">產品 (productName)</th>
                  <th className="px-3 py-2 text-left border-b">productId</th>
                  <th className="px-3 py-2 text-right border-b">SKU 版本數</th>
                  <th className="px-3 py-2 text-right border-b text-blue-600">eSIM</th>
                  <th className="px-3 py-2 text-right border-b text-emerald-600">SIM</th>
                  <th className="px-3 py-2 text-right border-b text-amber-600">加速包</th>
                  <th className="px-3 py-2 text-right border-b">涵蓋國家</th>
                </tr></thead>
                <tbody>
                  {products.map((r, i) => (
                    <tr key={r.product_id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 max-w-md truncate" title={r.product_name}>{r.product_name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.product_id}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{nt(r.versions)}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600">{r.esim || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{r.sim || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-600">{r.accel || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{nt(r.countries)}</td>
                    </tr>
                  ))}
                  {products.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">無資料</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
