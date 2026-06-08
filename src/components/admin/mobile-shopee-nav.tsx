'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGrid, BarChart3, ShoppingCart, Monitor } from 'lucide-react'

const MODULES = [
  { href: '/admin/m/shopee/dashboard', label: '蝦皮儀表板', icon: BarChart3 },
  { href: '/admin/m/shopee/orders', label: '蝦皮訂單', icon: ShoppingCart },
]

// 手機版蝦皮模組切換（右上角）
export function MobileShopeeNav({ current }: { current?: 'dashboard' | 'orders' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="p-2 text-gray-500" aria-label="切換模組"><LayoutGrid className="w-5 h-5" /></button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-end" onClick={() => setOpen(false)}>
          <div className="mt-14 mr-3 bg-white rounded-xl shadow-xl w-52 overflow-hidden" onClick={e => e.stopPropagation()}>
            {MODULES.map(m => {
              const active = (current === 'dashboard' && m.href.endsWith('dashboard')) || (current === 'orders' && m.href.endsWith('orders'))
              return (
                <button key={m.href} onClick={() => { setOpen(false); router.push(m.href) }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-100 ${active ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
                  <m.icon className="w-5 h-5" /> {m.label}
                </button>
              )
            })}
            <button onClick={() => { setOpen(false); router.push('/admin/shopee/dashboard') }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 text-gray-500 text-sm">
              <Monitor className="w-4 h-4" /> 回桌面版
            </button>
          </div>
        </div>
      )}
    </>
  )
}
