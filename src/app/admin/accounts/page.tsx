'use client'

import { useState } from 'react'
import { UserCog, Key } from 'lucide-react'

export default function AdminAccountsPage() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [message, setMessage] = useState('')

  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')

    // 驗證當前密碼
    const verifyRes = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: currentPw }),
    })

    if (!verifyRes.ok) {
      setMessage('當前密碼錯誤')
      return
    }

    setMessage('密碼變更功能需要修改 .env.local 中的 ADMIN_PASSWORD 環境變數，並重啟服務。')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">帳號管理</h1>

      {/* Current Account Info */}
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
            <UserCog className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <div className="font-semibold">管理員</div>
            <div className="text-sm text-gray-500">透過密碼登入後台管理</div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <Key className="w-5 h-5" />
          修改管理密碼
        </h2>

        {message && (
          <div className="mt-3 p-3 bg-blue-50 text-blue-700 text-sm rounded-lg">{message}</div>
        )}

        <form onSubmit={handleChangePw} className="mt-4 space-y-4 max-w-md">
          <div>
            <label className="text-sm font-medium">當前密碼</label>
            <input
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">新密碼</label>
            <input
              type="password"
              required
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            確認修改
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400">
          * 管理密碼儲存於 .env.local 的 ADMIN_PASSWORD，修改後需重啟服務
        </p>
      </div>
    </div>
  )
}
