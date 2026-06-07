'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Settings, Link2, Trash2, X } from 'lucide-react'
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

export default function ShopeeMappingsV2Page() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useUrlState('account', '')
  const [options, setOptions] = useState<OptionRow[]>([])
  const [rule, setRule] = useState<Rule>({ multiplier: 1, add_amount: 0, rounding: 'ceil', round_to: 1 })
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [showRule, setShowRule] = useState(false)
  const [matching, setMatching] = useState<OptionRow | null>(null)
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

  // 讀 Excel → array-of-arrays（加密則走 server 解密）
  async function readAoa(file: File): Promise<{ aoa: unknown[][]; sheet_name: string }> {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const sheet = wb.SheetNames[0]
      const ws = wb.Sheets[sheet]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })
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
      // 找表頭列（含「商品選項ID」與「價格」）
      const headerRow = aoa.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === '商品選項ID') && r.some(c => norm(c) === '價格'))
      if (headerRow < 0) { alert('找不到表頭（需含「商品選項ID」與「價格」欄），請確認是蝦皮批量上傳表'); return }
      const header = (aoa[headerRow] as unknown[]).map(c => String(c ?? '').trim())
      const colIndex: Record<string, number> = {}
      header.forEach((h, i) => { const n = norm(h); if (KNOWN_COLS.includes(n)) colIndex[n] = i })
      // 灰色說明列：表頭下一列若無有效商品選項ID，視為說明列
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
    load()
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

  const filtered = search
    ? options.filter(o => `${o.shopee_product_name} ${o.shopee_variation_name} ${o.shopee_variation_id} ${o.variation_sku_code}`.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">商品對應 V2</h1>
          <p className="text-sm text-gray-500 mt-1">匯入蝦皮批量上傳表 → 對應億點商品、設定加價規則 → 匯出改價檔回傳蝦皮</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={accountId} onChange={e => setAccountId(e.target.value)}
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

      <div className="mb-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋商品 / 規格 / 選項ID / 貨號"
          className="w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <span className="text-xs text-gray-400 ml-3">{filtered.length} 個選項</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500 bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">蝦皮商品 / 選項</th>
              <th className="text-left px-3 py-2.5 font-medium w-64">對應億點 BC</th>
              <th className="text-right px-3 py-2.5 font-medium w-24">BC 成本</th>
              <th className="text-right px-3 py-2.5 font-medium w-24">計算售價</th>
              <th className="text-right px-3 py-2.5 font-medium w-28">售價(覆蓋)</th>
              <th className="text-right px-3 py-2.5 font-medium w-28">毛利</th>
              <th className="text-right px-3 py-2.5 font-medium w-20">原蝦皮價</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">載入中…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">{accountId ? '尚無資料，請匯入蝦皮批量上傳表' : '請先選擇蝦皮帳號'}</td></tr>
            ) : filtered.map(o => (
              <tr key={o.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-800 max-w-[360px] truncate">{o.shopee_product_name || '—'}</div>
                  <div className="text-gray-500">{o.shopee_variation_name || '—'}</div>
                  <div className="text-gray-400 font-mono text-[10px]">選項ID: {o.shopee_variation_id}{o.variation_sku_code ? ` · 貨號: ${o.variation_sku_code}` : ''}</div>
                </td>
                <td className="px-3 py-2.5">
                  {o.bc_sku_id ? (
                    <div className="flex items-start gap-1">
                      <div>
                        <div className="text-blue-700 font-medium max-w-[200px] truncate">{o.bc_name || o.bc_sku_id}</div>
                        <div className="text-gray-400 font-mono text-[10px]">{o.bc_sku_id} · copies {o.copies}</div>
                      </div>
                    </div>
                  ) : <span className="text-gray-300">未對應</span>}
                  <button onClick={() => setMatching(o)}
                    className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 border border-gray-300 rounded text-[10px] text-gray-600 hover:bg-gray-100">
                    <Link2 className="w-3 h-3" /> {o.bc_sku_id ? '重新對應' : '對應'}
                  </button>
                  {o.bc_sku_id && (
                    <button onClick={() => patch(o.id, { bc_sku_id: null, copies: null })}
                      className="mt-1 ml-1 inline-flex items-center px-2 py-0.5 border border-gray-200 rounded text-[10px] text-gray-400 hover:bg-gray-100">取消</button>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">{o.cost_twd ? <>NT$ {o.cost_twd}<div className="text-[10px] text-gray-400">¥{o.cost_cny}</div></> : '—'}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{o.calc_price ? `NT$ ${o.calc_price}` : '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <input type="number" defaultValue={o.price_override ?? ''} placeholder={o.calc_price ? String(o.calc_price) : ''}
                    onBlur={e => {
                      const v = e.target.value.trim()
                      const cur = o.price_override ?? null
                      const next = v === '' ? null : Number(v)
                      if (next !== cur) patch(o.id, { price_override: next })
                    }}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-xs" />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {o.margin != null ? (
                    <span className={o.margin >= 0 ? 'text-green-600' : 'text-red-500'}>
                      NT$ {o.margin}<div className="text-[10px] text-gray-400">{o.margin_pct}%</div>
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-400">{o.original_price != null ? `NT$ ${o.original_price}` : '—'}</td>
                <td className="px-3 py-2.5 text-center">
                  <button onClick={async () => { if (confirm('刪除此選項？')) { await fetch(`/api/admin/shopee/mappings-v2?id=${o.id}`, { method: 'DELETE' }); load() } }}
                    className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 加價規則 */}
      {showRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRule(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">加價規則（此帳號）</h2>
              <button onClick={() => setShowRule(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p className="text-xs text-gray-500">售價 = 成本(TWD) × 倍率 + 固定金額，再依進位方式處理。個別選項可在表格手動覆蓋。</p>
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
