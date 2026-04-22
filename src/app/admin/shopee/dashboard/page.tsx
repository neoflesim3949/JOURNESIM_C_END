'use client'

import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, ShoppingCart, Percent } from 'lucide-react'

interface GroupData {
  order_count: number; total_revenue: number; platform_fees: number; platform_rate: number
  product_cost: number; profit_rate: number
  wallet_total?: number; profit?: number; est_profit?: number
}

interface DashboardData {
  settled: GroupData
  unsettled: GroupData
}

function StatCards({ title, subtitle, cards }: { title: string; subtitle?: string; cards: { label: string; value: string; sub: string; icon: typeof ShoppingCart; color: string }[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{card.label}</span>
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold">{card.value}</div>
            <div className="mt-1 text-xs text-gray-400">{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ShopeeDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  // 預設當月月初到月底（台灣時區）
  const fmtTW = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const now = new Date()
  const twParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const twYear = Number(twParts.find(p => p.type === 'year')?.value || now.getFullYear())
  const twMonth = Number(twParts.find(p => p.type === 'month')?.value || now.getMonth() + 1) - 1
  const firstDay = fmtTW(new Date(twYear, twMonth, 1, 12)) // 用中午避免被時區推移
  const lastDay = fmtTW(new Date(twYear, twMonth + 1, 0, 12))
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(lastDay)
  const [dateField, setDateField] = useState('order_date')
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')

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
  }, [])

  const s = data?.settled
  const u = data?.unsettled

  const settledCards = s ? [
    { label: '商品總價', value: `NT$ ${s.total_revenue.toLocaleString()}`, sub: `${s.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '平台費用', value: `NT$ ${s.platform_fees.toLocaleString()}`, sub: `費用率 ${s.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${s.product_cost.toLocaleString()}`, sub: `入帳 NT$ ${(s.wallet_total ?? 0).toLocaleString()}`, icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '利潤', value: `NT$ ${(s.profit ?? 0).toLocaleString()}`, sub: `利潤率 ${s.profit_rate}%`, icon: TrendingUp, color: (s.profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []

  const unsettledCards = u ? [
    { label: '商品總價', value: `NT$ ${u.total_revenue.toLocaleString()}`, sub: `${u.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '平台費用', value: `NT$ ${u.platform_fees.toLocaleString()}`, sub: `費用率 ${u.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${u.product_cost.toLocaleString()}`, sub: '依訂單資料估算', icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '預估利潤', value: `NT$ ${(u.est_profit ?? 0).toLocaleString()}`, sub: `預估利潤率 ${u.profit_rate}%`, icon: TrendingUp, color: (u.est_profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">蝦皮儀表板</h1>
        <div className="flex items-center gap-2">
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={dateField} onChange={e => setDateField(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="wallet_date">入帳日期</option>
            <option value="order_date">訂單日期</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <span className="text-gray-400">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={async () => {
            if (!confirm('回填所有已下單商品的成本價？')) return
            const res = await fetch('/api/admin/shopee/backfill-cost', { method: 'POST' })
            const d = await res.json()
            alert(`回填完成：${d.updated}/${d.total} 筆`)
            load()
          }} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">回填成本</button>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">載入中...</p>
      ) : data ? (
        <div className="mt-6 space-y-8">
          <StatCards title="已結算" subtitle="已匯入金流 Excel 的訂單" cards={settledCards} />
          <StatCards title="未結算" subtitle="尚未匯入金流的訂單（依訂單資料估算）" cards={unsettledCards} />
        </div>
      ) : null}
    </div>
  )
}
