'use client'

import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, ShoppingCart, Percent } from 'lucide-react'

interface DashboardData {
  total_revenue: number; platform_fees: number; platform_rate: number
  wallet_total: number; product_cost: number; profit: number; profit_rate: number
  order_count: number
}

export default function ShopeeDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/admin/shopee/dashboard?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const cards = data ? [
    { label: '商品總價', value: `NT$ ${data.total_revenue.toLocaleString()}`, sub: `${data.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '平台費用', value: `NT$ ${data.platform_fees.toLocaleString()}`, sub: `費用率 ${data.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${data.product_cost.toLocaleString()}`, sub: `入帳 NT$ ${data.wallet_total.toLocaleString()}`, icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '利潤', value: `NT$ ${data.profit.toLocaleString()}`, sub: `利潤率 ${data.profit_rate}%`, icon: TrendingUp, color: data.profit >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">蝦皮儀表板</h1>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <span className="text-gray-400">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">查詢</button>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">載入中...</p>
      ) : data ? (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      ) : null}
    </div>
  )
}
