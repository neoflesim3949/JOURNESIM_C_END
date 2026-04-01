'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, ShoppingBag, User } from 'lucide-react'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold text-primary">
            FLESIM
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/shop" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              購買 eSIM
            </Link>
            <Link href="/guide" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              安裝教學
            </Link>
            <Link href="/orders" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              訂單查詢
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              <User className="w-4 h-4" />
              登入
            </Link>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              立即購買
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-white">
          <nav className="px-4 py-4 space-y-3">
            <Link
              href="/shop"
              className="block text-sm font-medium text-foreground hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              購買 eSIM
            </Link>
            <Link
              href="/guide"
              className="block text-sm font-medium text-foreground hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              安裝教學
            </Link>
            <Link
              href="/orders"
              className="block text-sm font-medium text-foreground hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              訂單查詢
            </Link>
            <Link
              href="/auth/login"
              className="block text-sm font-medium text-foreground hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              登入 / 註冊
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
