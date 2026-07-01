'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

const DISMISS_KEY = 'expiring_unused_dismissed' // 值 = 今天(台北) YYYY-MM-DD

function tpeToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function ExpiringUnusedAlert() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // 今天已按「今天不再顯示」→ 不提醒
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === tpeToday()) return
    let alive = true
    fetch('/api/admin/cards/expiring-unused')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return
        if ((d.count || 0) > 0) { setCount(d.count); setOpen(true) }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  function dismissToday() {
    try { localStorage.setItem(DISMISS_KEY, tpeToday()) } catch {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 bg-amber-500 text-white">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-semibold">卡片到期提醒</span>
          <button onClick={() => setOpen(false)} className="ml-auto p-1 hover:bg-white/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-6 text-gray-800">
          <p className="text-lg">
            近七天有 <span className="font-bold text-amber-600 text-2xl">{count}</span> 張卡片方案到期未使用
          </p>
          <p className="mt-2 text-sm text-gray-500">請儘快處理，避免卡片到期作廢。</p>
        </div>
        <div className="px-5 py-4 bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={dismissToday}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          >
            今天不再顯示
          </button>
          <a
            href="/admin/shopee/cards-lookup"
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700"
          >
            前往查看
          </a>
        </div>
      </div>
    </div>
  )
}
