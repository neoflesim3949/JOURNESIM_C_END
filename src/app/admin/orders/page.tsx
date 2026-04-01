import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending_payment: { text: '待付款', color: 'bg-yellow-50 text-yellow-700' },
  paid: { text: '已付款', color: 'bg-blue-50 text-blue-700' },
  processing: { text: '處理中', color: 'bg-purple-50 text-purple-700' },
  completed: { text: '已完成', color: 'bg-green-50 text-green-700' },
  cancelled: { text: '已取消', color: 'bg-gray-100 text-gray-500' },
  refunded: { text: '已退款', color: 'bg-red-50 text-red-700' },
}

export default async function AdminOrdersPage() {
  const supabase = createAdminClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div>
      <h1 className="text-2xl font-bold">訂單管理</h1>

      {(!orders || orders.length === 0) ? (
        <p className="mt-8 text-gray-500 text-center">尚無訂單</p>
      ) : (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">訂單編號</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">金額</th>
                <th className="text-left px-4 py-3 font-medium">狀態</th>
                <th className="text-left px-4 py-3 font-medium">BC 訂單</th>
                <th className="text-left px-4 py-3 font-medium">建立時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => {
                const status = STATUS_LABELS[order.status] || { text: order.status, color: 'bg-gray-100 text-gray-500' }
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{order.email}</td>
                    <td className="px-4 py-3 font-medium">NT$ {order.total_amount}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${status.color}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {order.bc_order_id || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(order.created_at).toLocaleString('zh-TW')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
