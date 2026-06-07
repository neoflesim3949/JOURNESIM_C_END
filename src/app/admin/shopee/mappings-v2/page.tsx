'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Settings, Link2, ArrowLeft, X } from 'lucide-react'
import { useUrlState } from '@/lib/use-url-state'
import { BcMatchModal } from '@/components/admin/bc-match-modal'

interface OptionRow {
  id: string
  shopee_product_id: string | null
  shopee_product_name: string | null
  shopee_variation_id: string
  shopee_variation_name: string | null
  main_sku_code: string | null
  variation_sku_code: string | null
  original_price: number | null
  bc_sku_id: string | null
  copies: string | null
  price_override: number | null
  custom_product_name: string | null
  custom_variation_name: string | null
  bc_name: string | null
  cost_cny: number | null
  cost_twd: number | null
  calc_price: number | null
  final_price: number | null
  margin: number | null
  margin_pct: number | null
}
interface Rule { multiplier: number; add_amount: number; rounding: string; round_to: number }
interface Account { id: string; name: string; excel_password: string | null }

const KNOWN_COLS = ['商品ID', '商品名稱', '商品選項ID', '商品規格名稱', '主商品貨號', '商品選項貨號', '價格', 'GTIN', '庫存', '最低購買數量']

// 「商品規格名稱」最後一個逗號前=規格1(數據量)，後=規格2(天數)
function splitSpec(name: string | null): [string, string] {
  const s = (name || '').trim()
  const m = s.match(/^(.*)[,，]\s*([^,，]+)$/)
  if (m) return [m[1].trim(), m[2].trim()]
  return [s || '—', '—']
}
function dayNum(s: string): number {
  const m = s.match(/(\d+)/)
  return m ? Number(m[1]) : 9999
}

