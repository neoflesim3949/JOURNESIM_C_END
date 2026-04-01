'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login?next=/account/profile'; return }

      setEmail(user.email || '')
      setDisplayName(user.user_metadata?.display_name || '')
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    })

    if (error) {
      setMessage('更新失敗：' + error.message)
    } else {
      setMessage('已更新')
    }
    setSaving(false)
  }

  if (loading) return <div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回帳戶
      </Link>

      <h1 className="mt-6 text-2xl font-bold">個人資料</h1>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${message.includes('失敗') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium">Email</label>
          <input type="email" value={email} disabled
            className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm bg-muted text-muted-foreground" />
          <p className="text-xs text-muted-foreground mt-1">Email 無法修改</p>
        </div>

        <div>
          <label className="text-sm font-medium">名稱</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="你的名稱"
            className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>

        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? '儲存中...' : '儲存'}
        </button>
      </form>
    </div>
  )
}
