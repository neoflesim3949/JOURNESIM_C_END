'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import PlanCompareModal from './plan-compare-modal'
import type { ComparePlan } from './plan-compare-table'

interface CopiesOption {
  copies: string; days: number; costCny: number; costTwd: number
}
interface CountryDetail {
  mcc: string; name_zh: string
  apn: string | null; apn_username: string | null; apn_password: string | null
  operator: string | null
}
export interface BcResult {
  sku_id: string; name: string; unit_days: number
  capacity: string; capacity_kb?: number; speed: string
  cost_cny: number; cost_twd: number
  copies_options: CopiesOption[]
  countries: string[]; country_total: number
  country_details?: CountryDetail[]
}

// ── BC 商品對應彈窗（蝦皮訂單明細 / 商品對應V2 / 套餐管理 共用）──────
// mode='match'：單選對應（onMatch）；mode='add'：勾選多個批量加入（onAdd）
export function BcMatchModal({ subtitle, onMatch, onClose, mode = 'match', title, existingSkus, onAdd, adding }: {
  subtitle?: string
  onMatch?: (skuId: string, copies: string) => void
  onClose: () => void
  mode?: 'match' | 'add'
  title?: string
  existingSkus?: Set<string>
  onAdd?: (skuIds: string[]) => void
  adding?: boolean
}) {
  const isAdd = mode === 'add'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  function toggleSel(sku: string) { setSelected(prev => { const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n }) }
  // 比較選取
  const [comparePlans, setComparePlans] = useState<ComparePlan[] | null>(null)
  async function openCompare() {
    if (selected.size === 0) return
    const res = await fetch(`/api/admin/plans/compare?skus=${[...selected].join(',')}`)
    const d = await res.json()
    setComparePlans(d.items || [])
  }
  const [countries, setCountries] = useState<{ mcc: string; name: string }[]>([])
  const [daysOpts, setDaysOpts] = useState<string[]>([])
  const [capacityOpts, setCapacityOpts] = useState<string[]>([])
  const [speedOpts, setSpeedOpts] = useState<string[]>([])
  const [selCountries, setSelCountries] = useState<string[]>([])
  const [selDays, setSelDays] = useState('')
  const [selCapacity, setSelCapacity] = useState('')
  const [selSpeed, setSelSpeed] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<BcResult[]>([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortPrice, setSortPrice] = useState<'asc' | 'desc' | null>(null)
  const [sortFlow, setSortFlow] = useState<'asc' | 'desc' | null>(null)
  function cycleFlow() { setSortPrice(null); setSortFlow(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc') }
  function cyclePrice() { setSortFlow(null); setSortPrice(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc') }

  // 國家下拉
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryQ, setCountryQ] = useState('')
  const countryRef = useRef<HTMLDivElement>(null)

  // 點擊外部關閉國家下拉
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 載入選項
  useEffect(() => {
    fetch('/api/admin/shopee/bc-search?action=options').then(r => r.json()).then(d => {
      setCountries(d.countries || [])
      setDaysOpts(d.days || [])
      setCapacityOpts(d.capacities || [])
      setSpeedOpts(d.speeds || [])
    })
  }, [])

  async function doSearch() {
    setSearching(true)
    const params = new URLSearchParams({ action: 'search' })
    if (selCountries.length > 0) params.set('countries', selCountries.join(','))
    if (selDays) params.set('days', selDays)
    if (selCapacity) params.set('capacity', selCapacity)
    if (selSpeed) params.set('speed', selSpeed)
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/shopee/bc-search?${params}`)
    if (res.ok) setResults(await res.json())
    setSearching(false)
  }

  function toggleCountry(mcc: string) {
    setSelCountries(prev => prev.includes(mcc) ? prev.filter(m => m !== mcc) : [...prev, mcc])
  }

  const filteredCountries = countryQ
    ? countries.filter(c => c.name.toLowerCase().includes(countryQ.toLowerCase()) || c.mcc.toLowerCase().includes(countryQ.toLowerCase()))
    : countries

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 標題 */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">{title || (isAdd ? '新增 BC 商品' : '對應 BC 商品')}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {isAdd && selected.size > 0 && (
              <>
                <button onClick={openCompare} disabled={selected.size < 2}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  title={selected.size < 2 ? '至少選 2 個' : ''}>
                  比較（{selected.size}）
                </button>
                <button onClick={() => onAdd?.([...selected])} disabled={adding}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {adding ? '加入中…' : `加入選取（${selected.size}）`}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* 篩選列 */}
        <div className="p-5 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {/* 國家多選 */}
            <div ref={countryRef} className="relative">
              <button type="button" onClick={() => setCountryOpen(v => !v)}
                className="w-full text-left px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
                {selCountries.length > 0 ? (
                  <span className="flex items-center gap-1 flex-wrap">
                    {selCountries.slice(0, 3).map(mcc => {
                      const c = countries.find(o => o.mcc === mcc)
                      return <span key={mcc} className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
                        {c?.name || mcc} <span className="cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleCountry(mcc) }}>×</span>
                      </span>
                    })}
                    {selCountries.length > 3 && <span className="text-xs text-gray-400">+{selCountries.length - 3}</span>}
                  </span>
                ) : <span className="text-gray-400">搜索國家或地區</span>}
              </button>
              {countryOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input value={countryQ} onChange={e => setCountryQ(e.target.value)} placeholder="搜索國家..."
                      className="w-full px-2 py-1.5 bg-gray-50 rounded text-sm" autoFocus />
                  </div>
                  {selCountries.length > 0 && (
                    <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
                      <span className="text-xs text-gray-500">已選 {selCountries.length} 個</span>
                      <button onClick={() => setSelCountries([])} className="text-xs text-blue-600 hover:underline">清除全部</button>
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto">
                    {filteredCountries.map(c => (
                      <label key={c.mcc} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm ${selCountries.includes(c.mcc) ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={selCountries.includes(c.mcc)} onChange={() => toggleCountry(c.mcc)} className="accent-blue-600" />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 天數 */}
            <select value={selDays} onChange={e => setSelDays(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">全部天數</option>
              {daysOpts.map(d => <option key={d} value={d}>{d} 天</option>)}
            </select>

            {/* 流量 */}
            <select value={selCapacity} onChange={e => setSelCapacity(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">選擇流量</option>
              {capacityOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* 限速 */}
            <select value={selSpeed} onChange={e => setSelSpeed(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">選擇限速</option>
              {speedOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="搜索套餐名稱或 SKU ID" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-xs text-gray-400 whitespace-nowrap">符合：{results.filter(r => r.copies_options.length > 0).length} 個</span>
            <button onClick={doSearch} disabled={searching}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {searching ? '搜尋中...' : '查 詢'}
            </button>
          </div>
        </div>

        {/* 結果表格 */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">輸入篩選條件後點擊查詢</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-gray-500 bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">套餐名稱</th>
                  <th className="text-left px-4 py-2.5 font-medium w-16 cursor-pointer select-none hover:text-blue-600" onClick={cycleFlow}>
                    流量 {sortFlow === 'asc' ? '↑' : sortFlow === 'desc' ? '↓' : '⇅'}
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium w-16">限速</th>
                  <th className="text-left px-4 py-2.5 font-medium w-36">適用國家</th>
                  <th className="text-right px-4 py-2.5 font-medium w-20">天數</th>
                  <th className="text-right px-4 py-2.5 font-medium w-24 cursor-pointer select-none hover:text-blue-600" onClick={cyclePrice}>
                    結算價 {sortPrice === 'asc' ? '↑' : sortPrice === 'desc' ? '↓' : ''}
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium w-14">詳情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  // 0 規格（無價格規格）= 沒有可賣商品，不顯示
                  let sorted = results.filter(r => r.copies_options.length > 0)
                  if (sortFlow) {
                    sorted = [...sorted].sort((a, b) => sortFlow === 'asc' ? (a.capacity_kb ?? 0) - (b.capacity_kb ?? 0) : (b.capacity_kb ?? 0) - (a.capacity_kb ?? 0))
                  } else if (sortPrice && selDays) {
                    const target = parseInt(selDays)
                    sorted = [...sorted].sort((a, b) => {
                      const aP = a.copies_options.find(o => o.days === target)?.costCny ?? Infinity
                      const bP = b.copies_options.find(o => o.days === target)?.costCny ?? Infinity
                      return sortPrice === 'asc' ? aP - bP : bP - aP
                    })
                  }
                  return sorted
                })().map((bc, i) => {
                  const isExpanded = expanded.has(bc.sku_id)
                  const toggleExpand = () => setExpanded(prev => {
                    const next = new Set(prev)
                    next.has(bc.sku_id) ? next.delete(bc.sku_id) : next.add(bc.sku_id)
                    return next
                  })
                  // 如果有篩選天數，找到匹配的 copies option
                  const matchedOpt = selDays ? bc.copies_options.find(o => o.days === parseInt(selDays)) : null
                  return (
                    <Fragment key={`${bc.sku_id}-${i}`}>
                      <tr className={`hover:bg-blue-50/50 cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''}`} onClick={toggleExpand}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {isAdd && (existingSkus?.has(bc.sku_id)
                              ? <span className="text-[10px] text-gray-400 w-4 shrink-0">已加</span>
                              : <input type="checkbox" checked={selected.has(bc.sku_id)} onClick={e => e.stopPropagation()} onChange={() => toggleSel(bc.sku_id)} className="accent-blue-600 shrink-0" />)}
                            <span className="text-gray-400 flex-shrink-0 w-3">{isExpanded ? '▾' : '▸'}</span>
                            <div>
                              <div className={`font-medium text-sm ${isExpanded ? 'text-blue-700' : 'truncate max-w-[350px]'}`}>{bc.name}</div>
                              <div className="text-gray-400 font-mono text-[10px]">{bc.sku_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">{bc.capacity}</td>
                        <td className="px-4 py-2.5">{bc.speed}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-0.5">
                            {bc.countries.map((c, j) => <span key={j} className="px-1 bg-gray-100 rounded text-[10px]">{c}</span>)}
                            {bc.country_total > 5 && <span className="text-[10px] text-gray-400">+{bc.country_total - 5}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {matchedOpt ? `${matchedOpt.days} 天` : `${bc.copies_options.length} 規格`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-blue-600">
                          {matchedOpt ? `¥${matchedOpt.costCny.toFixed(2)}` : (isExpanded ? '' : '展開查看')}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleExpand() }}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 text-[10px] text-gray-700">
                              {isExpanded ? '收合' : '詳情'}
                            </button>
                            {!isAdd && matchedOpt && (
                              <button onClick={(e) => { e.stopPropagation(); onMatch?.(bc.sku_id, matchedOpt.copies) }}
                                className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium">
                                選取
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={7} className="px-4 py-3">
                            {bc.country_details && bc.country_details.length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs text-gray-500 mb-1.5">運營商 / APN 詳情（共 {bc.country_details.length} 國）</div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] border border-gray-200 bg-white">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-2 py-1 text-left border-b">國家</th>
                                        <th className="px-2 py-1 text-left border-b">運營商</th>
                                        <th className="px-2 py-1 text-left border-b">APN</th>
                                        <th className="px-2 py-1 text-left border-b">APN 帳號</th>
                                        <th className="px-2 py-1 text-left border-b">APN 密碼</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {bc.country_details.map((c, ci) => (
                                        <tr key={ci} className="border-b last:border-0">
                                          <td className="px-2 py-1">{c.name_zh} <span className="text-gray-400 font-mono">({c.mcc})</span></td>
                                          <td className="px-2 py-1">{c.operator || '—'}</td>
                                          <td className="px-2 py-1 font-mono">{c.apn || '—'}</td>
                                          <td className="px-2 py-1 font-mono">{c.apn_username || '—'}</td>
                                          <td className="px-2 py-1 font-mono">{c.apn_password || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mb-1.5">各天數規格 / 結算價</div>
                            <table className="w-full text-[11px] border border-gray-200 bg-white">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2 py-1 text-left border-b">天數</th>
                                  <th className="px-2 py-1 text-right border-b">結算價</th>
                                  {!isAdd && <th className="px-2 py-1 text-center border-b w-16">操作</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {bc.copies_options.map((opt, oi) => (
                                  <tr key={oi} className="border-b last:border-0">
                                    <td className="px-2 py-1 font-medium">{opt.days} 天</td>
                                    <td className="px-2 py-1 text-right font-medium text-blue-600">¥{opt.costCny.toFixed(2)}</td>
                                    {!isAdd && (
                                      <td className="px-2 py-1 text-center">
                                        <button onClick={(e) => { e.stopPropagation(); onMatch?.(bc.sku_id, opt.copies) }}
                                          className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium">
                                          選取
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {comparePlans && <PlanCompareModal plans={comparePlans} onClose={() => setComparePlans(null)} />}
    </div>
  )
}
