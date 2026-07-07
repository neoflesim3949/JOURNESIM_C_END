'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Plane, Users, Ticket, LogOut } from 'lucide-react'

export function TravelSidebar({ agencyName, displayName, role }: { agencyName: string; displayName: string; role: 'manager' | 'sales' }) {
  const pathname = usePathname()
  const router = useRouter()

  const nav = [
    { href: '/travel/groups', label: '出團管理', icon: Ticket },
    ...(role === 'manager' ? [{ href: '/travel/staff', label: '人員管理', icon: Users }] : []),
  ]

  async function logout() {
    await fetch('/api/travel/auth', { method: 'DELETE' })
    router.push('/travel-login'); router.refresh()
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2 text-teal-700"><Plane className="w-5 h-5" /><span className="font-bold">旅行社服務專區</span></div>
        <div className="mt-1 text-xs text-gray-400">{agencyName}</div>
      </div>
      <nav className="p-3 space-y-1">
        {nav.map(n => {
          const active = pathname.startsWith(n.href)
          const Icon = n.icon
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${active ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />{n.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto p-3 border-t border-gray-100">
        <div className="px-3 py-1.5 text-xs text-gray-400">{displayName}（{role === 'manager' ? '管理者' : '業務'}）</div>
        <button onClick={logout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"><LogOut className="w-4 h-4" />登出</button>
      </div>
    </aside>
  )
}
