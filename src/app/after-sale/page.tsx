'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, CheckCircle } from 'lucide-react'

export default function AfterSalePage() {
  const [orderId, setOrderId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/auth/login?next=/after-sale'
        return
      }

      const res = await fetch('/api/after-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, reason }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '提交失敗')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失敗')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <CheckCircle className="mx-auto w-16 h-16 text-success" />
        <h1 className="mt-4 text-2xl font-bold">申請已提交</h1>
        <p className="mt-2 text-muted-foreground">
          我們將盡快處理您的售後申請，處理結果將透過 Email 通知。
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">售後服務</h1>
      <p className="mt-2 text-muted-foreground">如遇到問題，請填寫以下表單申請售後服務</p>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="text-sm font-medium">訂單編號</label>
          <input
            type="text"
            required
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="例：FL20260331ABCDEF"
            className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div>
          <label className="text-sm font-medium">問題描述</label>
          <textarea
            required
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="請詳細描述您遇到的問題..."
            className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {loading ? '提交中...' : '提交申請'}
        </button>
      </form>
    </div>
  )
}
