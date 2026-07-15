'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Wifi, CreditCard, Gift } from 'lucide-react'
import { TapPayForm } from '@/components/checkout/tappay-form'
import { formatPrice } from '@/lib/utils'
import { useCart } from '@/lib/cart'
import { trackPurchase, trackBeginCheckout } from '@/components/tracking/analytics'
import { loadAntomElement } from '@/lib/antom-sdk'

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
  const [antomMounted, setAntomMounted] = useState(false)
  const [antomMethods, setAntomMethods] = useState<{ id: string; label: string }[]>([])
  const [antomMethod, setAntomMethod] = useState<string>('CARD')
  const [antomCards, setAntomCards] = useState<{ id: string; last_four: string; bin_code?: string | null; card_type: string; issuer: string; exp_month?: string | null; exp_year?: string | null }[]>([])
  const [antomCardId, setAntomCardId] = useState<string>('')  // 選中的已綁卡；'' = 使用新卡/其他方式
  const [providerReady, setProviderReady] = useState(false)   // 金流供應商 config 是否載入
  const [antomMsg, setAntomMsg] = useState('')                // SDK 事件/錯誤（畫面顯示，方便手機診斷）
  const [antomEvents, setAntomEvents] = useState<string[]>([]) // SDK 事件序列（診斷用）
  const [antomRenderMode, setAntomRenderMode] = useState<'element' | 'popup' | 'hosted'>('element') // 渲染模式（展示用）
  const [antomShowSubmit, setAntomShowSubmit] = useState(false) // 卡片/街口自建送出鍵（Apple Pay 用原生按鈕）
  const [antomSubmitting, setAntomSubmitting] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const antomInstanceRef = useRef<any>(null)                    // 已掛載的 Payment Element 實例（呼叫 submitPayment）
  const hasSim = simItems.length > 0

  useEffect(() => {
    setIsInLineApp(/Line/i.test(navigator.userAgent))
    // 還原上次選的收銀台模式（切換模式時會重載頁面以乾淨載入單一支 SDK）
    const savedMode = sessionStorage.getItem('antomRenderMode')
    if (savedMode === 'element' || savedMode === 'popup' || savedMode === 'hosted') setAntomRenderMode(savedMode)
    if (totalPrice > 0) trackBeginCheckout(totalPrice)
    fetch('/api/shop/tappay-config').then((r) => r.json()).then((d) => {
      if (d?.provider === 'antom') setProvider('antom')
      if (Array.isArray(d?.antomMethods) && d.antomMethods.length) {
        setAntomMethods(d.antomMethods)
        const def = String(d.antomDefault || d.antomMethods[0].id).toUpperCase()
        setAntomMethod(d.antomMethods.some((m: { id: string }) => m.id === def) ? def : d.antomMethods[0].id)
      }
    }).catch(() => {}).finally(() => setProviderReady(true))
  }, [])

  // 建立 Antom pending 訂單，回 order_number
  async function createAntomOrder() {
    const res = await fetch('/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, items, payment_method: 'antom', provider: 'antom',
        points_to_redeem: pointsToRedeem,
        ...(hasSim ? { shipping_name: shippingName, shipping_phone: shippingPhone, shipping_address: shippingAddress } : {}),
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '下單失敗')
    return data.order_number as string
  }

  // Antom：建單(pending) → createPaymentSession → 前端 SDK 渲染收銀台
  // 新卡：登入會員刷卡時收銀台顯示原生「儲存卡片」勾選（tokenizeMode），付款後 webhook 存卡
  // 已綁卡：帶 card_id → session 以 paymentMethodId 帶出該卡（免重打卡號）
  async function handleAntom() {
    if (!email || items.length === 0) return
    if (hasSim && (!shippingName || !shippingPhone || !shippingAddress)) { alert('請填寫收件資料'); return }
    setLoading(true)
    try {
      let orderNumber: string
      try { orderNumber = await createAntomOrder() } catch (err) { alert(err instanceof Error ? err.message : '下單失敗'); setLoading(false); return }

      const s = await fetch('/api/payment/antom/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: orderNumber,
          payment_method: antomCardId ? 'CARD' : antomMethod,
          render_mode: antomRenderMode,
          ...(antomCardId ? { card_id: antomCardId } : {}),
        }),
      }).then((r) => r.json()).catch(() => null)
      // Apple Pay：後端回 redirect_url（託管頁）→ 直接跳轉
      if (s?.redirect_url) { window.location.href = s.redirect_url; return }
      if (!s?.paymentSessionData) { alert(s?.error || 'Antom 建立收銀台失敗（請確認後台憑證/設定）'); setLoading(false); return }

      // 註：不在前端擋非 Safari 瀏覽器（不擋 Chrome）；能否顯示 Apple Pay 交由 SDK 自行判斷。

      // 官方 Payment Element：AMSElement（hosted 已於上方 redirect_url 跳轉，不會到這）
      const SDK = await loadAntomElement()
      if (!SDK) { alert('無法載入 Antom 收銀台，請稍後再試'); setLoading(false); return }

      setAntomMounted(true)
      setAntomShowSubmit(false)
      setAntomEvents([])
      // Safari 手機看不到 console → 攔截 SDK 內部 console.log/error 顯示到畫面（診斷 Apple Pay merchant validation）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      if (!w.__antomLogPatched) {
        w.__antomLogPatched = true
        const o = { log: console.log.bind(console), error: console.error.bind(console), warn: console.warn.bind(console) }
        const cap = (tag: string) => (...args: unknown[]) => {
          try {
            const msg = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
            if (/merchant|validat|apple|createcomponent|submitpayment|error|fail|cancel|unsupported|session|plugin|network|capabilit|countr|currenc|dismiss|abort/i.test(msg)) {
              // merchant session 那行放長，以便看 domainName / initiativeContext（診斷網域不符）
              const len = /merchantsessionobjectstring|domainname|initiativecontext|validatemerchant/i.test(msg) ? 900 : 320
              setAntomEvents((prev) => [...prev, `${tag}｜${msg.slice(0, len)}`].slice(-24))
            }
          } catch { /* ignore */ }
        }
        console.log = (...a: unknown[]) => { cap('log')(...a); o.log(...a) }
        console.error = (...a: unknown[]) => { cap('ERR')(...a); o.error(...a) }
        console.warn = (...a: unknown[]) => { cap('warn')(...a); o.warn(...a) }

        // 攔截 fetch / XHR：把 SDK 打去 alipay/antom 的 merchant validation 請求 body 顯示到畫面
        // 並嘗試把 body 內的 checkout.antom.com → www.flesim.com（若 Antom 依 body 網域簽發，即可修正）
        const isApayHost = (u: string) => /alipay\.com|antom/i.test(u) && /merchant|apay|apple|payment_session|validate|risk_client|open/i.test(u)
        const rewriteBody = (b: string) => {
          if (typeof b !== 'string' || b.indexOf('checkout.antom.com') === -1) return b
          const nb = b.split('checkout.antom.com').join('www.flesim.com')
          setAntomEvents((prev) => [...prev, `REWRITE｜checkout.antom.com→www.flesim.com`].slice(-24))
          return nb
        }
        const origFetch = window.fetch.bind(window)
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          let nextInit = init
          try {
            const url = typeof input === 'string' ? input : (input as Request)?.url || String(input)
            const body = init?.body
            if (isApayHost(url) && typeof body === 'string') {
              setAntomEvents((prev) => [...prev, `FETCH｜${url.slice(0, 60)}｜${body.slice(0, 400)}`].slice(-24))
              nextInit = { ...(init as RequestInit), body: rewriteBody(body) }
            }
          } catch { /* ignore */ }
          return origFetch(input, nextInit)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const XHR = XMLHttpRequest.prototype as any
        const origOpen = XHR.open, origSend = XHR.send
        XHR.open = function (m: string, u: string, ...rest: unknown[]) { this.__antomUrl = u; return origOpen.call(this, m, u, ...rest) }
        XHR.send = function (body?: unknown) {
          let nextBody = body
          try {
            const u = this.__antomUrl || ''
            if (isApayHost(u) && typeof body === 'string') {
              setAntomEvents((prev) => [...prev, `XHR｜${String(u).slice(0, 60)}｜${(body as string).slice(0, 400)}`].slice(-24))
              nextBody = rewriteBody(body as string)
            }
          } catch { /* ignore */ }
          return origSend.call(this, nextBody as XMLHttpRequestBodyInit)
        }
      }
      let elementDone = false
      // 官方 Payment Element 正解：new AMSElement({environment,locale,sessionData}) → element.mount({type:'payment',…}, selector)
      //   → 自訂按鈕點擊呼叫 element.submitPayment()。sessionData 在建構子傳（勿改動 paymentSessionData）。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = new SDK({
        environment: s.environment === 'prod' ? 'prod' : 'sandbox',
        locale: 'zh_TW',
        sessionData: s.paymentSessionData,
      })
      antomInstanceRef.current = element
      // 載入逾時偵測：8 秒內未完成
      setTimeout(() => { if (!elementDone) setAntomMsg('元件載入逾時（8s 未完成），請截圖此畫面回報。') }, 8000)
      // mount：type=payment、singleOption=skip（單一方式跳過列表直接進付款流程）
      // singleOption:'list' → 顯示付款方式（SDK 渲染 Apple Pay 按鈕，由使用者手勢觸發）；
      // 'skip' 會在載入當下強行進付款流程，Apple Pay 因非手勢而空白 + appHeartBeatTimeout。
      await element.mount(
        { type: 'payment', appearance: { theme: 'default' }, notRedirectAfterComplete: false, merchantAppointParam: { singleOption: 'list' } },
        '#antom-container',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ).then((r: any) => {
        const err = r?.error
        if (err?.code) { setAntomEvents((prev) => [...prev, `mount error:${err.code}`].slice(-24)); setAntomMsg(`載入失敗：${err.message || err.code}`) }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).catch((e: any) => { setAntomEvents((prev) => [...prev, `mount catch:${e?.code || e?.message || e}`].slice(-24)); setAntomMsg(`載入失敗：${e?.message || e}`) })
      elementDone = true
      setAntomMsg('')
      // 已綁定卡片自動送出；其餘（新卡/街口/Apple Pay）顯示自訂送出鍵 → submitPayment()
      if (antomCardId) void handleAntomSubmit()
      else setAntomShowSubmit(true)
      setLoading(false)
    } catch (e) {
      console.error('[antom] mount error', e)
      alert('付款初始化失敗：' + (e instanceof Error ? e.message : String(e))); setLoading(false)
    }
  }

  // 卡片/街口 送出付款：呼叫 Payment Element 的 submitPayment() 並依 Antom 官方回傳處理
  async function handleAntomSubmit() {
    const inst = antomInstanceRef.current
    if (!inst || typeof inst.submitPayment !== 'function') { setAntomMsg('付款元件尚未就緒，請稍候再試'); return }
    setAntomSubmitting(true); setAntomMsg('')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { status, userCanceled3D, session, error } = (await inst.submitPayment()) as any
      setAntomEvents((prev) => [...prev, `submit｜status=${status}${error ? ' err=' + (error.code || '') : ''}`].slice(-24))
      const toResult = () => { window.location.href = `/payment/result?provider=antom&order_number=${encodeURIComponent(orderNumber)}` }
      if (error) {
        const code = error?.code || ''
        if (userCanceled3D || status === 'PROCESSING') { toResult(); return }  // 結果未定 → 到結果頁輪詢
        if (code === 'FORM_INVALID') { setAntomMsg(''); return }                // 表單錯誤 SDK 已提示
        setAntomMsg(`付款未完成：${error?.message || code}`)
        return
      }
      // 官方：若 session.nextAction 有跳轉連結（掃碼/APM），依裝置導向
      const next = session?.nextAction
      if (next?.normalUrl || next?.schemeUrl || next?.appLinkUrl) { window.location.href = next.normalUrl || next.schemeUrl || next.appLinkUrl; return }
      if (status === 'SUCCESS' || status === 'PROCESSING') { toResult(); return }
      if (status === 'CANCELLED') { setAntomMsg('已取消付款'); return }
      toResult()
    } catch (e) {
      console.error('[antom] submit error', e)
      setAntomMsg('送出付款失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally { setAntomSubmitting(false) }
  }

  useEffect(() => {
    fetch('/api/shop/saved-cards').then((r) => r.json()).then((all) => {
      const list = Array.isArray(all) ? all : []
      setSavedCards(list)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAntomCards(list.filter((c: any) => c.provider === 'antom'))
    }).catch(() => {})

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

          {/* 付款：依後台「前台金流供應商」切換（config 未載入前先不掛表單，避免 TapPay 誤初始化） */}
          {!providerReady ? (
            <div className="mt-2 py-6 text-center text-sm text-muted-foreground">載入付款方式…</div>
          ) : provider === 'antom' ? (
            <div className="mt-2">
              {/* 已綁定卡片：一鍵付款 */}
              {!antomMounted && antomCards.length > 0 && (
                <div className="mb-3 space-y-2">
                  <p className="text-sm font-medium">已綁定卡片</p>
                  <div className="grid grid-cols-1 gap-2">
                    {antomCards.map((c) => (
                      <label key={c.id}
                        className={`flex items-center gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-colors ${antomCardId === c.id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="antomCard" checked={antomCardId === c.id} onChange={() => setAntomCardId(c.id)} className="accent-primary" />
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium font-mono">{c.bin_code ? `${c.bin_code}••${c.last_four}` : `•••• ${c.last_four}`}</span>
                        <span className="text-xs text-muted-foreground">{c.issuer || '信用卡'}</span>
                      </label>
                    ))}
                    <label className={`flex items-center gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-colors ${antomCardId === '' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="antomCard" checked={antomCardId === ''} onChange={() => setAntomCardId('')} className="accent-primary" />
                      <span className="text-sm font-medium">使用新卡片 / 其他付款方式</span>
                    </label>
                  </div>
                </div>
              )}
              {/* 付款方式選擇（顧客自選：信用卡 / 街口…）— 僅在未選已綁卡時顯示 */}
              {!antomMounted && !antomCardId && antomMethods.length > 1 && (
                <div className="mb-3 space-y-2">
                  <p className="text-sm font-medium">選擇付款方式</p>
                  <div className="grid grid-cols-1 gap-2">
                    {antomMethods.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-colors ${antomMethod === m.id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <input
                          type="radio"
                          name="antomMethod"
                          value={m.id}
                          checked={antomMethod === m.id}
                          onChange={() => setAntomMethod(m.id)}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {/* 渲染模式選擇器（展示用：嵌入式 / 彈窗 / 托管）*/}
              {!antomMounted && (
                <div className="mb-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">收銀台模式（展示用）</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'element', label: '嵌入式' },
                      { id: 'hosted', label: '托管跳轉' },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          // 已載過 SDK 才切換 → 重載頁面乾淨載入（避免 v2/marmot 兩支 SDK 污染 window）
                          sessionStorage.setItem('antomRenderMode', m.id)
                          if (antomMounted) window.location.reload()
                          else setAntomRenderMode(m.id)
                        }}
                        className={`px-2 py-2 text-xs rounded-lg border transition-colors ${antomRenderMode === m.id ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!antomMounted && (
                <button
                  onClick={handleAntom}
                  disabled={loading || !email || totalPrice <= 0 || (hasSim && (!shippingName || !shippingPhone || !shippingAddress))}
                  className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {loading ? '處理中…' : antomCardId ? `使用此卡付款 ${formatPrice(totalPrice)}` : `前往付款 ${formatPrice(totalPrice)}`}
                </button>
              )}
              {/* 嵌入式 Payment Element 掛載容器 */}
              <div id="antom-container" className="mt-3" />
              {/* 自訂送出鍵 → submitPayment()（官方 Payment Element：含 Apple Pay 皆用自訂按鈕）*/}
              {antomShowSubmit && (
                <button
                  onClick={handleAntomSubmit}
                  disabled={antomSubmitting}
                  className={`w-full mt-3 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 ${!antomCardId && antomMethod === 'APPLEPAY' ? 'bg-black text-white hover:bg-gray-800' : 'bg-primary text-white hover:bg-primary-hover'}`}
                >
                  {antomSubmitting ? '付款送出中…' : (!antomCardId && antomMethod === 'APPLEPAY' ? ` Pay 付款` : `確認付款 ${formatPrice(totalPrice)}`)}
                </button>
              )}
              {antomMsg &&<p className="mt-3 text-sm text-center font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 break-words">{antomMsg}</p>}
              {antomEvents.length > 0 && (
                <div className="mt-2 text-[10px] text-left text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono space-y-0.5 max-h-72 overflow-auto">
                  {antomEvents.map((e, i) => <div key={i} className="break-all leading-tight">{e}</div>)}
                </div>
              )}
              {!antomMounted && <p className="mt-2 text-xs text-muted-foreground text-center">{antomCardId ? '將帶出綁定卡片於收銀台完成付款' : '將以 Antom 收銀台完成付款'}</p>}
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
