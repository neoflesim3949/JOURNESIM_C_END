'use client'

import { useEffect, useState } from 'react'
import { Wallet, History, Search, Filter, CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface PointLog {
  id: string
  member_id: string
  source_order_id: string
  amount: number
  point_type: string
  status: string
  created_at: string
  available_at?: string
  members?: { email: string; display_name: string }
  orders?: { order_number: string }
}

const TYPE_LABELS: Record<string, string> = {
  signup: '註冊禮',
  first_buy: '首購加碼',
  l1_commission: '一級分潤',
  l1_commission_diff: '一級級差',
  l2_commission: '二級分潤',
  l2_commission_diff: '二級級差',
  redeem: '消費抵扣',
  clawback: '退款追回'
}

export default function AdminPointsPage() {
  const [logs, setLogs] = useState<PointLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    const res = await fetch('/api/admin/members/points')
    if (res.ok) setLogs(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filteredLogs = logs.filter(l => 
    !search || 
    l.members?.email?.toLowerCase().includes(search.toLowerCase()) ||
    l.orders?.order_number?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">F Point 點數管理</h1>
        <div className="p-2 bg-primary/10 rounded-lg">
           <Wallet className="w-5 h-5 text-primary" />
        </div>
      </div>

      <div className="mt-6 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="搜尋會員 Email 或 訂單編號..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors">
          <Filter size={14} /> 篩選
        </button>
      </div>

      <div className="mt-8 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden whitespace-nowrap">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left">異動時間</th>
                <th className="px-6 py-4 text-left">會員基礎資料</th>
                <th className="px-6 py-4 text-left">項目 / 來源</th>
                <th className="px-6 py-4 text-left">變動點數</th>
                <th className="px-6 py-4 text-center">狀態</th>
                <th className="px-6 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString('zh-TW')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{log.members?.display_name || '-'}</div>
                    <div className="text-xs text-gray-500">{log.members?.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-700">{TYPE_LABELS[log.point_type] || log.point_type}</span>
                    {log.orders?.order_number && (
                      <div className="mt-0.5 font-mono text-[10px] text-blue-500 flex items-center gap-1">
                        訂單 {log.orders.order_number} <ArrowRight size={8} />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-lg font-black ${log.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {log.amount > 0 ? `+${log.amount}` : log.amount} <span className="text-xs">P</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {log.status === 'pending' && <span className="px-2 py-0.5 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded-md text-[10px] font-bold">待解凍</span>}
                    {log.status === 'confirmed' && <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded-md text-[10px] font-bold">已入帳</span>}
                    {log.status === 'void' && <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-md text-[10px] font-bold">已失效</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Link href={`/admin/members/${log.member_id}`} className="text-muted-foreground hover:text-primary transition-colors">
                      <History size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                   <td colSpan={6} className="py-20 text-center text-gray-400 italic font-medium">尚無任何點數紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="mt-4 text-xs text-gray-400 px-2 italic">
        顯示最新 100 筆點數異動紀錄
      </div>
    </div>
  )
}
