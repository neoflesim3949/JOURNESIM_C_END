'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plane, Plus, Users, Ticket, CreditCard, ChevronRight, ExternalLink } from 'lucide-react'

interface Agency {
  id: string; name: string; contact_name: string | null; contact_phone: string | null
  status: 'active' | 'disabled'; created_at: string
  staff_count: number; group_count: number; card_count: number
}

export default function AdminTravelPage() {
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [poolCount, setPoolCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/admin/travel').then(r => r.json()).catch(() => null)
    if (d?.agencies) { setAgencies(d.agencies); setPoolCount(d.pool_count || 0) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function createAgency(body: { name: string; contact_name: string; contact_phone: string; manager_username: string }) {
    const d = await fetch('/api/admin/travel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null)
    if (d?.error) { alert(d.error); return }
    setShowNew(false)
    if (d?.manager) setCreated(d.manager)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Plane className="w-6 h-6 text-teal-600" />旅行社專區</h1>
          <p className="text-sm text-gray-500 mt-1">管理合作旅行社、分配卡片庫存、利潤結算</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/travel" target="_blank" className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
            <ExternalLink className="w-4 h-4" />旅行社後台
          </Link>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"><Plus className="w-4 h-4" />新增旅行社</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b bg-gray-50">
              <th className="px-5 py-3 font-medium">旅行社</th>
              <th className="px-5 py-3 font-medium">聯絡人</th>
              <th className="px-5 py-3 font-medium">人員</th>
              <th className="px-5 py-3 font-medium">團</th>
              <th className="px-5 py-3 font-medium">卡片庫存</th>
              <th className="px-5 py-3 font-medium">狀態</th>
              <th className="px-5 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {agencies.map(a => (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3"><Link href={`/admin/travel/${a.id}`} className="font-medium text-gray-800 hover:text-teal-600">{a.name}</Link></td>
                <td className="px-5 py-3 text-gray-600">{a.contact_name || '—'}<div className="text-xs text-gray-400">{a.contact_phone}</div></td>
                <td className="px-5 py-3 text-gray-600"><span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5 text-gray-400" />{a.staff_count}</span></td>
                <td className="px-5 py-3 text-gray-600"><span className="inline-flex items-center gap-1"><Ticket className="w-3.5 h-3.5 text-gray-400" />{a.group_count}</span></td>
                <td className="px-5 py-3 text-gray-600"><span className="inline-flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-gray-400" />{a.card_count}</span></td>
                <td className="px-5 py-3">{a.status === 'active' ? <span className="px-2 py-0.5 rounded bg-green-50 text-green-600 text-xs">啟用</span> : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-400 text-xs">停用</span>}</td>
                <td className="px-5 py-3 text-right"><Link href={`/admin/travel/${a.id}`}><ChevronRight className="w-4 h-4 text-gray-300" /></Link></td>
              </tr>
            ))}
            {!loading && agencies.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">尚無旅行社，點右上「新增旅行社」建立</td></tr>}
            {loading && <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">載入中…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-400">未分配卡片庫存：{poolCount} 張</div>

      {showNew && <NewAgencyModal onClose={() => setShowNew(false)} onCreate={createAgency} />}
      {created && <PasswordModal manager={created} onClose={() => setCreated(null)} />}
    </div>
  )
}

function NewAgencyModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (a: { name: string; contact_name: string; contact_phone: string; manager_username: string }) => void
}) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [manager, setManager] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">新增旅行社</h2>
        <div className="space-y-3">
          <Field label="旅行社名稱"><input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="聯絡人"><input value={contact} onChange={e => setContact(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="聯絡電話"><input value={phone} onChange={e => setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          </div>
          <Field label="管理者登入帳號"><input value={manager} onChange={e => setManager(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="建立第一個管理者帳號（可留空）" /></Field>
          <p className="text-xs text-gray-400">建立後系統會產生一次性初始密碼並顯示。</p>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
          <button disabled={!name} onClick={() => onCreate({ name, contact_name: contact, contact_phone: phone, manager_username: manager })}
            className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">建立</button>
        </div>
      </div>
    </div>
  )
}

function PasswordModal({ manager, onClose }: { manager: { username: string; password: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">管理者帳號已建立</h2>
        <p className="text-xs text-gray-400 mb-4">請立即記下密碼，此密碼只會顯示一次。</p>
        <div className="rounded-xl bg-gray-50 p-4 text-left space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-400">帳號</span><span className="font-mono text-gray-800">{manager.username}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-400">初始密碼</span><span className="font-mono text-teal-600 font-semibold">{manager.password}</span></div>
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700">我已記下</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}
