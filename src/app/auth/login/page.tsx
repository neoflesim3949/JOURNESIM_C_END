'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'

interface SocialProvider {
  id: string
  label: string
  provider: string
  icon: string
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [socialProviders, setSocialProviders] = useState<SocialProvider[]>([])

  useEffect(() => {
    fetch('/api/shop/auth-config').then((r) => r.json()).then(setSocialProviders).catch(() => {})
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    window.location.href = '/account'
  }

  async function handleOAuth(provider: string) {
    if (provider === 'line') {
      // LINE 用自建 OAuth 流程
      window.location.href = '/auth/line?next=/account'
      return
    }

    // 其他用 Supabase 內建 OAuth
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: provider as 'google' | 'apple' | 'facebook',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-center">登入</h1>
      <p className="mt-2 text-center text-muted-foreground">登入帳號以查看訂單及管理 eSIM</p>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      {/* Social Login Buttons */}
      {socialProviders.length > 0 && (
        <div className="mt-8 space-y-3">
          {socialProviders.map((sp) => (
            <button
              key={sp.id}
              onClick={() => handleOAuth(sp.provider)}
              className="w-full flex items-center justify-center gap-3 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              {sp.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sp.icon} alt="" className="w-5 h-5 object-contain" />
              ) : (
                <span className="w-5 h-5 bg-gray-200 rounded-full" />
              )}
              {sp.label}
            </button>
          ))}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-background text-muted-foreground">或使用 Email</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium">Email</label>
          <div className="mt-1 relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">密碼</label>
          <div className="mt-1 relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入密碼"
              className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {loading ? '登入中...' : '登入'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        還沒有帳號？{' '}
        <Link href="/auth/register" className="text-primary hover:underline">
          立即註冊
        </Link>
      </p>
    </div>
  )
}
