import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminOrderDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: order }, { data: items }] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).single(),
    supabase.from('order_items').select('*').eq('order_id', id),
  ])

  if (!order) {
    return <div>找不到訂單</div>
  }

  // 取得 eSIM profiles
  const itemIds = (items || []).map((i) => i.id)
  const { data: profiles } = itemIds.length > 0
    ? await supabase.from('esim_profiles').select('*').in('order_item_id', itemIds)
    : { data: [] }

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回訂單列表
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-bold">訂單詳情</h1>
      </div>

      {/* Order Info */}
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">訂單編號</div>
            <div className="font-mono font-medium">{order.order_number}</div>
          </div>
          <div>
            <div className="text-gray-500">Email</div>
            <div>{order.email}</div>
          </div>
          <div>
            <div className="text-gray-500">金額</div>
            <div className="font-semibold">NT$ {order.total_amount}</div>
          </div>
          <div>
            <div className="text-gray-500">狀態</div>
            <div className="font-medium">{order.status}</div>
          </div>
          <div>
            <div className="text-gray-500">BC 訂單 ID</div>
            <div className="font-mono text-xs">{order.bc_order_id || '-'}</div>
          </div>
          <div>
            <div className="text-gray-500">付款方式</div>
            <div>{order.payment_method || '-'}</div>
          </div>
          <div>
            <div className="text-gray-500">建立時間</div>
            <div>{new Date(order.created_at).toLocaleString('zh-TW')}</div>
          </div>
          <div>
            <div className="text-gray-500">會員 ID</div>
            <div className="font-mono text-xs">{order.member_id || '訪客'}</div>
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">訂單明細</h2>
        <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">商品</th>
                <th className="text-left px-4 py-2 font-medium">套餐</th>
                <th className="text-left px-4 py-2 font-medium">數量</th>
                <th className="text-left px-4 py-2 font-medium">小計</th>
                <th className="text-left px-4 py-2 font-medium">ICCID</th>
                <th className="text-left px-4 py-2 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(items || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-medium">{item.product_name}</td>
                  <td className="px-4 py-2">{item.plan_label}</td>
                  <td className="px-4 py-2">{item.quantity}</td>
                  <td className="px-4 py-2">NT$ {item.subtotal}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {item.iccid?.join(', ') || '-'}
                  </td>
                  <td className="px-4 py-2 text-xs">{item.plan_status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* eSIM Profiles */}
      {profiles && profiles.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">eSIM Profiles</h2>
          <div className="mt-3 space-y-3">
            {profiles.map((p) => (
              <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-200 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500">ICCID: </span>
                    <span className="font-mono">{p.iccid}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">狀態: </span>
                    <span className="font-medium">{p.status}</span>
                  </div>
                  {p.sm_dp_address && (
                    <div className="col-span-2">
                      <span className="text-gray-500">SM-DP+: </span>
                      <span className="font-mono text-xs">{p.sm_dp_address}</span>
                    </div>
                  )}
                  {p.activation_code && (
                    <div className="col-span-2">
                      <span className="text-gray-500">啟用碼: </span>
                      <span className="font-mono text-xs">{p.activation_code}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
