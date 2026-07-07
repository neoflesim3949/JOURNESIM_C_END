'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Package, Smartphone, CreditCard, User, Globe, DollarSign,
  HelpCircle, Mail, Info, LogOut, ChevronRight, TrendingUp, Trophy, Wallet, Gift
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
        { href: '/account/simcards', icon: Smartphone, label: '我的卡片', desc: '查看 eSIM / SIM 卡狀態與用量' },
        { href: '/account/cards', icon: CreditCard, label: '支付方式', desc: `已儲存 ${cardCount} 張卡片`, badge: cardCount > 0 ? String(cardCount) : undefined },
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
        { href: '/contact', icon: Mail, label: '聯絡我們', desc: '客服信箱與辦公室據點' },
        { href: '/about', icon: Info, label: '關於我們', desc: '了解 FLESIM' },
      ],
    },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-center text-lg font-medium text-muted-foreground">帳戶</h1>

      {/* Profile Header */}
      <div className="mt-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center relative">
          <span className="text-2xl font-bold text-primary">
            {(user?.display_name || user?.email || '?').charAt(0).toUpperCase()}
          </span>
          <div className="absolute -bottom-1 -right-1 bg-yellow-400 p-1 rounded-full border-2 border-white shadow-sm">
            <Trophy className="w-3 h-3 text-white" />
          </div>
        </div>
        <h2 className="mt-3 text-lg font-semibold">{user?.display_name || user?.email}</h2>
        <div className="mt-1 px-2 py-0.5 bg-muted rounded-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          白銀會員
        </div>
      </div>

      {/* Main Feature Cards */}
      <div className="mt-8 grid gap-4">
        {/* F Points Card */}
        <Link href="/account/points" className="group p-5 bg-gray-900 text-white rounded-2xl border border-gray-800 flex items-center justify-between transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Wallet size={100} />
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl">
              <Wallet className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">F Point 餘額</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold">{userPoints !== null ? Math.floor(userPoints) : '--'}</span>
                <span className="text-xs font-bold text-gray-500">P</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-sm font-bold hover:bg-white/20 transition-colors">
            兌換碼 <ChevronRight className="w-4 h-4" />
          </div>
        </Link>

        {/* Affiliate Marketing Card (Purple Refernce style) */}
        <Link href="/account/affiliate" className="group p-5 bg-gradient-to-br from-[#8E2DE2] to-[#4A00E0] text-white rounded-2xl flex items-center justify-between transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-500/20 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-20 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
            <div className="flex -space-x-4">
              <div className="w-20 h-20 bg-white/20 rounded-full backdrop-blur-sm" />
              <div className="w-20 h-20 bg-white/10 rounded-full backdrop-blur-sm mt-8" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-md">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold opacity-90">邀請好友 賺取獎勵</p>
              <p className="text-[11px] opacity-70 mt-0.5">最高可賺取 6% + 3% 分潤</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-white text-[#4A00E0] rounded-xl text-sm font-black shadow-lg">
            立即邀請
          </div>
        </Link>
      </div>

      {/* Menu Sections */}
      <div className="mt-8 space-y-4">
        {menuSections.map((section, si) => (
          <div key={si} className="bg-white rounded-xl border border-border overflow-hidden">
            {section.items.map((item, ii) => {
              const isLink = item.href !== '#' && !('disabled' in item && item.disabled)
              const cls = `flex items-center gap-4 px-4 py-3.5 transition-colors ${ii > 0 ? 'border-t border-border' : ''
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
