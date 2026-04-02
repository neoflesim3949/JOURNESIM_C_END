'use client'

import { useEffect, useState } from 'react'
import { Mail, UserPlus, Link as LinkIcon, ArrowRight } from 'lucide-react'

interface SocialData {
  provider: string
  provider_id: string
  display_name: string
  avatar_url: string
  email: string
  next: string
}

interface ExistingMember {
  id: string
  email: string
  display_name: string | null
  auth_provider: string
}

export default function BindPage() {
  const [socialData, setSocialData] = useState<SocialData | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  // 檢查結果
  const [existingMember, setExistingMember] = useState<ExistingMember | null>(null)
  const [showChoice, setShowChoice] = useState(false)

  useEffect(() => {
    fetch('/api/auth/bind')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          window.location.href = '/auth/login?error=expired'
          return
        }
        setSocialData(data)
        if (data.email) setEmail(data.email)
        setLoading(false)
      })
  }, [])

  async function handleCheckEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setError('')
    setChecking(true)

    const res = await fetch('/api/auth/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'check' }),
    })
    const data = await res.json()

    if (data.error) {
      setError(data.error)
      setChecking(false)
      return
    }

    if (data.exists) {
      setExistingMember(data.member)
      setShowChoice(true)
    } else {
      // Email 不存在，直接建立新帳號
      await handleAction('create')
    }
    setChecking(false)
  }

  async function handleAction(action: 'bind' | 'create') {
    setProcessing(true)
    setError('')

    const res = await fetch('/api/auth/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action }),
    })
    const data = await res.json()

    if (data.error) {
      setError(data.error)
      setProcessing(false)
      return
    }

    if (data.token) {
      // 用 token 完成登入
      window.location.href = `/auth/line/verify?token=${data.token}&type=magiclink&next=${encodeURIComponent(data.next || '/account')}`
    } else {
      window.location.href = data.next || '/account'
    }
  }

  if (loading) {
    return <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>
  }

  if (!socialData) {
    return <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">登入資料已過期</div>
  }

  const providerLabels: Record<string, string> = {
    line: 'LINE',
    google: 'Google',
    apple: 'Apple',
    facebook: 'Facebook',
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      {/* Header */}
      <div className="text-center">
        {socialData.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={socialData.avatar_url} alt="" className="mx-auto w-16 h-16 rounded-full shadow" />
        ) : (
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">{(socialData.display_name || '?')[0]}</span>
          </div>
        )}
        <h1 className="mt-4 text-xl font-bold">
          歡迎，{socialData.display_name || '使用者'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          已透過 {providerLabels[socialData.provider] || socialData.provider} 驗證成功
        </p>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      {!showChoice ? (
        /* 步驟 1：輸入 Email */
        <form onSubmit={handleCheckEmail} className="mt-8">
          <label className="text-sm font-medium">請輸入您的 Email</label>
          <p className="text-xs text-muted-foreground mt-1">用於接收訂單通知和 eSIM 安裝資訊</p>
          <div className="mt-2 relative">
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
          <button
            type="submit"
            disabled={checking || processing}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {checking ? '確認中...' : '繼續'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      ) : (
        /* 步驟 2：帳號已存在，選擇綁定或新建 */
        <div className="mt-8 space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">此 Email 已有帳號</p>
            <p className="text-xs text-muted-foreground mt-1">
              {existingMember?.email}（{existingMember?.display_name || '未設定名稱'}，登入方式：{existingMember?.auth_provider || 'email'}）
            </p>
          </div>

          <button
            onClick={() => handleAction('bind')}
            disabled={processing}
            className="w-full flex items-center gap-3 p-4 border border-primary rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            <LinkIcon className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">綁定到此帳號</div>
              <div className="text-xs text-muted-foreground">
                將 {providerLabels[socialData.provider]} 連結到現有帳號，之後可用任一方式登入
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              setShowChoice(false)
              setEmail('')
              setExistingMember(null)
            }}
            disabled={processing}
            className="w-full flex items-center gap-3 p-4 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <UserPlus className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">使用其他 Email</div>
              <div className="text-xs text-muted-foreground">
                輸入另一個 Email 建立全新帳號
              </div>
            </div>
          </button>

          {processing && (
            <p className="text-center text-sm text-muted-foreground">處理中...</p>
          )}
        </div>
      )}
    </div>
  )
}
