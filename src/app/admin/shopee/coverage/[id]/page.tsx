'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Pencil, RefreshCw } from 'lucide-react'
import { Account, Master, issueBadges, CompareTable, EditModal } from '../shared'

export default function CoverageDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id)
  const [master, setMaster] = useState<Master | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [notFound, setNotFound] = useState(false)

  async function load() {
    setLoading(true)
    let accQ = ''
    try { const s = localStorage.getItem('coverage_accs'); const arr = s ? JSON.parse(s) : null; if (arr && arr.length) accQ = `&accounts=${arr.join(',')}` } catch {}
    const res = await fetch(`/api/admin/shopee/coverage?id=${id}${accQ}`)
    const j = await res.json()
    setAccounts(j.accounts || [])
    setMaster(j.master || null)
    setNotFound(!j.master)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function save(m: Partial<Master>) {
    const res = await fetch('/api/admin/shopee/coverage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, inventory_name: m.inventory_name, main_sku_code: m.main_sku_code, note: m.note }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || '儲存失敗'); return }
    setEditing(false); await load()
  }

  return (
    <div>
      <button onClick={() => router.push('/admin/shopee/coverage')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> 返回對應主檔
      </button>

      {loading ? (
        <div className="mt-10 text-center text-gray-400">比對中…</div>
      ) : notFound || !master ? (
        <div className="mt-10 text-center text-gray-400">找不到此主檔</div>
      ) : (
        <>
          <div className={`mt-4 rounded-xl border p-5 ${master.hasIssue ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-800 truncate">{master.inventory_name}</h1>
                <div className="text-xs text-gray-400 font-mono mt-1">主商品貨號 {master.main_sku_code}</div>
                {master.note && <div className="text-sm text-gray-500 mt-1">{master.note}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <RefreshCw className="w-4 h-4" /> 重新比對
                </button>
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Pencil className="w-4 h-4" /> 編輯
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {master.hasIssue ? issueBadges(master) : (
                <span className="inline-flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" /> 兩邊一致</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {master.perAcc.map(a => (
                <span key={a.id}>{a.name}：<span className={a.count ? 'text-gray-700 font-medium' : 'text-gray-300'}>{a.count} 選項</span></span>
              ))}
            </div>
          </div>

          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <CompareTable m={master} accounts={accounts} />
          </div>
        </>
      )}

      {editing && master && <EditModal m={master} onSave={save} onClose={() => setEditing(false)} />}
    </div>
  )
}
