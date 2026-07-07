'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, LogIn } from 'lucide-react'

export default function TravelLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const d = await fetch('/api/travel/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(r => r.json()).catch(() => ({ error: '連線失敗' }))
    setBusy(false)
    if (d?.error) { setErr(d.error); return }
    router.push('/travel/groups')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-teal-50 to-gray-100 p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8">
        <div className="flex items-center gap-2 text-teal-700 justify-center mb-1"><Plane className="w-6 h-6" /><span className="text-lg font-bold">旅行社服務專區</span></div>
        <p className="text-center text-xs text-gray-400 mb-6">請以旅行社人員帳號登入</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">帳號</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">密碼</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {err && <div className="text-sm text-red-500">{err}</div>}
          <button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50">
            <LogIn className="w-4 h-4" />{busy ? '登入中…' : '登入'}
          </button>
        </div>
      </form>
    </div>
  )
}
