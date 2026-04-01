'use client'

import { useEffect, useRef, useState } from 'react'
import { CreditCard, Smartphone } from 'lucide-react'

declare global {
  interface Window {
    TPDirect: {
      setupSDK: (appId: number, appKey: string, env: string) => void
      card: {
        setup: (config: Record<string, unknown>) => void
        onUpdate: (cb: (update: { canGetPrime: boolean; status: { number: number; expiry: number; ccv: number } }) => void) => void
        getPrime: (cb: (result: { status: number; card: { prime: string }; msg: string }) => void) => void
      }
      linePay: { getPrime: (cb: (result: { status: number; prime: string; msg: string }) => void) => void }
      jkoPay: { getPrime: (cb: (result: { status: number; prime: string; msg: string }) => void) => void }
      pxpayPlus: { getPrime: (cb: (result: { status: number; prime: string; msg: string }) => void) => void }
    }
  }
}

type PaymentMethod = 'credit_card' | 'line_pay' | 'apple_pay' | 'jko_pay' | 'pxpay'

interface TapPayFormProps {
  onPrimeReady: (prime: string, method: string) => void
  loading: boolean
  disabled: boolean
}

export function TapPayForm({ onPrimeReady, loading, disabled }: TapPayFormProps) {
  const [sdkReady, setSdkReady] = useState(false)
  const [canGetPrime, setCanGetPrime] = useState(false)
  const [cardError, setCardError] = useState('')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('credit_card')
  const [enabledMethods, setEnabledMethods] = useState<Record<string, boolean>>({ credit_card: true })
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    fetch('/api/shop/tappay-config')
      .then((r) => r.json())
      .then((config) => {
        setEnabledMethods(config.methods || { credit_card: true })

        const script = document.createElement('script')
        script.src = 'https://js.tappaysdk.com/sdk/tpdirect/v5.20.0'
        script.onload = () => {
          const appId = config.app_id || Number(process.env.NEXT_PUBLIC_TAPPAY_APP_ID)
          const appKey = config.app_key || process.env.NEXT_PUBLIC_TAPPAY_APP_KEY!
          const env = config.env === 'production' ? 'production' : 'sandbox'

          window.TPDirect.setupSDK(appId, appKey, env)

          window.TPDirect.card.setup({
            fields: {
              number: { element: '#card-number', placeholder: '4242 4242 4242 4242' },
              expirationDate: { element: '#card-expiry', placeholder: 'MM / YY' },
              ccv: { element: '#card-ccv', placeholder: 'CCV' },
            },
            styles: {
              'input': { 'font-size': '14px', 'color': '#333' },
              ':focus': { 'color': '#333' },
              '.valid': { 'color': '#333' },
              '.invalid': { 'color': '#ef4444' },
            },
          })

          window.TPDirect.card.onUpdate((update) => {
            setCanGetPrime(update.canGetPrime)
            if (update.status.number === 2) setCardError('卡號格式錯誤')
            else if (update.status.expiry === 2) setCardError('到期日格式錯誤')
            else if (update.status.ccv === 2) setCardError('CCV 格式錯誤')
            else setCardError('')
          })

          setSdkReady(true)
        }
        document.head.appendChild(script)
      })
  }, [])

  function handleSubmit() {
    setCardError('')

    try {
      if (selectedMethod === 'credit_card') {
        if (!canGetPrime) return
        window.TPDirect.card.getPrime((result) => {
          if (result.status !== 0) { setCardError(result.msg || '取得付款資訊失敗'); return }
          onPrimeReady(result.card.prime, 'credit_card')
        })
      } else if (selectedMethod === 'line_pay' || selectedMethod === 'jko_pay' || selectedMethod === 'pxpay') {
        // 跳轉型付款：不需要前端 getPrime，直接通知後端用特殊 prime 處理
        onPrimeReady(`redirect_${selectedMethod}`, selectedMethod)
      } else if (selectedMethod === 'apple_pay') {
        setCardError('Apple Pay 需要 HTTPS + Safari 環境，請部署到正式環境後使用')
      }
    } catch (err) {
      setCardError(`付款元件錯誤：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const allOptions: { id: PaymentMethod; label: string; icon: string }[] = [
    { id: 'credit_card', label: '信用卡', icon: '💳' },
    { id: 'line_pay', label: 'Line Pay', icon: '🟢' },
    { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
    { id: 'jko_pay', label: '街口支付', icon: '🏪' },
    { id: 'pxpay', label: 'PX Pay Plus', icon: '🛒' },
  ]

  const visibleOptions = allOptions.filter((o) => enabledMethods[o.id])
  const canSubmit = selectedMethod === 'credit_card' ? canGetPrime : sdkReady

  return (
    <div>
      <label className="text-sm font-medium">付款方式</label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {visibleOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => { setSelectedMethod(opt.id); setCardError('') }}
            className={`flex items-center gap-2 p-3 border rounded-lg text-sm font-medium transition-all text-left ${
              selectedMethod === opt.id
                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <span className="text-lg">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {selectedMethod === 'credit_card' && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">卡號</div>
            <div id="card-number" className="h-10 px-3 py-2 border border-gray-300 rounded-lg bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">到期日</div>
              <div id="card-expiry" className="h-10 px-3 py-2 border border-gray-300 rounded-lg bg-white" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">CCV</div>
              <div id="card-ccv" className="h-10 px-3 py-2 border border-gray-300 rounded-lg bg-white" />
            </div>
          </div>
          <p className="text-xs text-gray-400">測試卡號：4242 4242 4242 4242 / 01/28 / 123</p>
        </div>
      )}

      {selectedMethod === 'line_pay' && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg text-sm text-green-700">
          <p className="font-medium">Line Pay</p>
          <p className="mt-1 text-green-600">點擊下方按鈕後將跳轉至 Line Pay 完成付款</p>
        </div>
      )}
      {selectedMethod === 'apple_pay' && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
          <p className="font-medium">Apple Pay</p>
          <p className="mt-1 text-gray-600">需要 HTTPS + Safari 瀏覽器</p>
        </div>
      )}
      {selectedMethod === 'jko_pay' && (
        <div className="mt-4 p-4 bg-orange-50 rounded-lg text-sm text-orange-700">
          <p className="font-medium">街口支付</p>
          <p className="mt-1 text-orange-600">點擊下方按鈕後將跳轉至街口支付完成付款</p>
        </div>
      )}
      {selectedMethod === 'pxpay' && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          <p className="font-medium">PX Pay Plus</p>
          <p className="mt-1 text-blue-600">點擊下方按鈕後將跳轉至全聯支付完成付款</p>
        </div>
      )}

      {cardError && <p className="mt-2 text-xs text-red-500">{cardError}</p>}
      {!sdkReady && <p className="mt-2 text-xs text-gray-400">載入付款元件中...</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || loading || disabled}
        className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
      >
        {selectedMethod === 'credit_card' ? <CreditCard className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
        {loading ? '處理中...' : '確認付款'}
      </button>
    </div>
  )
}
