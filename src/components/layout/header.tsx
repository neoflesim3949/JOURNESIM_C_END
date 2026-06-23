'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu, X, ShoppingCart, User, Cpu, ClipboardList, LayoutGrid } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/cart'
import { useCurrency, CURRENCIES, type Currency } from '@/lib/currency'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const { itemCount } = useCart()
  const { currency, setCurrency } = useCurrency()
  const [logo, setLogo] = useState<string | null>(null)
  const [logoReady, setLogoReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user))
    fetch('/api/shop/site-config')
      .then((r) => r.json())
      .then((c) => {
        const url = c.logo || ''
        if (!url) { setLogo(''); setLogoReady(true); return }
        // 預下載完成才顯示，避免閃文字 / 破圖
        const img = new window.Image()
        img.onload = () => { setLogo(url); setLogoReady(true) }
        img.onerror = () => { setLogo(''); setLogoReady(true) }
        img.src = url
      })
      .catch(() => { setLogo(''); setLogoReady(true) })
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-8 flex-1">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0 h-8">
              {!logoReady ? (
                <span className="inline-block h-8" />
              ) : logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="FLESIM" className="h-8 object-contain" />
              ) : (
                <span className="text-xl font-bold text-primary">FLESIM</span>
              )}
            </Link>

            <nav className="hidden lg:flex items-center gap-6">
              <Link href="/" className="text-sm font-medium text-foreground hover:text-primary transition-colors">首頁</Link>
              <Link href="/shop?type=esim" className="text-sm font-medium text-foreground hover:text-primary transition-colors">eSIM</Link>
              <Link href="/shop?type=sim" className="text-sm font-medium text-foreground hover:text-primary transition-colors">實體 SIM 卡</Link>
              <Link href="/guide" className="text-sm font-medium text-foreground hover:text-primary transition-colors">幫助中心</Link>
              <Link href="/guide#install" className="text-sm font-medium text-foreground hover:text-primary transition-colors">安裝教學</Link>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
              aria-label="幣別" title="顯示幣別（結帳以新台幣計價）"
              className="text-sm font-medium text-foreground bg-transparent border border-border rounded-lg px-2 py-1.5 cursor-pointer hover:border-primary/50 focus:outline-none">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {isLoggedIn && (
              <Link href="/account/simcards" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors">
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">卡片狀態</span>
              </Link>
            )}
            <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors">
              <ClipboardList className="w-4 h-4" /> 訂單查詢
            </Link>
            {isLoggedIn ? (
              <Link href="/account" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors">
                <User className="w-4 h-4" /> 會員中心
              </Link>
            ) : (
              <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors">
                <User className="w-4 h-4" /> 登入
              </Link>
            )}
            <Link href="/shop" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors">
              立即購買
            </Link>
            <Link href="/cart" className="relative p-2 text-foreground hover:text-primary transition-colors">
              <ShoppingCart className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">{itemCount > 99 ? '99+' : itemCount}</span>
              )}
            </Link>
          </div>

          {/* Mobile */}
          <button className="lg:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-white">
          <nav className="px-4 py-4 space-y-3">
            <Link href="/" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>首頁</Link>
            <Link href="/shop?type=esim" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>eSIM</Link>
            <Link href="/shop?type=sim" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>實體 SIM 卡</Link>
            <Link href="/guide" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>幫助中心</Link>
            <Link href="/guide#install" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>安裝教學</Link>
            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">顯示幣別</span>
                <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
                  className="text-sm font-medium bg-transparent border border-border rounded-lg px-2 py-1.5">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {isLoggedIn && (
                <Link href="/account/simcards" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>卡片狀態</Link>
              )}
              <Link href="/orders" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>訂單查詢</Link>
              {isLoggedIn ? (
                <Link href="/account" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>會員中心</Link>
              ) : (
                <Link href="/auth/login" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>登入 / 註冊</Link>
              )}
              <Link href="/cart" className="block text-sm font-medium text-foreground hover:text-primary" onClick={() => setMobileOpen(false)}>購物車</Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
