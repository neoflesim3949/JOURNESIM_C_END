'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CreditCard, LogOut } from 'lucide-react'

const TABS = [
  { href: '/m/admin/shopee/dashboard', label: '看板', icon: LayoutDashboard },
  { href: '/m/admin/cards', label: '查卡', icon: CreditCard },
]

export function MobileAdminNav() {
  const pathname = usePathname()
  async function logout() {
    await fetch('/api/admin/auth', { method: 'DELETE' }).catch(() => {})
    window.location.href = '/m/admin/login'
  }
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="max-w-md mx-auto flex items-center justify-between px-4 h-12">
        <span className="font-bold text-gray-800">FLESIM <span className="text-teal-600">後台</span></span>
        <nav className="flex items-center gap-1">
          {TABS.map(t => {
            const on = pathname.startsWith(t.href)
            return (
              <Link key={t.href} href={t.href}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm ${on ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-500'}`}>
                <t.icon className="w-4 h-4" />{t.label}
              </Link>
            )
          })}
          <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500" title="登出"><LogOut className="w-4 h-4" /></button>
        </nav>
      </div>
    </header>
  )
}
