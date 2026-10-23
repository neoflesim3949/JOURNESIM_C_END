'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'

export default function MobileAdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      setError('密碼錯誤')
      setLoading(false)
      return
    }
    // 登入成功 → 直接進手機版 dashboard
    window.location.href = '/m/admin/shopee/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-5">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-teal-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-800">FLESIM 後台（手機版）</h1>
          <p className="mt-1 text-xs text-gray-400">登入後進入蝦皮銷售看板</p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          <input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="輸入管理密碼"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </div>
  )
}
