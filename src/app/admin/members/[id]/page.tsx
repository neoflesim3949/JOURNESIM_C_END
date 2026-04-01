import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ArrowLeft, User, CreditCard, Package, Trash2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminMemberDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = createAdminClient()

  // 會員資訊
  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()

  if (!member) {
    return (
      <div>
        <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" /> 返回會員列表
        </Link>
        <p className="mt-4 text-gray-500">找不到此會員</p>
      </div>
    )
  }

  // 已儲存的卡片
  const { data: cards } = await supabase
    .from('member_cards')
    .select('*')
    .eq('member_id', id)
    .order('created_at', { ascending: false })

  // 訂單
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div>
      <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回會員列表
      </Link>

      {/* Profile */}
      <div className="mt-4 bg-white p-6 rounded-xl border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{member.display_name || member.email}</h1>
            <p className="text-sm text-gray-500">{member.email}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500">登入方式</div>
            <div className="font-medium">{member.auth_provider}</div>
          </div>
          <div>
            <div className="text-gray-500">註冊時間</div>
            <div className="font-medium">{new Date(member.created_at).toLocaleString('zh-TW')}</div>
          </div>
          <div>
            <div className="text-gray-500">會員 ID</div>
            <div className="font-mono text-xs">{member.id}</div>
          </div>
        </div>
      </div>

      {/* Saved Cards */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="w-5 h-5" />
          已儲存的卡片（{cards?.length || 0}）
        </h2>

        {(!cards || cards.length === 0) ? (
          <p className="mt-3 text-sm text-gray-500">此會員尚未儲存卡片</p>
        ) : (
          <div className="mt-3 space-y-2">
            {cards.map((card) => (
              <div key={card.id} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <div className="font-medium">•••• •••• •••• {card.last_four}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {card.issuer || '信用卡'}
                      {card.bin_code && ` · BIN ${card.bin_code}`}
                      {card.card_type && ` · Type ${card.card_type}`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{new Date(card.created_at).toLocaleString('zh-TW')}</div>
                  <form action={async () => {
                    'use server'
                    const supabase = createAdminClient()
                    await supabase.from('member_cards').delete().eq('id', card.id)
                  }}>
                    <button type="submit" className="mt-1 text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> 刪除
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Package className="w-5 h-5" />
          訂單記錄（{orders?.length || 0}）
        </h2>

        {(!orders || orders.length === 0) ? (
          <p className="mt-3 text-sm text-gray-500">此會員尚無訂單</p>
        ) : (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">訂單編號</th>
                  <th className="text-left px-4 py-2 font-medium">金額</th>
                  <th className="text-left px-4 py-2 font-medium">狀態</th>
                  <th className="text-left px-4 py-2 font-medium">付款方式</th>
                  <th className="text-left px-4 py-2 font-medium">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium">NT$ {order.total_amount}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        order.status === 'paid' ? 'bg-green-50 text-green-600' :
                        order.status === 'processing' ? 'bg-blue-50 text-blue-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>{order.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{order.payment_method || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(order.created_at).toLocaleString('zh-TW')}</td>
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
