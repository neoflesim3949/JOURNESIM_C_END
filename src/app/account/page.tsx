'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { User, Package, Smartphone, LogOut } from 'lucide-react'

interface UserProfile {
  email: string
  display_name: string | null
}

export default function AccountPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/auth/login?next=/account'
        return
      }

      setUser({
        email: user.email || '',
        display_name: user.user_metadata?.display_name || null,
      })
      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">
        載入中...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold">會員中心</h1>

      {/* Profile Card */}
      <div className="mt-6 p-6 border border-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{user?.display_name || '會員'}</div>
            <div className="text-sm text-muted-foreground">{user?.email}</div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mt-6 space-y-3">
        <Link
          href="/orders"
          className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-primary/50 transition-all"
        >
          <Package className="w-5 h-5 text-primary" />
          <div>
            <div className="font-medium">我的訂單</div>
            <div className="text-sm text-muted-foreground">查看訂單記錄與狀態</div>
          </div>
        </Link>

        <Link
          href="/account/esims"
          className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-primary/50 transition-all"
        >
          <Smartphone className="w-5 h-5 text-primary" />
          <div>
            <div className="font-medium">我的 eSIM</div>
            <div className="text-sm text-muted-foreground">查看已購買的 eSIM 與流量</div>
          </div>
        </Link>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="mt-8 flex items-center gap-2 text-sm text-destructive hover:underline"
      >
        <LogOut className="w-4 h-4" />
        登出
      </button>
    </div>
  )
}
