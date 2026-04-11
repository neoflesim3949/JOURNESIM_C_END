'use client'

import { useEffect, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'

interface AfterSale {
  id: string
  order_id: string
  member_id: string
  reason: string
  status: string
  bc_after_sale_id: string | null
  refund_amount: number | null
  created_at: string
  updated_at: string
  orders: { order_number: string; status: string } | null
  members: { name: string | null; email: string } | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '處理中', color: 'bg-blue-100 text-blue-700' },
  approved: { label: '已核准', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已拒絕', color: 'bg-red-100 text-red-700' },
  completed: { label: '已完成', color: 'bg-gray-100 text-gray-600' },
}

export default function AfterSalesPage() {
  const [data, setData] = useState<AfterSale[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (search) params.set('search', search)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/after-sales?${params}`)
    if (res.ok) { const d = await res.json(); setData(d.data || []); setTotal(d.total || 0) }
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">售後列表</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 重新整理
        </button>
      </div>

      <div className="mt-4 flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋原因、售後單號..." value={search}
            onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPage(1), load())}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部狀態</option>
          <option value="pending">待處理</option>
          <option value="processing">處理中</option>
          <option value="approved">已核准</option>
          <option value="rejected">已拒絕</option>
          <option value="completed">已完成</option>
        </select>
        <button onClick={() => { setPage(1); load() }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">搜尋</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : data.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">尚無售後記錄</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">建立時間</th>
                <th className="text-left px-4 py-3 font-medium">訂單號</th>
                <th className="text-left px-4 py-3 font-medium">會員</th>
                <th className="text-left px-4 py-3 font-medium">原因</th>
                <th className="text-left px-4 py-3 font-medium">BC 售後單號</th>
                <th className="text-left px-4 py-3 font-medium">退款金額</th>
                <th className="text-left px-4 py-3 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map(item => {
                const st = STATUS_LABELS[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(item.created_at).toLocaleString('zh-TW')}</td>
                    <td className="px-4 py-2 text-xs font-mono text-blue-600">{item.orders?.order_number || '-'}</td>
                    <td className="px-4 py-2 text-xs">{item.members?.name || item.members?.email || '-'}</td>
                    <td className="px-4 py-2 text-xs">{item.reason}</td>
                    <td className="px-4 py-2 text-xs font-mono text-gray-500">{item.bc_after_sale_id || '-'}</td>
                    <td className="px-4 py-2 text-xs">{item.refund_amount != null ? `NT$ ${item.refund_amount}` : '-'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${st.color}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">共 {total} 筆</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
