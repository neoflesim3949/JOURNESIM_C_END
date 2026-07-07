'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, Users, ChevronRight, Gift } from 'lucide-react'
import { tripDays } from '../_types'

interface GroupRow {
  id: string; name: string; code: string | null; depart_date: string | null; return_date: string | null
  countries: string[]; base_is_free: boolean; member_count: number; paid_count: number; issued_count: number
}

export default function GroupsPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/travel/groups').then(r => r.json()).catch(() => null)
    if (d?.groups) setGroups(d.groups)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function createGroup(body: { name: string; code: string; depart_date: string; return_date: string; base_is_free: boolean }) {
    const d = await fetch('/api/travel/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null)
    if (d?.error) { alert(d.error); return }
    setShowNew(false)
    if (d?.id) router.push(`/travel/groups/${d.id}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">出團管理</h1>
          <p className="text-sm text-gray-500 mt-1">建立團 · 設定團員與方案 · 產生團員專屬連結</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"><Plus className="w-4 h-4" />建立新團</button>
      </div>

      {loading ? <div className="text-gray-400">載入中…</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(g => {
            const days = tripDays(g.depart_date, g.return_date)
            return (
              <Link key={g.id} href={`/travel/groups/${g.id}`} className="block bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-800">{g.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">團號 {g.code || '—'}{days ? ` · ${days} 天` : ''}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-3"><Calendar className="w-4 h-4" />{g.depart_date || '—'} ~ {g.return_date || '—'}</div>
                <div className="flex items-center gap-3 mt-3">
                  <span className="flex items-center gap-1 text-sm text-gray-600"><Users className="w-4 h-4" />{g.member_count} 人</span>
                  {g.base_is_free && <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600"><Gift className="w-3 h-3" />基礎免費</span>}
                  {g.countries?.length > 0 && <span className="text-xs text-gray-400">{g.countries.join('、')}</span>}
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600">已付款 {g.paid_count}/{g.member_count}</span>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-600">已發放 {g.issued_count}/{g.member_count}</span>
                </div>
              </Link>
            )
          })}
          {groups.length === 0 && <div className="text-gray-400 col-span-full py-10 text-center">尚無團，點右上「建立新團」</div>}
        </div>
      )}

      {showNew && <NewGroupModal onClose={() => setShowNew(false)} onCreate={createGroup} />}
    </div>
  )
}

function NewGroupModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (g: { name: string; code: string; depart_date: string; return_date: string; base_is_free: boolean }) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [depart, setDepart] = useState('')
  const [ret, setRet] = useState('')
  const [free, setFree] = useState(true)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">建立新團</h2>
        <div className="space-y-3">
          <Field label="團名"><input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：東京賞櫻 5 日" /></Field>
          <Field label="團號"><input value={code} onChange={e => setCode(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：JP0408" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="出發日"><input type="date" value={depart} onChange={e => setDepart(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="回程日"><input type="date" value={ret} onChange={e => setRet(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)} />基礎方案對團員免費（團員只付升級差額）
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
          <button disabled={!name} onClick={() => onCreate({ name, code, depart_date: depart, return_date: ret, base_is_free: free })} className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">建立</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}
