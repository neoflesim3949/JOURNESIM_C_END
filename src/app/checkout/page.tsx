'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { TapPayForm } from '@/components/checkout/tappay-form'
import { formatPrice } from '@/lib/utils'

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>}>
      <CheckoutContent />
    </Suspense>
  )
}

interface PlanInfo {
  product_name: string
  speed: string
  days: number
  price: number
  bc_sku_id: string
  copies: string
}

function CheckoutContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [orderComplete, setOrderComplete] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null)
  const [savedCards, setSavedCards] = useState<{ id: string; last_four: string; card_type: string; issuer: string }[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [saveCard, setSaveCard] = useState(false)

  // 偵測是否在 Line App 內建瀏覽器
  const isInLineApp = typeof navigator !== 'undefined' && /Line/i.test(navigator.userAgent)

  const productId = searchParams.get('product')
  const planId = searchParams.get('planId')
  const copies = searchParams.get('copies')
  const qty = Number(searchParams.get('qty') || 1)
  const priceParam = Number(searchParams.get('price') || 0)

  // 載入已儲存的卡片
  useEffect(() => {
    fetch('/api/shop/saved-cards').then((r) => r.json()).then(setSavedCards)
  }, [])

  // 載入商品資訊
  useEffect(() => {
    if (!productId) return
    fetch(`/api/shop/product?id=${productId}`).then((r) => r.json()).then((data) => {
      const product = data.product
      // 找到對應的 plan 和 copies
      for (const plan of data.plans || []) {
        if (plan.plan_id === planId) {
          const cp = plan.copy_prices.find((c: { copies: string }) => c.copies === copies)
          if (cp) {
            setPlanInfo({
              product_name: product.name,
              speed: plan.high_flow_size || plan.capacity || '',
              days: (plan.days || 1) * parseInt(copies || '1'),
              price: cp.sell_price,
              bc_sku_id: plan.bc_sku_id,
              copies: copies || '1',
            })
          }
          break
        }
      }
    })
  }, [productId, planId, copies])

  const totalPrice = (planInfo?.price || priceParam) * qty

  async function handlePrime(prime: string, method: string) {
    if (!email) return
    setLoading(true)

    try {
      const resultUrl = `${window.location.origin}/payment/result`

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          product_id: productId,
          plan_id: planId,
          copies,
          quantity: qty,
          prime: selectedCardId ? undefined : prime,
          total_amount: totalPrice,
          bc_sku_id: planInfo?.bc_sku_id,
          payment_method: method,
          result_url: resultUrl,
          save_card: saveCard,
          card_id: selectedCardId || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '下單失敗')
        setLoading(false)
        return
      }

      const data = await res.json()

      // 跳轉型付款（Line Pay、JKO Pay、PX Pay）
      if (data.payment_url) {
        window.location.href = data.payment_url
        return
      }

      // 直接型付款（信用卡、Apple Pay）
      setOrderId(data.order_id)
      setOrderNumber(data.order_number)
      setOrderComplete(true)
    } catch {
      alert('下單失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  if (orderComplete) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <CheckCircle className="mx-auto w-16 h-16 text-success" />
        <h1 className="mt-4 text-2xl font-bold">訂單已建立</h1>
        <p className="mt-2 text-muted-foreground">
          訂單編號：<span className="font-mono font-medium text-foreground">{orderNumber}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          我們將透過 Email 通知您 eSIM 安裝資訊
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href={`/orders/${orderId}`}
            className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors">
            查看訂單
          </Link>
          <Link href="/shop"
            className="px-6 py-2.5 border border-border font-medium rounded-lg hover:bg-muted transition-colors">
            繼續購買
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回選購
      </Link>

      <h1 className="mt-6 text-2xl font-bold">結帳</h1>

      <div className="mt-8 space-y-6">
        {/* Order Summary */}
        {planInfo && (
          <div className="p-4 bg-muted rounded-lg">
            <h3 className="text-sm font-semibold">訂單摘要</h3>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>商品</span>
                <span className="text-foreground font-medium">{planInfo.product_name}</span>
              </div>
              <div className="flex justify-between">
                <span>天數</span>
                <span>{planInfo.days} 天</span>
              </div>
              <div className="flex justify-between">
                <span>數量</span>
                <span>{qty}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border mt-2">
                <span className="font-medium text-foreground">合計</span>
                <span className="text-lg font-bold text-primary">{formatPrice(totalPrice)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Email */}
        <div>
          <label className="text-sm font-medium">Email（接收 eSIM 安裝資訊）</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Saved Cards */}
        {savedCards.length > 0 && (
          <div>
            <label className="text-sm font-medium">使用已儲存的卡片</label>
            <div className="mt-2 space-y-2">
              {savedCards.map((card) => (
                <label key={card.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    selectedCardId === card.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'
                  }`}>
                  <input type="radio" name="card" checked={selectedCardId === card.id}
                    onChange={() => setSelectedCardId(card.id)} className="accent-primary" />
                  <span className="text-lg">💳</span>
                  <div>
                    <div className="text-sm font-medium">•••• •••• •••• {card.last_four}</div>
                    <div className="text-xs text-muted-foreground">{card.issuer || '信用卡'}</div>
                  </div>
                </label>
              ))}
              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                selectedCardId === null ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'
              }`}>
                <input type="radio" name="card" checked={selectedCardId === null}
                  onChange={() => setSelectedCardId(null)} className="accent-primary" />
                <span className="text-lg">➕</span>
                <div className="text-sm font-medium">使用新卡片</div>
              </label>
            </div>
          </div>
        )}

        {/* Pay by saved card */}
        {selectedCardId ? (
          <button
            type="button"
            onClick={() => handlePrime('', 'credit_card')}
            disabled={loading || !email || totalPrice <= 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {loading ? '處理中...' : `使用已儲存卡片付款 ${formatPrice(totalPrice)}`}
          </button>
        ) : (
          <>
            {/* TapPay Card Form */}
            <TapPayForm
              onPrimeReady={handlePrime}
              loading={loading}
              disabled={!email || totalPrice <= 0}
              saveCard={saveCard}
              onSaveCardChange={setSaveCard}
              isInLineApp={isInLineApp}
            />
          </>
        )}
      </div>
    </div>
  )
}
