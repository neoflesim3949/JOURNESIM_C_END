'use client'

import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, ShoppingCart, Percent, CreditCard, RefreshCw } from 'lucide-react'
import { MobileShopeeNav } from '@/components/admin/mobile-shopee-nav'

interface GroupData {
  order_count: number; card_count: number
  total_revenue: number; platform_fees: number; platform_rate: number
  product_cost: number; profit_rate: number
  wallet_total?: number; profit?: number; est_profit?: number
}
interface DashboardData { settled: GroupData; unsettled: GroupData }

function Cards({ title, subtitle, cards }: { title: string; subtitle?: string; cards: { label: string; value: string; sub: string; icon: typeof ShoppingCart; color: string }[] }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {subtitle && <span className="text-[11px] text-gray-400">{subtitle}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{card.label}</span>
              <div className={`p-1.5 rounded-lg ${card.color}`}><card.icon className="w-4 h-4" /></div>
            </div>
            <div className="mt-1.5 text-lg font-bold leading-tight">{card.value}</div>
            <div className="mt-0.5 text-[11px] text-gray-400">{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MobileShopeeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const fmtTW = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const now = new Date()
  const twParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const twYear = Number(twParts.find(p => p.type === 'year')?.value || now.getFullYear())
  const twMonth = Number(twParts.find(p => p.type === 'month')?.value || now.getMonth() + 1) - 1
  const [from, setFrom] = useState(fmtTW(new Date(twYear, twMonth, 1, 12)))
  const [to, setTo] = useState(fmtTW(new Date(twYear, twMonth + 1, 0, 12)))
  const [dateField, setDateField] = useState('order_date')
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')

  function pickMonth(offset: number) {
    const m = twMonth + offset
    setFrom(fmtTW(new Date(twYear, m, 1, 12)))
    setTo(fmtTW(new Date(twYear, m + 1, 0, 12)))
  }

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ date_field: dateField })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (selectedAccount) params.set('account_id', selectedAccount)
    const res = await fetch(`/api/admin/shopee/dashboard?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/admin/shopee/accounts').then(r => r.json()).then(d => setAccounts(d || []))
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.settled
  const u = data?.unsettled
  const settledCards = s ? [
    { label: '商品總價', value: `NT$ ${s.total_revenue.toLocaleString()}`, sub: `${s.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '卡片張數', value: `${s.card_count.toLocaleString()} 張`, sub: `${s.order_count} 筆訂單`, icon: CreditCard, color: 'text-cyan-600 bg-cyan-50' },
    { label: '平台費用', value: `NT$ ${s.platform_fees.toLocaleString()}`, sub: `費用率 ${s.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${s.product_cost.toLocaleString()}`, sub: `入帳 NT$ ${(s.wallet_total ?? 0).toLocaleString()}`, icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '利潤', value: `NT$ ${(s.profit ?? 0).toLocaleString()}`, sub: `利潤率 ${s.profit_rate}%`, icon: TrendingUp, color: (s.profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []
  const unsettledCards = u ? [
    { label: '商品總價', value: `NT$ ${u.total_revenue.toLocaleString()}`, sub: `${u.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '卡片張數', value: `${u.card_count.toLocaleString()} 張`, sub: `${u.order_count} 筆訂單`, icon: CreditCard, color: 'text-cyan-600 bg-cyan-50' },
    { label: '平台費用', value: `NT$ ${u.platform_fees.toLocaleString()}`, sub: `費用率 ${u.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${u.product_cost.toLocaleString()}`, sub: '依訂單估算', icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '預估利潤', value: `NT$ ${(u.est_profit ?? 0).toLocaleString()}`, sub: `預估利潤率 ${u.profit_rate}%`, icon: TrendingUp, color: (u.est_profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* 頂部 + 篩選 */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">蝦皮儀表板</h1>
          <div className="flex items-center">
            <button onClick={load} className="p-2 text-gray-500"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
            <MobileShopeeNav current="dashboard" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">全部帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={dateField} onChange={e => setDateField(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="wallet_date">入帳日期</option>
            <option value="order_date">訂單日期</option>
            <option value="created_at">匯入日期</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="flex-1 min-w-0 px-2 py-2 border border-gray-300 rounded-lg text-sm" />
          <span className="text-gray-400">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="flex-1 min-w-0 px-2 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => pickMonth(0)} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg">本期</button>
          <button onClick={() => pickMonth(-1)} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg">上期</button>
          <button onClick={load} className="flex-[2] py-2 bg-blue-600 text-white text-sm font-medium rounded-lg">查詢</button>
        </div>
      </div>

      {/* 內容 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {loading ? (
          <div className="text-center py-16 text-gray-400">載入中…</div>
        ) : data ? (
          <>
            <Cards title="已結算" subtitle="已匯入金流" cards={settledCards} />
            <Cards title="未結算" subtitle="依訂單估算" cards={unsettledCards} />
          </>
        ) : null}
      </div>
    </div>
  )
}
