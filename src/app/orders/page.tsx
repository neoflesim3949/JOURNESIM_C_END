'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Package, ChevronRight } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import type { Order } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  processing: '處理中',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/auth/login?next=/orders'
        return
      }

      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })

      setOrders(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">
        載入中...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold">我的訂單</h1>

      {orders.length === 0 ? (
        <div className="mt-12 text-center py-16">
          <Package className="mx-auto w-12 h-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">尚無訂單</h2>
          <p className="mt-2 text-sm text-muted-foreground">開始選購 eSIM 吧！</p>
          <Link
            href="/shop"
            className="mt-4 inline-block px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors"
          >
            前往選購
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between p-4 border border-border rounded-lg hover:border-primary/50 transition-all"
            >
              <div>
                <div className="font-medium font-mono text-sm">{order.order_number}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString('zh-TW')}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">{formatPrice(order.total_amount)}</div>
                  <div className="text-xs text-muted-foreground">
                    {STATUS_LABELS[order.status] || order.status}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
