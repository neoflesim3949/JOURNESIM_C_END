'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CheckCircle2, Plus, Pencil, Trash2, LayoutGrid, List, RefreshCw, ChevronRight, Users, ChevronDown } from 'lucide-react'
import { Account, Master, issueBadges, EditModal } from './shared'

type Filter = 'all' | 'issue' | 'ok'

export default function ShopeeCoveragePage() {
  const router = useRouter()
  const [masters, setMasters] = useState<Master[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [selected, setSelected] = useState<string[] | null>(() => {
    if (typeof window === 'undefined') return null
    try { const s = localStorage.getItem('coverage_accs'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Master> | null>(null)

  async function load() {
    setLoading(true)
    const q = selected && selected.length ? `?accounts=${selected.join(',')}` : ''
    const res = await fetch(`/api/admin/shopee/coverage${q}`)
    const j = await res.json()
    setAllAccounts(j.allAccounts || [])
    setMasters(j.masters || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveSel = selected ?? allAccounts.map(a => a.id)
  function toggleAcc(id: string) {
    const cur = new Set(selected ?? allAccounts.map(a => a.id))
    if (cur.has(id)) { if (cur.size <= 1) return; cur.delete(id) } else cur.add(id)
    const arr = allAccounts.map(a => a.id).filter(x => cur.has(x))
    setSelected(arr)
    try { localStorage.setItem('coverage_accs', JSON.stringify(arr)) } catch {}
  }

  async function save(m: Partial<Master>) {
    const isNew = !m.id
    const res = await fetch('/api/admin/shopee/coverage', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, inventory_name: m.inventory_name, main_sku_code: m.main_sku_code, note: m.note }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || '儲存失敗'); return }
    setEditing(null); await load()
  }
  async function remove(id: string) {
    if (!confirm('確定刪除此主檔？（不影響 V2 對應資料）')) return
    await fetch(`/api/admin/shopee/coverage?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const filtered = useMemo(() => masters.filter(m => {
    if (search && !`${m.inventory_name} ${m.main_sku_code}`.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'issue') return m.hasIssue
    if (filter === 'ok') return !m.hasIssue
    return true
  }), [masters, search, filter])

  const stat = {
    total: masters.length,
    issue: masters.filter(m => m.hasIssue).length,
    ok: masters.filter(m => !m.hasIssue).length,
  }
  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: '全部', n: stat.total },
    { key: 'issue', label: '有異常', n: stat.issue },
    { key: 'ok', label: '一致', n: stat.ok },
  ]

  function open(id: string) { router.push(`/admin/shopee/coverage/${id}`) }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">蝦皮跨帳號對應主檔</h1>
          <p className="text-sm text-gray-500 mt-1">自建庫存主商品（庫存名稱＋主商品貨號），用主貨號把各帳號的 V2 選項拉進來，比對是否都已上架、售價/名稱是否一致</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setPickerOpen(o => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Users className="w-4 h-4" /> 比對帳號 <span className="text-xs text-gray-400">{effectiveSel.length}/{allAccounts.length}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
                  <div className="px-2 py-1 text-[11px] text-gray-400">勾選要比對的帳號（至少 1 個）</div>
                  {allAccounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={effectiveSel.includes(a.id)} onChange={() => toggleAcc(a.id)} className="accent-blue-600" />
                      <span className="text-sm text-gray-700">{a.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 重新比對
          </button>
          <button onClick={() => setEditing({ inventory_name: '', main_sku_code: '', note: '' })}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新增主檔
          </button>
        </div>
      </div>

      {/* 篩選 + 搜尋 + 檢視切換 */}
      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {chips.map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${filter === c.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {c.label} <span className="text-xs text-gray-400">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋庫存名稱 / 主貨號"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button onClick={() => setView('card')} className={`px-2.5 py-2 ${view === 'card' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setView('list')} className={`px-2.5 py-2 ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><List className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 text-center text-gray-400">比對中…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 text-center text-gray-400">
          {masters.length === 0 ? '尚未建立任何主檔，點右上「新增主檔」開始' : '沒有符合的項目'}
        </div>
      ) : view === 'card' ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(m => (
            <div key={m.id} onClick={() => open(m.id)}
              className={`rounded-xl border cursor-pointer transition-shadow hover:shadow-md ${m.hasIssue ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 truncate">{m.inventory_name}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">主貨號 {m.main_sku_code}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditing(m)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(m.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.hasIssue ? issueBadges(m) : (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> 兩邊一致</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                  {m.perAcc.map(a => (
                    <span key={a.id}>{a.name}：<span className={a.count ? 'text-gray-700' : 'text-gray-300'}>{a.count} 選項</span></span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filtered.map(m => (
            <div key={m.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${m.hasIssue ? 'bg-red-50/40' : ''}`} onClick={() => open(m.id)}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${m.hasIssue ? 'bg-red-500' : 'bg-green-500'}`} />
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <span className="font-medium text-gray-800 truncate">{m.inventory_name}</span>
                <span className="text-[11px] text-gray-400 font-mono">{m.main_sku_code}</span>
              </div>
              <div className="hidden md:flex items-center gap-1.5">{m.hasIssue ? issueBadges(m) : <span className="text-xs text-green-600">一致</span>}</div>
              <div className="hidden lg:flex gap-3 text-[11px] text-gray-500">{m.perAcc.map(a => <span key={a.id}>{a.name} {a.count}</span>)}</div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditing(m)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(m.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          ))}
        </div>
      )}

      {editing && <EditModal m={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  )
}
