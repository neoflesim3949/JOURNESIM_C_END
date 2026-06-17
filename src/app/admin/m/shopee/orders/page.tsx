'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X, ChevronRight, RefreshCw } from 'lucide-react'
import { MobileShopeeNav } from '@/components/admin/mobile-shopee-nav'

interface MOrder {
  id: string
  shopee_order_number: string
  buyer_account: string | null
  order_date: string | null
  buyer_total_payment: number | null
  internal_status: string
  is_manual?: boolean
  shopee_account_id: string | null
  shopee_order_items?: { id: string; status: string }[]
}
interface Account { id: string; name: string }

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '處理中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
}

export default function MobileShopeeOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<MOrder[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  // 新增訂單
  const [showNew, setShowNew] = useState(false)
  const [newNo, setNewNo] = useState('')
  const [newBuyer, setNewBuyer] = useState('')
  const [newAcc, setNewAcc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/admin/shopee/accounts').then(r => r.json()).then((d: Account[]) => setAccounts(d || []))
  }, [])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '30' })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/shopee/orders?${params}`)
      const d = await res.json()
      setOrders(d.data || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function createOrder() {
    if (!newNo.trim()) { alert('請輸入訂單編號'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/shopee/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopee_order_number: newNo.trim(), buyer_account: newBuyer.trim() || null, shopee_account_id: newAcc || null }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '建立失敗'); return }
      router.push(`/admin/m/shopee/orders/${d.order.id}`)
    } finally { setCreating(false) }
  }

  const fmtDate = (s: string | null) => {
    if (!s) return '-'
    const dt = new Date(s)
    return isNaN(dt.getTime()) ? s.slice(0, 10)
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' }).format(dt)
  }
  const accName = (id: string | null) => accounts.find(a => a.id === id)?.name || ''

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* 頂部 */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">蝦皮訂單</h1>
          <div className="flex items-center">
            <button onClick={load} className="p-2 text-gray-500"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
            <MobileShopeeNav current="orders" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="搜尋訂單號 / 買家" className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-base" />
          </div>
          <button onClick={load} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium">搜尋</button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="text-center py-16 text-gray-400">載入中…</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">沒有訂單</div>
        ) : orders.map(o => {
          const s = STATUS[o.internal_status] || { label: o.internal_status, color: 'bg-gray-100 text-gray-600' }
          return (
            <button key={o.id} onClick={() => router.push(`/admin/m/shopee/orders/${o.id}`)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 truncate">{o.shopee_order_number}</span>
                  {o.is_manual && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 shrink-0">手動</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{fmtDate(o.order_date)} · {o.buyer_account || '-'}{o.shopee_account_id ? ` · ${accName(o.shopee_account_id)}` : ''}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`px-2 py-0.5 text-[11px] rounded-full ${s.color}`}>{s.label}</span>
                  <span className="text-xs text-gray-500">{o.shopee_order_items?.length || 0} 項</span>
                  <span className="text-sm font-medium text-blue-600 ml-auto">NT$ {o.buyer_total_payment ?? '-'}</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
            </button>
          )
        })}
      </div>

      {/* 新增訂單浮動鈕 */}
      <button onClick={() => { setNewNo(''); setNewBuyer(''); setNewAcc(''); setShowNew(true) }}
        className="absolute right-5 bottom-6 w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg flex items-center justify-center active:bg-purple-700">
        <Plus className="w-7 h-7" />
      </button>

      {/* 新增訂單彈窗 */}
      {showNew && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">手動新增訂單</h2>
              <button onClick={() => setShowNew(false)} className="p-1"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">訂單編號 *
                <input value={newNo} onChange={e => setNewNo(e.target.value)} placeholder="例：260608XXXX"
                  className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
              </label>
              <label className="block text-sm">買家帳號
                <input value={newBuyer} onChange={e => setNewBuyer(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
              </label>
              <label className="block text-sm">蝦皮帳號
                <select value={newAcc} onChange={e => setNewAcc(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base bg-white">
                  <option value="">不指定</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <button onClick={createOrder} disabled={creating}
              className="mt-5 w-full py-3 bg-purple-600 text-white rounded-lg font-medium active:bg-purple-700 disabled:opacity-50">
              {creating ? '建立中…' : '建立並進入'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
