'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">處理中...</div>}>
      <PaymentResultContent />
    </Suspense>
  )
}

function PaymentResultContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [orderId, setOrderId] = useState('')
  const [orderNumber, setOrderNumber] = useState('')

  const recTradeId = searchParams.get('rec_trade_id')
  const orderNo = searchParams.get('order_number')
  const tappayStatus = searchParams.get('status')

  const provider = searchParams.get('provider')

  useEffect(() => {
    async function verify() {
      // Antom（Alipay+）：以訂單編號向後端覆核付款狀態
      if (provider === 'antom') {
        try {
          const res = await fetch(`/api/payment/antom/verify?order_number=${encodeURIComponent(orderNo || '')}`)
          const data = await res.json()
          if (res.ok && data.status === 'success') {
            setOrderId(data.order_id); setOrderNumber(data.order_number)
            try { localStorage.removeItem('flesim_cart') } catch {}
            setStatus('success'); return
          }
        } catch { /* fallthrough */ }
        setStatus('failed'); return
      }
      if (tappayStatus === '0' && recTradeId) {
        // 付款成功，查詢訂單
        const res = await fetch(`/api/payment/verify?order_number=${orderNo}&rec_trade_id=${recTradeId}`)
        if (res.ok) {
          const data = await res.json()
          setOrderId(data.order_id)
          setOrderNumber(data.order_number)
          setStatus('success')
        } else {
          setStatus('failed')
        }
      } else {
        setStatus('failed')
      }
    }
    verify()
  }, [recTradeId, orderNo, tappayStatus, provider])

  if (status === 'loading') {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Loader2 className="mx-auto w-12 h-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">驗證付款中...</p>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <XCircle className="mx-auto w-16 h-16 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">付款失敗</h1>
        <p className="mt-2 text-muted-foreground">請重新嘗試或選擇其他付款方式</p>
        <Link href="/shop" className="mt-6 inline-block px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover">
          返回選購
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <CheckCircle className="mx-auto w-16 h-16 text-success" />
      <h1 className="mt-4 text-2xl font-bold">付款成功</h1>
      <p className="mt-2 text-muted-foreground">
        訂單編號：<span className="font-mono font-medium text-foreground">{orderNumber}</span>
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href={`/orders/${orderId}`} className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover">
          查看訂單
        </Link>
        <Link href="/shop" className="px-6 py-2.5 border border-border font-medium rounded-lg hover:bg-muted">
          繼續購買
        </Link>
      </div>
    </div>
  )
}
