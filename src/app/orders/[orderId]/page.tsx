'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, QrCode, Copy, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Order, OrderItem, EsimProfile } from '@/types'

export default function OrderDetailPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [esimProfiles, setEsimProfiles] = useState<EsimProfile[]>([])
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
                <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground text-center">
                  eSIM 正在準備中，稍後將自動顯示
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="mt-6 p-4 bg-muted rounded-lg flex items-center justify-between">
        <span className="font-medium">合計</span>
        <span className="text-xl font-bold text-primary">{formatPrice(order.total_amount)}</span>
      </div>
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
