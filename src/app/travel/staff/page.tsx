'use client'

import { useEffect, useState } from 'react'
import { Plus, Shield, User } from 'lucide-react'

type Role = 'manager' | 'sales'
interface Staff { id: string; username: string; display_name: string | null; role: Role; active: boolean }

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/travel/staff').then(r => r.json()).catch(() => null)
    if (d?.staff) setStaff(d.staff)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleActive(s: Staff) {
    await fetch('/api/travel/staff', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: s.id, active: !s.active }) })
    load()
  }
  async function addStaff(body: { username: string; display_name: string; role: Role }) {
    const d = await fetch('/api/travel/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null)
    if (d?.error) { alert(d.error); return }
    setShowNew(false)
    if (d?.password) setCreated({ username: d.username, password: d.password })
    load()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">人員管理</h1>
          <p className="text-sm text-gray-500 mt-1">建立業務/現場人員帳號，供其登入查看與發卡</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"><Plus className="w-4 h-4" />新增人員</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
        {staff.map(s => (
          <div key={s.id} className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${s.role === 'manager' ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-500'}`}>{s.role === 'manager' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}</div>
              <div>
                <div className="text-gray-800 font-medium flex items-center gap-2">{s.display_name || s.username}<RoleBadge role={s.role} /></div>
                <div className="text-xs text-gray-400">帳號 {s.username}</div>
              </div>
            </div>
            <button onClick={() => toggleActive(s)} className={`text-sm px-2.5 py-1 rounded border ${s.active ? 'border-green-200 text-green-600' : 'border-gray-200 text-gray-400'}`}>{s.active ? '啟用' : '停用'}</button>
          </div>
        ))}
        {!loading && staff.length === 0 && <div className="px-5 py-10 text-center text-gray-400">尚無人員</div>}
        {loading && <div className="px-5 py-10 text-center text-gray-400">載入中…</div>}
      </div>

      {showNew && <NewStaffModal onClose={() => setShowNew(false)} onCreate={addStaff} />}
      {created && <PasswordModal created={created} onClose={() => setCreated(null)} />}
    </div>
  )
}

function NewStaffModal({ onClose, onCreate }: { onClose: () => void; onCreate: (s: { username: string; display_name: string; role: Role }) => void }) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('sales')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">新增人員</h2>
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">姓名</label><input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">登入帳號</label><input value={username} onChange={e => setUsername(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">角色</label>
            <div className="flex gap-2">
              {(['manager', 'sales'] as Role[]).map(r => (
                <button key={r} onClick={() => setRole(r)} className={`flex-1 px-3 py-2 text-sm rounded-lg border ${role === r ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-500'}`}>{r === 'manager' ? '管理者' : '業務'}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">建立後系統會產生一次性初始密碼並顯示。</p>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
          <button disabled={!name || !username} onClick={() => onCreate({ username, display_name: name, role })} className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">建立</button>
        </div>
      </div>
    </div>
  )
}

function PasswordModal({ created, onClose }: { created: { username: string; password: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">帳號已建立</h2>
        <p className="text-xs text-gray-400 mb-4">請立即記下密碼，只會顯示一次。</p>
        <div className="rounded-xl bg-gray-50 p-4 text-left space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-400">帳號</span><span className="font-mono text-gray-800">{created.username}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-400">初始密碼</span><span className="font-mono text-teal-600 font-semibold">{created.password}</span></div>
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700">我已記下</button>
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return role === 'manager'
    ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-600">管理者</span>
    : <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">業務</span>
}
