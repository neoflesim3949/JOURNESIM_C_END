'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X } from 'lucide-react'

export function AddMemberButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const res = await fetch('/api/admin/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: name }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { alert(d.error || '新增失敗'); return }
    setOpen(false); setEmail(''); setPassword(''); setName('')
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
        <UserPlus className="w-4 h-4" /> 新增會員
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">新增會員</h2>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">密碼 *（至少 6 碼）</label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="登入密碼"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">名稱（選填）</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="顯示名稱"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">建立 Email 登入帳號（Email 直接設為已驗證），可立即用此 Email + 密碼登入。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={submit} disabled={saving || !email || password.length < 6}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '新增中...' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
