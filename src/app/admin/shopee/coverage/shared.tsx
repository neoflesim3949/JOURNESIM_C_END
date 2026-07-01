'use client'

import { Fragment, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'

export interface Account { id: string; name: string }
export interface Cell { price: number | null; name: string; code: string | null }
export interface Row {
  key: string
  bc_sku_id: string | null
  copies: string | null
  bc_name: string | null
  variation_sku: string | null
  spec: string
  byAcc: Record<string, Cell | null>
  missing: boolean; codeDiff: boolean; nameDiff: boolean
}
export interface Master {
  id: string
  inventory_name: string
  main_sku_code: string
  note: string | null
  perAcc: { id: string; name: string; count: number }[]
  rows: Row[]
  issues: { missing: number; codeDiff: number; nameDiff: number }
  hasIssue: boolean
  empty: boolean
}

export function issueBadges(m: Master) {
  if (m.empty) return [<span key="e" className="px-2 py-0.5 text-[11px] rounded-full bg-gray-100 text-gray-500">查無對應（主貨號未使用）</span>]
  const b = []
  if (m.issues.missing) b.push(<span key="m" className="px-2 py-0.5 text-[11px] rounded-full bg-amber-100 text-amber-700">缺上架 {m.issues.missing}</span>)
  if (m.issues.codeDiff) b.push(<span key="c" className="px-2 py-0.5 text-[11px] rounded-full bg-orange-100 text-orange-700">選項號不一致 {m.issues.codeDiff}</span>)
  if (m.issues.nameDiff) b.push(<span key="n" className="px-2 py-0.5 text-[11px] rounded-full bg-purple-100 text-purple-700">名稱不一致 {m.issues.nameDiff}</span>)
  return b
}

export function CompareTable({ m, accounts }: { m: Master; accounts: Account[] }) {
  if (m.rows.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-gray-400">
      查無對應選項。請到「商品對應 V2」把對應商品的「主商品貨號」填成 <span className="font-mono text-gray-600">{m.main_sku_code}</span>。
    </div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium min-w-[180px]">規格</th>
            {accounts.map(a => <th key={a.id} className="text-center px-4 py-2.5 font-medium min-w-[120px]">{a.name}</th>)}
            <th className="text-left px-4 py-2.5 font-medium min-w-[160px]">對應 BC</th>
            <th className="text-center px-4 py-2.5 font-medium w-28">一致性</th>
          </tr>
        </thead>
        <tbody>
          {m.rows.map(r => {
            const ok = !r.missing && !r.codeDiff && !r.nameDiff
            return (
              <tr key={r.key} className={`border-t border-gray-100 ${ok ? '' : 'bg-red-50/30'}`}>
                <td className="px-4 py-2.5">
                  <div className="text-gray-800">{r.spec || '—'}</div>
                  {r.variation_sku && <div className="text-[10px] text-gray-400 font-mono">{r.variation_sku}</div>}
                </td>
                {accounts.map(a => {
                  const c = r.byAcc[a.id]
                  return (
                    <td key={a.id} className="px-4 py-2.5 text-center">
                      {c ? (
                        <div>
                          {c.code
                            ? <div className={`text-[11px] font-mono truncate max-w-[170px] mx-auto ${r.codeDiff ? 'text-orange-600 font-semibold' : 'text-gray-700'}`}>{c.code}</div>
                            : <span className="text-gray-300 text-xs">未對應</span>}
                          <div className="text-[10px] text-gray-400">{c.price != null ? `NT$ ${c.price}` : '—'}</div>
                          {r.nameDiff && c.name && <div className="text-[10px] text-purple-500 truncate max-w-[140px] mx-auto">{c.name}</div>}
                        </div>
                      ) : <span className="text-gray-300 text-xs">未上架</span>}
                    </td>
                  )
                })}
                <td className="px-4 py-2.5 text-xs text-blue-600">
                  {r.bc_name || (r.bc_sku_id ? r.bc_sku_id : <span className="text-gray-300">未對應</span>)}
                  {r.copies && <span className="text-gray-400"> ×{r.copies}</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {ok ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> 一致</span>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      {r.missing && <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-100 text-amber-700">缺上架</span>}
                      {r.codeDiff && <span className="px-2 py-0.5 text-[11px] rounded-full bg-orange-100 text-orange-700">選項號不一致</span>}
                      {r.nameDiff && <span className="px-2 py-0.5 text-[11px] rounded-full bg-purple-100 text-purple-700">名稱不一致</span>}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-2.5 flex items-center gap-4 text-[11px] text-gray-400 border-t border-gray-100">
        <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> 缺上架＝部分賣場未上架</span>
        <span>選項號不一致＝兩邊都上架但對應的選項貨號不同（不比對價格）</span>
      </div>
    </div>
  )
}

export function EditModal({ m, onSave, onClose }: { m: Partial<Master>; onSave: (m: Partial<Master>) => void; onClose: () => void }) {
  const [name, setName] = useState(m.inventory_name || '')
  const [sku, setSku] = useState(m.main_sku_code || '')
  const [note, setNote] = useState(m.note || '')
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">{m.id ? '編輯主檔' : '新增主檔'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <Fragment>
          <label className="block text-xs text-gray-500 mb-1">庫存商品名稱</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例：中國電信網卡"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          <label className="block text-xs text-gray-500 mb-1">主商品貨號 <span className="text-gray-400">（須與 V2 商品的主貨號一致）</span></label>
          <input value={sku} onChange={e => setSku(e.target.value)} placeholder="例：CN"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 font-mono" />
          <label className="block text-xs text-gray-500 mb-1">備註（選填）</label>
          <input value={note} onChange={e => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" />
        </Fragment>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={() => onSave({ id: m.id, inventory_name: name, main_sku_code: sku, note })}
            disabled={!name.trim() || !sku.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40">儲存</button>
        </div>
      </div>
    </div>
  )
}
