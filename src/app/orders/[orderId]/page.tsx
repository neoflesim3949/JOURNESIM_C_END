'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, QrCode, Copy, CheckCircle, Truck, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Order, OrderItem, EsimProfile } from '@/types'

export default function OrderDetailPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [esimProfiles, setEsimProfiles] = useState<EsimProfile[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [subOrders, setSubOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [orderRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).single(),
        supabase.from('order_items').select('*').eq('order_id', orderId),
      ])

      setOrder(orderRes.data)
      setItems(itemsRes.data || [])

      const { data: subs } = await supabase.from('sub_orders').select('*').eq('order_id', orderId)
      setSubOrders(subs || [])

      // 取得 eSIM profiles
      const itemIds = (itemsRes.data || []).map((i) => i.id)
      if (itemIds.length > 0) {
        const { data: profiles } = await supabase
          .from('esim_profiles')
          .select('*')
          .in('order_item_id', itemIds)

        setEsimProfiles(profiles || [])
      }

      setLoading(false)
    }
    load()
  }, [orderId])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">
        載入中...
      </div>
    )
  }

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">找不到訂單</h1>
        <Link href="/orders" className="mt-4 inline-block text-primary hover:underline">
          &larr; 返回訂單列表
        </Link>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  const hasShipping = !!o?.shipping_address
  const simSub = subOrders.find((s) => s.category === 'sim')
  const SHIP_STATUS: Record<string, string> = { pending: '準備中', awaiting_card: '備貨中', card_assigned: '已配卡', shipping: '配送中', completed: '已送達' }
  const shipLabel = SHIP_STATUS[simSub?.shipping_status || simSub?.status || ''] || '配送中'

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="w-4 h-4" />
        返回訂單列表
      </Link>

      <div className="mt-6">
        <h1 className="text-2xl font-bold">訂單詳情</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          訂單編號：<span className="font-mono">{order.order_number}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          建立時間：{new Date(order.created_at).toLocaleString('zh-TW')}
        </div>
      </div>

      {/* Order Items */}
      <div className="mt-8 space-y-4">
        {items.map((item) => {
          const profile = esimProfiles.find((p) => p.order_item_id === item.id)

          return (
            <div key={item.id} className="border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{item.product_name}</div>
                  <div className="text-sm text-muted-foreground">{item.plan_label}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatPrice(item.subtotal)}</div>
                  <div className="text-xs text-muted-foreground">x{item.quantity}</div>
                </div>
              </div>

              {/* eSIM QR Code */}
              {profile && profile.qr_code_data && (
                <div className="mt-4 p-4 bg-accent rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <QrCode className="w-4 h-4" />
                    eSIM 安裝資訊
                  </div>
                  <div className="mt-3 flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.qr_code_url || profile.qr_code_data}
                      alt="eSIM QR Code"
                      className="w-48 h-48"
                    />
                    {profile.sm_dp_address && (
                      <div className="mt-3 w-full">
                        <div className="text-xs text-muted-foreground">SM-DP+ 位址</div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-white px-2 py-1 rounded border border-border flex-1 truncate">
                            {profile.sm_dp_address}
                          </code>
                          <CopyButton text={profile.sm_dp_address} />
                        </div>
                      </div>
                    )}
                    {profile.activation_code && (
                      <div className="mt-2 w-full">
                        <div className="text-xs text-muted-foreground">啟用碼</div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-white px-2 py-1 rounded border border-border flex-1 truncate">
                            {profile.activation_code}
                          </code>
                          <CopyButton text={profile.activation_code} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!profile && (
                hasShipping ? (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                    <Package className="w-4 h-4" />實體 SIM 卡，將寄送至下方收件地址
                  </div>
                ) : (
                  <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground text-center">
                    eSIM 正在準備中，稍後將自動顯示
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* 實體 SIM 配送 / 物流資訊 */}
      {hasShipping && (
        <div className="mt-6 border border-border rounded-xl p-5">
          <div className="font-medium flex items-center gap-2"><Truck className="w-4 h-4 text-primary" />配送資訊</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">收件人</span><span>{o.shipping_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">聯絡電話</span><span>{o.shipping_phone || '—'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">收件地址</span><span className="text-right">{o.shipping_address || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">物流商</span><span>黑貓宅急便</span></div>
            {simSub?.tracking_number && <div className="flex justify-between"><span className="text-muted-foreground">物流追蹤號碼</span><span className="font-mono">{simSub.tracking_number}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">配送狀態</span><span className="text-primary font-medium">{shipLabel}</span></div>
          </div>
        </div>
      )}

      {/* Total */}
      <div className="mt-6 p-4 bg-muted rounded-lg flex items-center justify-between">
        <span className="font-medium">合計</span>
        <span className="text-xl font-bold text-primary">{formatPrice(order.total_amount)}</span>
      </div>

      {/* 售後 / 退款入口 */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
        <Link href={`/after-sale?order=${order.order_number}`}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90">
          申請售後 / 退款
        </Link>
        <Link href="/contact"
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted">
          聯絡客服
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-right">退款依「退換貨政策」辦理；eSIM 未安裝者可於效期內申請。</p>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="p-1 hover:bg-white rounded"
    >
      {copied ? (
        <CheckCircle className="w-4 h-4 text-success" />
      ) : (
        <Copy className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  )
}
