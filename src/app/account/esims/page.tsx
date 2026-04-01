'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Smartphone, Wifi } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface EsimItem {
  id: string
  iccid: string
  status: string
  order_item: {
    product_name: string
    plan_label: string
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: '準備中',
  ready: '待安裝',
  installed: '已安裝',
  active: '使用中',
  expired: '已到期',
}

export default function MyEsimsPage() {
  const [esims, setEsims] = useState<EsimItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/auth/login?next=/account/esims'
        return
      }

      const { data } = await supabase
        .from('esim_profiles')
        .select(`
          id, iccid, status,
          order_items!inner(product_name, plan_label, orders!inner(member_id))
        `)
        .eq('order_items.orders.member_id', user.id)
        .order('created_at', { ascending: false })

      const mapped = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        iccid: row.iccid as string,
        status: row.status as string,
        order_item: row.order_items as { product_name: string; plan_label: string },
      }))

      setEsims(mapped)
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
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="w-4 h-4" />
        返回會員中心
      </Link>

      <h1 className="mt-6 text-2xl font-bold">我的 eSIM</h1>

      {esims.length === 0 ? (
        <div className="mt-12 text-center py-16">
          <Smartphone className="mx-auto w-12 h-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">尚無 eSIM</h2>
          <p className="mt-2 text-sm text-muted-foreground">購買後將在此顯示</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {esims.map((esim) => (
            <div
              key={esim.id}
              className="p-4 border border-border rounded-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wifi className="w-5 h-5 text-primary" />
                  <div>
                    <div className="font-medium">{esim.order_item.product_name}</div>
                    <div className="text-sm text-muted-foreground">{esim.order_item.plan_label}</div>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  esim.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {STATUS_LABELS[esim.status] || esim.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground font-mono">
                ICCID: {esim.iccid}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
