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
  const [editing, setEditing] = useState<OptionRow | null>(null)   // 單格編輯
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
      // 保持編輯中的格子資料同步
      setEditing(prev => prev ? (d.options || []).find((o: OptionRow) => o.id === prev.id) || null : null)
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

  // 當前商品的矩陣
  const matrix = useMemo(() => {
    if (!current) return null
    const rows: string[] = []         // 規格1（數據量），首見順序
    const colsSet = new Map<string, number>() // 規格2（天數）→ 排序值
    const cell = new Map<string, OptionRow>()
    for (const o of current.opts) {
      const [s1, s2] = splitSpec(o.shopee_variation_name)
      if (!rows.includes(s1)) rows.push(s1)
      if (!colsSet.has(s2)) colsSet.set(s2, dayNum(s2))
      cell.set(`${s1} ${s2}`, o)
    }
    const cols = [...colsSet.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0])
    return { rows, cols, cell }
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
        /* ───── 商品矩陣 ───── */
        <>
          <button onClick={() => setProductId('')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-3">
            <ArrowLeft className="w-4 h-4" /> 返回商品列表
          </button>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <div className="font-bold text-gray-800">{current.name}</div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">商品ID: {current.id.startsWith('__') ? '—' : current.id} · {current.opts.length} 個選項</div>
          </div>

          {matrix && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-medium border-b border-r border-gray-200 min-w-[160px]">數據量 \ 天數</th>
                    {matrix.cols.map(c => <th key={c} className="px-2 py-2 font-medium border-b border-gray-200 whitespace-nowrap min-w-[88px]">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map(r => (
                    <tr key={r}>
                      <td className="sticky left-0 bg-white px-3 py-2 font-medium text-gray-700 border-b border-r border-gray-200 align-top">{r}</td>
                      {matrix.cols.map(c => {
                        const o = matrix.cell.get(`${r} ${c}`)
                        if (!o) return <td key={c} className="border-b border-gray-100 bg-gray-50/50"></td>
                        const mapped = !!o.bc_sku_id
                        const price = priceOf(o)
                        return (
                          <td key={c} className="border-b border-gray-100 p-1 align-top">
                            <button onClick={() => setEditing(o)}
                              className={`w-full rounded-lg px-2 py-1.5 text-left border transition ${mapped ? 'border-green-200 bg-green-50/60 hover:bg-green-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-800">{price != null ? `NT$${price}` : '—'}</span>
                                <span className={`w-1.5 h-1.5 rounded-full ${mapped ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {o.price_override != null ? '已覆蓋' : (mapped ? `算 NT$${o.calc_price ?? '—'}` : '未對應')}
                              </div>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              <p className="text-xs text-gray-500">售價 = 成本(TWD) × 倍率 + 固定金額，再依進位方式處理。個別組合可在矩陣手動覆蓋。</p>
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

      {/* 單格編輯 */}
      {editing && (
        <CellEditor key={editing.id} row={editing} onClose={() => setEditing(null)}
          onMatchClick={() => setMatching(editing)}
          onSavePrice={(v) => patch(editing.id, { price_override: v })}
          onClearMap={() => patch(editing.id, { bc_sku_id: null, copies: null })} />
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

// 單格編輯彈窗
function CellEditor({ row, onClose, onMatchClick, onSavePrice, onClearMap }: {
  row: OptionRow
  onClose: () => void
  onMatchClick: () => void
  onSavePrice: (v: number | null) => void
  onClearMap: () => void
}) {
  const [price, setPrice] = useState(row.price_override != null ? String(row.price_override) : '')
  const [, spec2] = splitSpec(row.shopee_variation_name)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold">{row.shopee_variation_name || '選項'}</h2>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">選項ID: {row.shopee_variation_id}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          {/* BC 對應 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">對應億點 BC 商品</div>
            {row.bc_sku_id ? (
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-blue-700 font-medium">{row.bc_name || row.bc_sku_id}</div>
                  <div className="text-[11px] text-gray-400 font-mono">{row.bc_sku_id} · copies {row.copies}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={onMatchClick} className="px-2 py-1 border border-gray-300 rounded text-[11px] hover:bg-white">換</button>
                  <button onClick={onClearMap} className="px-2 py-1 border border-gray-200 rounded text-[11px] text-gray-400 hover:bg-white">取消</button>
                </div>
              </div>
            ) : (
              <button onClick={onMatchClick} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                <Link2 className="w-4 h-4" /> 對應 BC 商品（{spec2}）
              </button>
            )}
          </div>

          {/* 成本 / 計算售價 / 毛利 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-[11px] text-gray-400">BC 成本</div>
              <div className="font-medium">{row.cost_twd ? `NT$${row.cost_twd}` : '—'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-[11px] text-gray-400">計算售價</div>
              <div className="font-medium">{row.calc_price ? `NT$${row.calc_price}` : '—'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-[11px] text-gray-400">毛利</div>
              <div className={`font-medium ${row.margin != null && row.margin < 0 ? 'text-red-500' : 'text-green-600'}`}>{row.margin != null ? `NT$${row.margin}` : '—'}</div>
            </div>
          </div>

          {/* 售價覆蓋 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">售價（留空＝用計算售價 {row.calc_price ? `NT$${row.calc_price}` : ''}）</div>
            <div className="flex gap-2">
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={row.calc_price ? String(row.calc_price) : '售價'}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
              <button onClick={() => onSavePrice(price.trim() === '' ? null : Number(price))}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">存</button>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">原蝦皮價：{row.original_price != null ? `NT$${row.original_price}` : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
