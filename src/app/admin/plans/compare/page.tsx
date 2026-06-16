'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Plus, Trash2 } from 'lucide-react'
import { PlanCompareTable, type ComparePlan } from '@/components/admin/plan-compare-table'

type Plan = ComparePlan

const LS_KEY = 'plan_compare_skus'

export default function PlanComparePage() {
  const [selected, setSelected] = useState<Plan[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Plan[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [useRetail, setUseRetail] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // 還原已選（localStorage）
  useEffect(() => {
    let skus: string[] = []
    try { const s = localStorage.getItem(LS_KEY); skus = s ? JSON.parse(s) : [] } catch { skus = [] }
    if (skus.length) {
      fetch(`/api/admin/plans/compare?skus=${skus.join(',')}`)
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => setSelected(d.items || []))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function persist(list: Plan[]) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list.map(p => p.sku_id))) } catch {}
  }

  async function doSearch(text: string) {
    setQ(text)
    if (text.trim().length < 2) { setResults([]); setOpen(false); return }
    setSearching(true); setOpen(true)
    try {
      const res = await fetch(`/api/admin/plans/compare?q=${encodeURIComponent(text.trim())}`)
      const d = await res.json()
      setResults(d.items || [])
    } catch { setResults([]) }
    setSearching(false)
  }

  function addPlan(p: Plan) {
    if (selected.some(s => s.sku_id === p.sku_id)) return
    const next = [...selected, p]
    setSelected(next); persist(next)
    setQ(''); setResults([]); setOpen(false)
  }
  function removePlan(sku: string) {
    const next = selected.filter(s => s.sku_id !== sku)
    setSelected(next); persist(next)
  }
  function clearAll() { setSelected([]); persist([]) }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">套餐比較</h1>
        <p className="mt-1 text-sm text-gray-500">加入多個套餐，依「相同 copies」對比{useRetail ? '零售價' : '結算價'}（每列最低價以綠色標示）</p>
      </div>

      {/* 搜尋加入 */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <div ref={boxRef} className="relative w-96 max-w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => doSearch(e.target.value)} onFocus={() => q.trim().length >= 2 && setOpen(true)}
            placeholder="搜尋套餐名稱或 SKU 加入比較（至少 2 字）"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          {open && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
              {searching ? (
                <div className="px-3 py-3 text-sm text-gray-400">搜尋中…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400">無結果</div>
              ) : results.map(p => {
                const added = selected.some(s => s.sku_id === p.sku_id)
                return (
                  <button key={p.sku_id} onClick={() => addPlan(p)} disabled={added}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 ${added ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 truncate">{p.name}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{p.sku_id} · {(p.prices || []).length} 規格</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={useRetail} onChange={e => setUseRetail(e.target.checked)} className="accent-blue-600" />
          顯示零售價（預設結算價）
        </label>
        {selected.length > 0 && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" /> 清空（{selected.length}）
          </button>
        )}
      </div>

      {/* 比較表 */}
      {selected.length === 0 ? (
        <div className="mt-10 text-center text-gray-400">尚未加入套餐，從上方搜尋並加入要比較的套餐</div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <PlanCompareTable plans={selected} useRetail={useRetail} onRemove={removePlan} />
        </div>
      )}

      {selected.length > 1 && (
        <p className="mt-3 text-xs text-gray-400">綠色＝該 copies 下最低{useRetail ? '零售價' : '結算價'}。「—」表示該套餐沒有此 copies 規格。每日型套餐另標示對應天數。</p>
      )}
    </div>
  )
}
