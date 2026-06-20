'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DollarSign, TrendingUp, ShoppingCart, Percent, CreditCard, ChevronDown, ChevronRight } from 'lucide-react'
import { TreeTable, type TreeItem } from '@/components/admin/dashboard/HotRankings'

interface DetailOrder { id: string; order_number: string; buyer: string; account: string; date: string | null; status: string; revenue: number; cost: number; cards: number; fees?: number; wallet?: number }
interface GroupData {
  order_count: number; card_count: number
  total_revenue: number; platform_fees: number; platform_rate: number
  product_cost: number; profit_rate: number
  wallet_total?: number; profit?: number; est_profit?: number
  orders?: DetailOrder[]
}

function OrderDetailTable({ orders, showWallet }: { orders: DetailOrder[]; showWallet: boolean }) {
  return (
    <div className="mt-2 bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">訂單日期</th>
            <th className="text-left px-4 py-2.5 font-medium">帳號</th>
            <th className="text-left px-4 py-2.5 font-medium">蝦皮訂單號</th>
            <th className="text-left px-4 py-2.5 font-medium">買家</th>
            <th className="text-left px-4 py-2.5 font-medium">蝦皮狀態</th>
            <th className="text-right px-4 py-2.5 font-medium">商品原價</th>
            {showWallet && <th className="text-right px-4 py-2.5 font-medium">平台費用</th>}
            <th className="text-right px-4 py-2.5 font-medium">成本</th>
            {showWallet && <th className="text-right px-4 py-2.5 font-medium">入帳</th>}
            <th className="text-right px-4 py-2.5 font-medium">{showWallet ? '利潤' : '預估利潤'}</th>
            <th className="text-right px-4 py-2.5 font-medium">張數</th>
            <th className="px-3 py-2.5 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map(o => (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-xs text-gray-500">{o.date ? o.date.slice(0, 10) : '-'}</td>
              <td className="px-4 py-2 text-xs">{o.account}</td>
              <td className="px-4 py-2 font-mono text-xs">{o.order_number}</td>
              <td className="px-4 py-2 text-xs">{o.buyer}</td>
              <td className="px-4 py-2 text-xs">{o.status}</td>
              <td className="px-4 py-2 text-right text-xs font-medium">NT$ {o.revenue.toLocaleString()}</td>
              {showWallet && <td className="px-4 py-2 text-right text-xs text-red-500">{o.fees ? `-NT$ ${o.fees.toLocaleString()}` : '-'}</td>}
              <td className="px-4 py-2 text-right text-xs text-gray-500">{o.cost > 0 ? `NT$ ${o.cost.toLocaleString()}` : '-'}</td>
              {showWallet && <td className="px-4 py-2 text-right text-xs text-green-600">{o.wallet ? `NT$ ${o.wallet.toLocaleString()}` : '-'}</td>}
              {(() => { const profit = o.revenue - (o.fees ?? 0) - o.cost; return (
                <td className={`px-4 py-2 text-right text-xs font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>NT$ {profit.toLocaleString()}</td>
              ) })()}
              <td className="px-4 py-2 text-right text-xs">{o.cards}</td>
              <td className="px-3 py-2 text-center">
                <Link href={`/admin/shopee/orders/${o.id}`} className="text-blue-600 hover:underline text-xs">查看</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface DashboardData {
  settled: GroupData
  unsettled: GroupData
  backfilled?: GroupData
  product_stats?: TreeItem[]
}

function StatCards({ title, subtitle, cards }: { title: string; subtitle?: string; cards: { label: string; value: string; sub: string; icon: typeof ShoppingCart; color: string }[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
  const [showUnsettled, setShowUnsettled] = useState(false)
  const [showSettled, setShowSettled] = useState(false)
  const [showBackfilled, setShowBackfilled] = useState(false)
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

  function pickMonth(offset: number) {
    // offset: 0=本月、-1=上月
    const m = twMonth + offset
    const f = fmtTW(new Date(twYear, m, 1, 12))
    const l = fmtTW(new Date(twYear, m + 1, 0, 12))
    setFrom(f)
    setTo(l)
  }
  function pickLast30() {
    // 近 30 天（含今天）
    setTo(fmtTW(now))
    setFrom(fmtTW(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)))
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
  }, [])

  const s = data?.settled
  const u = data?.unsettled
  const b = data?.backfilled

  const settledCards = s ? [
    { label: '商品總價', value: `NT$ ${s.total_revenue.toLocaleString()}`, sub: `${s.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '卡片使用張數', value: `${s.card_count.toLocaleString()} 張`, sub: `${s.order_count} 筆訂單`, icon: CreditCard, color: 'text-cyan-600 bg-cyan-50' },
    { label: '平台費用', value: `NT$ ${s.platform_fees.toLocaleString()}`, sub: `費用率 ${s.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${s.product_cost.toLocaleString()}`, sub: `入帳 NT$ ${(s.wallet_total ?? 0).toLocaleString()}`, icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '利潤', value: `NT$ ${(s.profit ?? 0).toLocaleString()}`, sub: `利潤率 ${s.profit_rate}%`, icon: TrendingUp, color: (s.profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []

  const unsettledCards = u ? [
    { label: '商品總價', value: `NT$ ${u.total_revenue.toLocaleString()}`, sub: `${u.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '卡片使用張數', value: `${u.card_count.toLocaleString()} 張`, sub: `${u.order_count} 筆訂單`, icon: CreditCard, color: 'text-cyan-600 bg-cyan-50' },
    { label: '平台費用', value: `NT$ ${u.platform_fees.toLocaleString()}`, sub: `費用率 ${u.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${u.product_cost.toLocaleString()}`, sub: '依訂單資料估算', icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '預估利潤', value: `NT$ ${(u.est_profit ?? 0).toLocaleString()}`, sub: `預估利潤率 ${u.profit_rate}%`, icon: TrendingUp, color: (u.est_profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
  ] : []

  const backfilledCards = b ? [
    { label: '商品總價', value: `NT$ ${b.total_revenue.toLocaleString()}`, sub: `${b.order_count} 筆訂單`, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: '卡片使用張數', value: `${b.card_count.toLocaleString()} 張`, sub: `${b.order_count} 筆訂單`, icon: CreditCard, color: 'text-cyan-600 bg-cyan-50' },
    { label: '平台費用', value: `NT$ ${b.platform_fees.toLocaleString()}`, sub: `費用率 ${b.platform_rate}%`, icon: Percent, color: 'text-orange-600 bg-orange-50' },
    { label: '商品成本', value: `NT$ ${b.product_cost.toLocaleString()}`, sub: '依訂單資料估算', icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
    { label: '預估利潤', value: `NT$ ${(b.est_profit ?? 0).toLocaleString()}`, sub: `預估利潤率 ${b.profit_rate}%`, icon: TrendingUp, color: (b.est_profit ?? 0) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
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
            <option value="created_at">匯入日期</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <span className="text-gray-400">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={() => pickMonth(0)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">本期</button>
          <button onClick={() => pickMonth(-1)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">上期</button>
          <button onClick={pickLast30} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">近30天</button>
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
          <div>
            <StatCards title="已結算" subtitle="已匯入金流 Excel 的訂單" cards={settledCards} />
            {(data.settled.orders?.length ?? 0) > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowSettled(v => !v)} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  {showSettled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {showSettled ? '收合' : '展開'}已結算訂單明細（{data.settled.orders!.length} 筆）
                </button>
                {showSettled && <OrderDetailTable orders={data.settled.orders!} showWallet={true} />}
              </div>
            )}
          </div>
          <div>
            <StatCards title="未結算" subtitle="尚未匯入金流的訂單（依訂單資料估算）" cards={unsettledCards} />
            {(u?.orders?.length ?? 0) > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowUnsettled(v => !v)} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  {showUnsettled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {showUnsettled ? '收合' : '展開'}未結算訂單明細（{u!.orders!.length} 筆）
                </button>
                {showUnsettled && <OrderDetailTable orders={u!.orders!} showWallet={false} />}
              </div>
            )}
          </div>
          <div>
            <StatCards title="已回填" subtitle="卡號已回填、尚未送出 BC 訂單（未結算中）" cards={backfilledCards} />
            {(b?.orders?.length ?? 0) > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowBackfilled(v => !v)} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  {showBackfilled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {showBackfilled ? '收合' : '展開'}已回填訂單明細（{b!.orders!.length} 筆）
                </button>
                {showBackfilled && <OrderDetailTable orders={b!.orders!} showWallet={false} />}
              </div>
            )}
          </div>
          <div>
            <TreeTable title="產品統計" data={data.product_stats || []}
              cols={{ name: '商品 / 選項', qty: '數量', revenue: '銷售額' }} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
