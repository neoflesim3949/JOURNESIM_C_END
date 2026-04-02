'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ShoppingCart, RefreshCw, LogOut,
  Users, Wifi, UserCog, Globe, ChevronDown, Image
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  children?: { href: string; label: string }[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: '總覽', icon: LayoutDashboard },
  {
    href: '/admin/products', label: '商品管理', icon: Package,
    children: [
      { href: '/admin/products', label: '方案管理' },
      { href: '/admin/packages', label: '套餐管理' },
    ],
  },
  {
    href: '/admin/plans', label: '套餐列表', icon: Wifi,
    children: [
      { href: '/admin/plans/esim', label: 'eSIM 套餐' },
      { href: '/admin/plans/sim', label: 'SIM 套餐' },
      { href: '/admin/plans/acceleration', label: '加速包套餐' },
    ],
  },
  { href: '/admin/orders', label: '訂單管理', icon: ShoppingCart },
  { href: '/admin/members', label: '會員管理', icon: Users },
  { href: '/admin/sync', label: 'BC 同步', icon: RefreshCw },
  {
    href: '/admin/params', label: '參數管理', icon: Globe,
    children: [
      { href: '/admin/params/settings', label: '系統設定' },
      { href: '/admin/params/countries', label: '國家 MCC 管理' },
      { href: '/admin/params/login', label: '登入管理' },
    ],
  },
  { href: '/admin/media', label: '圖片庫', icon: Image },
  { href: '/admin/accounts', label: '帳號管理', icon: UserCog },
]

export function AdminSidebar() {
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    window.location.href = '/admin-login'
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white flex flex-col overflow-y-auto">
      <div className="px-6 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold">FLESIM</h1>
        <p className="text-xs text-gray-400">後台管理</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavEntry key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          登出
        </button>
      </div>
    </aside>
  )
}

function NavEntry({ item, pathname }: { item: NavItem; pathname: string }) {
  const hasChildren = item.children && item.children.length > 0
  const isChildActive = hasChildren && item.children!.some((c) => pathname.startsWith(c.href))
  const isActive = pathname === item.href || (!hasChildren && pathname.startsWith(item.href) && item.href !== '/admin')
  const [open, setOpen] = useState(isChildActive)

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isChildActive
              ? 'bg-gray-800 text-white'
              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-5 h-5" />
            {item.label}
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="mt-1 ml-8 space-y-1">
            {item.children!.map((child) => {
              const childActive = pathname.startsWith(child.href)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                    childActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <item.icon className="w-5 h-5" />
      {item.label}
    </Link>
  )
}
