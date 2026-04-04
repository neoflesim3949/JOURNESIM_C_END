'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Package, Smartphone, CreditCard, User, Globe, DollarSign,
  HelpCircle, Mail, Info, LogOut, ChevronRight, TrendingUp
} from 'lucide-react'

interface UserProfile {
  email: string
  display_name: string | null
}

export default function AccountPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [cardCount, setCardCount] = useState(0)
  const [userPoints, setUserPoints] = useState<number | null>(null)

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

      // 取得已儲存卡片數量
      fetch('/api/shop/saved-cards').then((r) => r.json()).then((cards) => setCardCount(cards.length))
      // 取得點數
      fetch('/api/account/affiliate').then((r) => r.json()).then((data) => {
        if (data.member) setUserPoints(data.member.points)
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
    return <div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>
  }

  const menuSections = [
    {
      items: [
        { href: '/orders', icon: Package, label: '我的訂單', desc: '查看訂單記錄與狀態' },
        { href: '/account/esims', icon: Smartphone, label: '我的卡片', desc: '查看 eSIM / SIM 卡狀態與用量' },
        { href: '/account/affiliate', icon: TrendingUp, label: '聯盟行銷', desc: userPoints !== null ? `${userPoints} P` : '查看推薦獎勵' },
        { href: '/account/cards', icon: CreditCard, label: '卡片', desc: `已儲存 ${cardCount} 張卡片`, badge: cardCount > 0 ? String(cardCount) : undefined },
      ],
    },
    {
      items: [
        { href: '/account/profile', icon: User, label: '個人資料', desc: '編輯名稱與 Email' },
        { href: '#', icon: Globe, label: '語言', desc: '繁體中文', disabled: true },
        { href: '#', icon: DollarSign, label: '幣別', desc: 'TWD', disabled: true },
      ],
    },
    {
      items: [
        { href: '/guide', icon: HelpCircle, label: '幫助中心', desc: 'eSIM 安裝教學與常見問題' },
        { href: 'mailto:support@flesim.com', icon: Mail, label: '聯絡我們', desc: 'support@flesim.com' },
        { href: '/about', icon: Info, label: '關於我們', desc: '了解 FLESIM' },
      ],
    },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-center text-lg font-medium text-muted-foreground">帳戶</h1>

      {/* Profile Header */}
      <div className="mt-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <span className="text-2xl font-bold text-primary">
            {(user?.display_name || user?.email || '?').charAt(0).toUpperCase()}
          </span>
        </div>
        <h2 className="mt-3 text-lg font-semibold">{user?.display_name || user?.email}</h2>
        {user?.display_name && (
          <p className="text-sm text-muted-foreground">{user.email}</p>
        )}
      </div>

      {/* Menu Sections */}
      <div className="mt-8 space-y-4">
        {menuSections.map((section, si) => (
          <div key={si} className="bg-white rounded-xl border border-border overflow-hidden">
            {section.items.map((item, ii) => {
              const isLink = item.href !== '#' && !('disabled' in item && item.disabled)
              const cls = `flex items-center gap-4 px-4 py-3.5 transition-colors ${
                ii > 0 ? 'border-t border-border' : ''
              } ${isLink ? 'hover:bg-muted cursor-pointer' : 'opacity-60'}`

              const content = (
                <>
                  <item.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.desc && (
                      <span className="text-xs text-muted-foreground">{item.desc}</span>
                    )}
                    {'badge' in item && item.badge && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium">{item.badge}</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </>
              )

              return isLink ? (
                <Link key={ii} href={item.href} className={cls}>{content}</Link>
              ) : (
                <div key={ii} className={cls}>{content}</div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Logout */}
      <div className="mt-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-4 py-3.5 bg-white rounded-xl border border-border hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5 text-destructive" />
          <span className="text-sm font-medium text-destructive">登出</span>
        </button>
      </div>
    </div>
  )
}
