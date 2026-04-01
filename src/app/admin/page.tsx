import { createAdminClient } from '@/lib/supabase/admin'
import { Package, ShoppingCart, Users, Wifi } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const supabase = createAdminClient()

  const [
    { count: productCount },
    { count: orderCount },
    { count: memberCount },
    { count: esimCount },
    { count: bcProductCount },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('esim_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('bc_products').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: '上架商品', value: productCount ?? 0, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: '訂單數', value: orderCount ?? 0, icon: ShoppingCart, color: 'bg-green-100 text-green-600' },
    { label: '會員數', value: memberCount ?? 0, icon: Users, color: 'bg-purple-100 text-purple-600' },
    { label: 'eSIM 發行', value: esimCount ?? 0, icon: Wifi, color: 'bg-orange-100 text-orange-600' },
  ]

  // 最近 5 筆訂單
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <h1 className="text-2xl font-bold">總覽</h1>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white p-5 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">{s.label}</div>
                <div className="mt-1 text-2xl font-bold">{s.value}</div>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BC Products count */}
      <div className="mt-4 bg-white p-4 rounded-xl border border-gray-200">
        <span className="text-sm text-gray-500">BC 已同步商品：</span>
        <span className="font-semibold ml-1">{bcProductCount ?? 0}</span>
      </div>

      {/* Recent Orders */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">最近訂單</h2>
        {(!recentOrders || recentOrders.length === 0) ? (
          <p className="mt-4 text-sm text-gray-500">尚無訂單</p>
        ) : (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">訂單編號</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">金額</th>
                  <th className="text-left px-4 py-3 font-medium">狀態</th>
                  <th className="text-left px-4 py-3 font-medium">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{order.order_number}</td>
                    <td className="px-4 py-3">{order.email}</td>
                    <td className="px-4 py-3 font-medium">NT$ {order.total_amount}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100">{order.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleString('zh-TW')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