export default function ShopeeMappingsV2Page() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useUrlState('account', '')
  const [productId, setProductId] = useUrlState('product', '')
  const [options, setOptions] = useState<OptionRow[]>([])
  const [rule, setRule] = useState<Rule>({ multiplier: 1, add_amount: 0, rounding: 'ceil', round_to: 1 })
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [showRule, setShowRule] = useState(false)
  const [matching, setMatching] = useState<OptionRow | null>(null) // BC 對應彈窗
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/shopee/accounts').then(r => r.json()).then((d: Account[]) => {
      setAccounts(d || [])
      if (!accountId && d?.length) setAccountId(d[0].id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!accountId) { setOptions([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/shopee/mappings-v2?account_id=${accountId}`)
      const d = await res.json()
      setOptions(d.options || [])
      if (d.rule) setRule(d.rule)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function readAoa(file: File): Promise<{ aoa: unknown[][]; sheet_name: string }> {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const sheet = wb.SheetNames[0]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '', raw: false })
      return { aoa, sheet_name: sheet }
    } catch {
      const acc = accounts.find(a => a.id === accountId)
      const password = acc?.excel_password || prompt('此檔案有密碼保護，請輸入密碼') || ''
      const fd = new FormData()
      fd.append('file', file); fd.append('password', password)
      const res = await fetch('/api/admin/shopee/parse-excel?mode=aoa', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message || d.error || '解析失敗')
      return { aoa: d.aoa, sheet_name: d.sheet_name }
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!accountId) { alert('請先選擇蝦皮帳號'); return }
    setImporting(true)
    try {
      const { aoa, sheet_name } = await readAoa(file)
      const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').trim()
      const headerRow = aoa.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === '商品選項ID') && r.some(c => norm(c) === '價格'))
      if (headerRow < 0) { alert('找不到表頭（需含「商品選項ID」與「價格」欄），請確認是蝦皮批量上傳表'); return }
      const header = (aoa[headerRow] as unknown[]).map(c => String(c ?? '').trim())
      const colIndex: Record<string, number> = {}
      header.forEach((h, i) => { const n = norm(h); if (KNOWN_COLS.includes(n)) colIndex[n] = i })
      const varCol = colIndex['商品選項ID']
      let noteRow: number | null = null
      const next = aoa[headerRow + 1] as unknown[] | undefined
      if (next && (varCol === undefined || !norm(next[varCol]))) noteRow = headerRow + 1

      const res = await fetch('/api/admin/shopee/mappings-v2/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, file_name: file.name, sheet_name, raw_aoa: aoa, header, col_index: colIndex, header_row: headerRow, note_row: noteRow }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '匯入失敗'); return }
      alert(`成功匯入 ${d.count} 個選項`)
      load()
    } catch (err) {
      alert('匯入失敗：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch('/api/admin/shopee/mappings-v2', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    await load()
  }

  async function saveRule() {
    await fetch('/api/admin/shopee/mappings-v2/rules', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, ...rule }),
    })
    setShowRule(false)
    load()
  }

  async function doExport() {
    if (!accountId) return
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/shopee/mappings-v2/export?account_id=${accountId}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `蝦皮改價_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  // 依商品ID 分組
  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; opts: OptionRow[] }>()
    for (const o of options) {
      const pid = o.shopee_product_id || `__${o.id}`
      if (!map.has(pid)) map.set(pid, { id: pid, name: o.shopee_product_name || '(未命名商品)', opts: [] })
      map.get(pid)!.opts.push(o)
    }
    return [...map.values()]
  }, [options])

  const filteredProducts = search
    ? products.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()))
    : products

  const current = productId ? products.find(p => p.id === productId) : null

  // 當前商品：依數據量(規格1)分組，組內依天數(規格2)排序，每個組合一列展開
  const groups = useMemo(() => {
    if (!current) return []
    const map = new Map<string, OptionRow[]>()
    const order: string[] = []
    for (const o of current.opts) {
      const s1 = splitSpec(o.shopee_variation_name)[0]
      if (!map.has(s1)) { map.set(s1, []); order.push(s1) }
      map.get(s1)!.push(o)
    }
    return order.map(s1 => ({
      spec1: s1,
      rows: map.get(s1)!.slice().sort((a, b) =>
        dayNum(splitSpec(a.shopee_variation_name)[1]) - dayNum(splitSpec(b.shopee_variation_name)[1])),
    }))
  }, [current])

  const priceOf = (o: OptionRow) => o.final_price ?? o.original_price ?? null
  const rangeStr = (opts: OptionRow[]) => {
    const ps = opts.map(priceOf).filter((x): x is number => x != null)
    if (!ps.length) return '—'
    const lo = Math.min(...ps), hi = Math.max(...ps)
    return lo === hi ? `NT$${lo}` : `NT$${lo}–${hi}`
  }

  return (
    <div>
      {/* 頂部工具列 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">商品對應 V2</h1>
          <p className="text-sm text-gray-500 mt-1">匯入蝦皮批量上傳表 → 依商品分組對應億點、設加價規則 → 匯出改價檔回傳蝦皮</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={accountId} onChange={e => { setProductId(''); setAccountId(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">選擇帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => setShowRule(true)} disabled={!accountId}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <Settings className="w-4 h-4" /> 加價規則
          </button>
          <label className={`flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg ${accountId && !importing ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
            <Upload className="w-4 h-4" /> {importing ? '匯入中…' : '匯入蝦皮表'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={!accountId || importing} className="hidden" />
          </label>
          <button onClick={doExport} disabled={!accountId || exporting}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> {exporting ? '匯出中…' : '匯出改價檔'}
          </button>
        </div>
      </div>

      {!current ? (
        /* ───── 商品列表 ───── */
        <>
          <div className="mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋商品名稱 / 商品ID"
              className="w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-xs text-gray-400 ml-3">{filteredProducts.length} 件商品</span>
          </div>
          {loading ? (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">{accountId ? '尚無資料，請匯入蝦皮批量上傳表' : '請先選擇蝦皮帳號'}</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProducts.map(p => {
                const mapped = p.opts.filter(o => o.bc_sku_id).length
                return (
                  <button key={p.id} onClick={() => { setProductId(p.id); setSearch('') }}
                    className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition">
                    <div className="font-medium text-gray-800 line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-1">商品ID: {p.id.startsWith('__') ? '—' : p.id}</div>
                    <div className="flex items-center justify-between mt-3 text-sm">
                      <span className="text-gray-500">{p.opts.length} 個選項</span>
                      <span className={mapped === p.opts.length ? 'text-green-600' : 'text-amber-600'}>已對應 {mapped}/{p.opts.length}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-blue-600">{rangeStr(p.opts)}</div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* ───── 商品詳情：數據量分組 + 天數逐列展開 ───── */
        <>
          <button onClick={() => setProductId('')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-3">
            <ArrowLeft className="w-4 h-4" /> 返回商品列表
          </button>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <div className="font-bold text-gray-800">{current.name}</div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">商品ID: {current.id.startsWith('__') ? '—' : current.id} · {current.opts.length} 個選項</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium border-r border-gray-200 min-w-[140px]">數據量</th>
                  <th className="text-left px-3 py-2.5 font-medium w-16">天數</th>
                  <th className="text-left px-3 py-2.5 font-medium w-32">蝦皮商品選項ID</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[120px]">商品自設名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[120px]">規格自設名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[220px]">對應億點 BC</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">BC 成本</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">計算售價</th>
                  <th className="text-right px-3 py-2.5 font-medium w-28">售價(覆蓋)</th>
                  <th className="text-right px-3 py-2.5 font-medium w-28">毛利</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">原蝦皮價</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => g.rows.map((o, ri) => {
                  const s2 = splitSpec(o.shopee_variation_name)[1]
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50/40 ${ri === 0 && gi > 0 ? 'border-t-2 border-gray-200' : 'border-t border-gray-100'}`}>
                      {ri === 0 && (
                        <td rowSpan={g.rows.length} className="px-3 py-2 align-top font-medium text-gray-700 border-r border-gray-200 bg-gray-50/40">{g.spec1}</td>
                      )}
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{s2}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{o.shopee_variation_id}</td>
                      <td className="px-3 py-2 text-gray-600">{o.custom_product_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{o.custom_variation_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2">
                        {o.bc_sku_id ? (
                          <div>
                            <div className="text-blue-700 font-medium max-w-[260px] truncate">{o.bc_name || o.bc_sku_id}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{o.bc_sku_id} · copies {o.copies}</div>
                          </div>
                        ) : <span className="text-gray-300">未對應</span>}
                        <div className="mt-1 flex gap-1">
                          <button onClick={() => setMatching(o)} className="inline-flex items-center gap-1 px-2 py-0.5 border border-gray-300 rounded text-[10px] text-gray-600 hover:bg-gray-100">
                            <Link2 className="w-3 h-3" /> {o.bc_sku_id ? '重新對應' : '對應'}
                          </button>
                          {o.bc_sku_id && (
                            <button onClick={() => patch(o.id, { bc_sku_id: null, copies: null })} className="px-2 py-0.5 border border-gray-200 rounded text-[10px] text-gray-400 hover:bg-gray-100">取消</button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{o.cost_twd ? <>NT$ {o.cost_twd}<div className="text-[10px] text-gray-400">¥{o.cost_cny}</div></> : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{o.calc_price ? `NT$ ${o.calc_price}` : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" defaultValue={o.price_override ?? ''} placeholder={o.calc_price ? String(o.calc_price) : ''}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            const cur = o.price_override ?? null
                            const next = v === '' ? null : Number(v)
                            if (next !== cur) patch(o.id, { price_override: next })
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {o.margin != null ? (
                          <span className={o.margin >= 0 ? 'text-green-600' : 'text-red-500'}>NT$ {o.margin}<div className="text-[10px] text-gray-400">{o.margin_pct}%</div></span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400">{o.original_price != null ? `NT$ ${o.original_price}` : '—'}</td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 加價規則 */}
      {showRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRule(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">加價規則（此帳號）</h2>
              <button onClick={() => setShowRule(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p className="text-xs text-gray-500">售價 = 成本(TWD) × 倍率 + 固定金額，再依進位方式處理。個別組合可在表格手動覆蓋。</p>
              <label className="block">倍率
                <input type="number" step="0.01" value={rule.multiplier} onChange={e => setRule({ ...rule, multiplier: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded" />
              </label>
              <label className="block">加固定金額 (TWD)
                <input type="number" value={rule.add_amount} onChange={e => setRule({ ...rule, add_amount: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">進位方式
                  <select value={rule.rounding} onChange={e => setRule({ ...rule, rounding: e.target.value })}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded bg-white">
                    <option value="ceil">無條件進位</option>
                    <option value="round">四捨五入</option>
                    <option value="floor">無條件捨去</option>
                    <option value="none">不進位</option>
                  </select>
                </label>
                <label className="block">進位單位
                  <input type="number" value={rule.round_to} onChange={e => setRule({ ...rule, round_to: Number(e.target.value) })}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded" />
                </label>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowRule(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={saveRule} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">儲存並重算</button>
            </div>
          </div>
        </div>
      )}

      {/* BC 對應 */}
      {matching && (
        <BcMatchModal
          subtitle={`${matching.shopee_product_name || ''} · ${matching.shopee_variation_name || ''}`}
          onMatch={(skuId, copies) => { patch(matching.id, { bc_sku_id: skuId, copies }); setMatching(null) }}
          onClose={() => setMatching(null)}
        />
      )}
    </div>
  )
}
