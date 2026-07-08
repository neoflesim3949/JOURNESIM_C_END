'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Wifi, CreditCard, Gift } from 'lucide-react'
import { TapPayForm } from '@/components/checkout/tappay-form'
import { formatPrice } from '@/lib/utils'
import { useCart } from '@/lib/cart'
import { trackPurchase, trackBeginCheckout } from '@/components/tracking/analytics'

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>}>
      <CheckoutContent />
    </Suspense>
  )
}

function CheckoutContent() {
  const { items, esimItems, simItems, totalPrice, clearCart } = useCart()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [orderComplete, setOrderComplete] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [savedCards, setSavedCards] = useState<{ id: string; last_four: string; card_type: string; issuer: string }[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [saveCard, setSaveCard] = useState(false)
  const [isInLineApp, setIsInLineApp] = useState(false)
  const [shippingName, setShippingName] = useState('')
  const [shippingPhone, setShippingPhone] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0)
  const [availablePoints, setAvailablePoints] = useState<number>(0)
  const [isPointsLoading, setIsPointsLoading] = useState(false)
  const [provider, setProvider] = useState<'tappay' | 'antom'>('tappay')
  const hasSim = simItems.length > 0

  useEffect(() => {
    setIsInLineApp(/Line/i.test(navigator.userAgent))
    if (totalPrice > 0) trackBeginCheckout(totalPrice)
    fetch('/api/shop/tappay-config').then((r) => r.json()).then((d) => { if (d?.provider === 'antom') setProvider('antom') }).catch(() => {})
  }, [])

  // Antom（Alipay+）：建單(pending) → 建立 Antom 支付 → 跳轉收銀台
  async function handleAntom() {
    if (!email || items.length === 0) return
    if (hasSim && (!shippingName || !shippingPhone || !shippingAddress)) { alert('請填寫收件資料'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, items, payment_method: 'antom', provider: 'antom',
          points_to_redeem: pointsToRedeem,
          ...(hasSim ? { shipping_name: shippingName, shipping_phone: shippingPhone, shipping_address: shippingAddress } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '下單失敗'); setLoading(false); return }
      const created = await fetch('/api/payment/antom/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: data.order_number }),
      }).then((r) => r.json()).catch(() => null)
      if (created?.redirectUrl) { clearCart(); window.location.href = created.redirectUrl; return }
      alert(created?.error || 'Antom 建立支付失敗（請確認後台已填入 Antom 憑證）')
      setLoading(false)
    } catch {
      alert('下單失敗，請稍後再試'); setLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/shop/saved-cards').then((r) => r.json()).then(setSavedCards).catch(() => {})
    
    // 獲取用戶點數
    setIsPointsLoading(true)
    fetch('/api/account/affiliate').then(r => r.json()).then(data => {
      if (data.member) setAvailablePoints(data.member.points || 0)
    }).finally(() => setIsPointsLoading(false))
  }, [])

  async function handlePrime(prime: string, method: string) {
    if (!email || items.length === 0) return
    setLoading(true)

    try {
      const resultUrl = `${window.location.origin}/payment/result`

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          items,
          prime: selectedCardId ? undefined : prime,
          payment_method: method,
          result_url: resultUrl,
          save_card: saveCard,
          card_id: selectedCardId || undefined,
          points_to_redeem: pointsToRedeem,
          ...(hasSim ? { shipping_name: shippingName, shipping_phone: shippingPhone, shipping_address: shippingAddress } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '下單失敗')
        setLoading(false)
        return
      }

      const data = await res.json()

      if (data.payment_url) {
        window.location.href = data.payment_url
        return
      }

      setOrderId(data.order_id)
      setOrderNumber(data.order_number)
      setOrderComplete(true)
      trackPurchase({
        orderId: data.order_number,
        totalAmount: totalPrice,
        items: items.map((i) => ({ name: i.displayName, price: i.unitPrice, quantity: i.quantity })),
      })
      clearCart()
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
        <p className="mt-1 text-sm text-muted-foreground">我們將透過 Email 通知您訂單進度</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href={`/orders/${orderId}`} className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors">查看訂單</Link>
          <Link href="/shop" className="px-6 py-2.5 border border-border font-medium rounded-lg hover:bg-muted transition-colors">繼續購買</Link>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">購物車是空的</h1>
        <Link href="/shop" className="mt-4 inline-block text-primary hover:underline">&larr; 前往選購</Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/cart" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回購物車
      </Link>

      <h1 className="mt-6 text-2xl font-bold">結帳</h1>

      <div className="mt-8 space-y-6">
        {/* Order Summary */}
        <div className="p-4 bg-muted rounded-lg space-y-3">
          <h3 className="text-sm font-semibold">訂單摘要</h3>

          {esimItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
                <Wifi className="w-3.5 h-3.5" /> eSIM 商品
              </div>
              {esimItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">{item.packageName} · {item.displayName} × {item.quantity}</span>
                  <span className="font-medium">{formatPrice(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          {simItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                <CreditCard className="w-3.5 h-3.5" /> SIM 卡商品
              </div>
              {simItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">{item.packageName} · {item.displayName} × {item.quantity}</span>
                  <span className="font-medium">{formatPrice(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-3 border-t border-border">
            <span className="font-medium text-muted-foreground">折抵點數</span>
            <span className="font-medium text-orange-600">-{formatPrice(pointsToRedeem)}</span>
          </div>

          <div className="flex justify-between pt-3 border-t border-border">
            <span className="font-medium">合計</span>
            <span className="text-lg font-bold text-primary">{formatPrice(Math.max(0, totalPrice - pointsToRedeem))}</span>
          </div>

          {esimItems.length > 0 && simItems.length > 0 && (
            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
              訂單將拆分為 eSIM 子訂單（即時發送）和 SIM 子訂單（需配卡寄送）
            </div>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">聯絡資訊</h3>
          <div>
            <label className="text-sm font-medium">Email（接收訂單通知）</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">姓名 {hasSim && <span className="text-red-500">*</span>}</label>
              <input value={shippingName} onChange={(e) => setShippingName(e.target.value)}
                placeholder="收件人姓名" required={hasSim}
                className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <div>
              <label className="text-sm font-medium">電話 {hasSim && <span className="text-red-500">*</span>}</label>
              <input value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)}
                placeholder="0912-345-678" required={hasSim}
                className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
          </div>
          {hasSim && (
            <div>
              <label className="text-sm font-medium">寄送地址 <span className="text-red-500">*</span></label>
              <input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="完整收件地址" required
                className="mt-1 w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              <p className="mt-1 text-xs text-muted-foreground">SIM 卡將寄送至此地址</p>
            </div>
          )}
        </div>

          {/* Points Redemption */}
          {availablePoints > 0 && (
            <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                  <Gift className="w-4 h-4" /> 點數折抵
                </div>
                <div className="text-xs text-orange-600">
                  可用餘額: {Math.floor(availablePoints)} P
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={pointsToRedeem || ''}
                    onChange={(e) => {
                      const val = Math.min(Number(e.target.value), Math.floor(availablePoints), totalPrice)
                      setPointsToRedeem(val > 0 ? val : 0)
                    }}
                    placeholder="輸入折抵點數"
                    className="w-full pl-3 pr-8 py-2 border border-orange-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-400 font-bold">P</span>
                </div>
                <button
                  onClick={() => setPointsToRedeem(Math.min(Math.floor(availablePoints), totalPrice))}
                  className="px-3 py-2 bg-orange-100 text-orange-700 text-xs font-bold rounded-md hover:bg-orange-200 transition-colors"
                >
                  全部折抵
                </button>
              </div>
              <p className="text-[10px] text-orange-600/80">1 點可折抵 NT$1</p>
            </div>
          )}

          {/* 付款：依後台「前台金流供應商」切換 */}
          {provider === 'antom' ? (
            <div className="mt-2">
              <button
                onClick={handleAntom}
                disabled={loading || !email || totalPrice <= 0 || (hasSim && (!shippingName || !shippingPhone || !shippingAddress))}
                className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {loading ? '前往付款中…' : `前往付款 ${formatPrice(totalPrice)}（Antom）`}
              </button>
              <p className="mt-2 text-xs text-muted-foreground text-center">將導向 Antom（Alipay+）收銀台完成付款</p>
            </div>
          ) : (
            <TapPayForm
              onPrimeReady={handlePrime}
              loading={loading}
              disabled={!email || totalPrice <= 0 || (hasSim && (!shippingName || !shippingPhone || !shippingAddress))}
              saveCard={saveCard}
              onSaveCardChange={setSaveCard}
              isInLineApp={isInLineApp}
              savedCards={savedCards}
              selectedCardId={selectedCardId}
              onSelectCard={setSelectedCardId}
            />
          )}
      </div>
    </div>
  )
}
