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

interface SavedCard {
  id: string
  last_four: string
  card_type: string
  issuer: string
}

interface TapPayFormProps {
  onPrimeReady: (prime: string, method: string) => void
  loading: boolean
  disabled: boolean
  saveCard: boolean
  onSaveCardChange: (checked: boolean) => void
  isInLineApp?: boolean
  savedCards: SavedCard[]
  selectedCardId: string | null
  onSelectCard: (id: string | null) => void
}

export function TapPayForm({
  onPrimeReady, loading, disabled, saveCard, onSaveCardChange,
  isInLineApp, savedCards, selectedCardId, onSelectCard,
}: TapPayFormProps) {
  const [sdkReady, setSdkReady] = useState(false)
  const [canGetPrime, setCanGetPrime] = useState(false)
  const [cardError, setCardError] = useState('')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(isInLineApp ? 'line_pay' : 'credit_card')
  const [methodOptions, setMethodOptions] = useState<{ id: string; enabled: boolean; label: string; icons: string[]; sort: number }[]>([
    { id: 'credit_card', enabled: true, label: '信用卡', icons: [], sort: 0 },
  ])
  const [cardTypeIcons, setCardTypeIcons] = useState<Record<string, string>>({})
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    fetch('/api/shop/tappay-config')
      .then((r) => r.json())
      .then((config) => {
        setCardTypeIcons(config.cardTypeIcons || {})
        const methods = (config.methods || []).map((m: { id: string; enabled: boolean; label: string; icons: string[] }, i: number) => ({
          ...m,
          sort: i,
        }))
        setMethodOptions(methods.length > 0 ? methods : [{ id: 'credit_card', enabled: true, label: '信用卡', icons: [], sort: 0 }])

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

    // 使用已儲存卡片
    if (selectedMethod === 'credit_card' && selectedCardId) {
      onPrimeReady('', 'credit_card')
      return
    }

    try {
      if (selectedMethod === 'credit_card') {
        if (!canGetPrime) return
        window.TPDirect.card.getPrime((result) => {
          if (result.status !== 0) { setCardError(result.msg || '取得付款資訊失敗'); return }
          onPrimeReady(result.card.prime, 'credit_card')
        })
      } else if (selectedMethod === 'line_pay') {
        window.TPDirect.linePay.getPrime((result: { status: number; prime: string; msg: string }) => {
          if (result.status !== 0) { setCardError(result.msg || 'Line Pay 啟動失敗'); return }
          onPrimeReady(result.prime, 'line_pay')
        })
      } else if (selectedMethod === 'jko_pay') {
        window.TPDirect.jkoPay.getPrime((result: { status: number; prime: string; msg: string }) => {
          if (result.status !== 0) { setCardError(result.msg || '街口支付啟動失敗'); return }
          onPrimeReady(result.prime, 'jko_pay')
        })
      } else if (selectedMethod === 'pxpay') {
        window.TPDirect.pxpayPlus.getPrime((result: { status: number; prime: string; msg: string }) => {
          if (result.status !== 0) { setCardError(result.msg || 'PX Pay 啟動失敗'); return }
          onPrimeReady(result.prime, 'pxpay')
        })
      } else if (selectedMethod === 'apple_pay') {
        setCardError('Apple Pay 需要 HTTPS + Safari 環境')
      }
    } catch (err) {
      setCardError(`付款元件錯誤：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const defaultIcons: Record<string, string> = {
    credit_card: '💳', line_pay: '🟢', apple_pay: '🍎', jko_pay: '🏪', pxpay: '🛒',
  }

  const visibleOptions = methodOptions.filter((o) => o.enabled).sort((a, b) => a.sort - b.sort)
  const lineAppAllowed = ['credit_card', 'line_pay']
  const isMethodBlockedByLine = isInLineApp && !lineAppAllowed.includes(selectedMethod)
  const canSubmit = isMethodBlockedByLine ? false
    : selectedMethod === 'credit_card'
      ? (selectedCardId ? true : canGetPrime)
      : sdkReady

  return (
    <div>
      <label className="text-sm font-medium">付款方式</label>
      <div className="mt-2 space-y-2">
        {visibleOptions.map((opt) => {
          const isSelected = selectedMethod === opt.id
          return (
            <div key={opt.id}>
              {/* 付款方式按鈕 */}
              <button
                type="button"
                onClick={() => { setSelectedMethod(opt.id as PaymentMethod); setCardError(''); onSelectCard(null) }}
                className={`w-full flex items-center gap-3 p-3 border rounded-lg text-sm font-medium transition-all text-left ${isSelected
                    ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                  }`}
              >
                {opt.icons && opt.icons.length > 0 ? (
                  <span className="flex items-center gap-1">
                    {opt.icons.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" className="w-6 h-6 object-contain" />
                    ))}
                  </span>
                ) : (
                  <span className="text-lg">{defaultIcons[opt.id] || '💰'}</span>
                )}
                {opt.label}
              </button>

              {/* 信用卡展開區域：已儲存卡片 + 新卡片輸入 */}
              {isSelected && opt.id === 'credit_card' && (
                <div className="mt-2 p-4 bg-gray-50 rounded-lg space-y-3">
                  {/* 已儲存的卡片 */}
                  {savedCards.length > 0 && (
                    <div className="space-y-2">
                      {savedCards.map((card) => (
                        <label key={card.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${selectedCardId === card.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                            }`}>
                          <input type="radio" name="card" checked={selectedCardId === card.id}
                            onChange={() => onSelectCard(card.id)} className="accent-primary" />
                          {cardTypeIcons[card.card_type] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cardTypeIcons[card.card_type]} alt="" className="w-8 h-6 object-contain" />
                          ) : (
                            <div className="w-8 h-6 bg-gray-100 rounded flex items-center justify-center">
                              <CreditCard className="w-4 h-4 text-gray-500" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium">•••• •••• •••• {card.last_four}</div>
                            <div className="text-xs text-muted-foreground">{card.issuer || '信用卡'}</div>
                          </div>
                        </label>
                      ))}
                      <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${selectedCardId === null ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                        }`}>
                        <input type="radio" name="card" checked={selectedCardId === null}
                          onChange={() => onSelectCard(null)} className="accent-primary" />
                        <div className="w-8 h-6 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">+</div>
                        <div className="text-sm font-medium">使用新卡片</div>
                      </label>
                    </div>
                  )}

                  {/* 新卡片輸入（沒有已儲存卡片，或選了「使用新卡片」） */}
                  {selectedCardId === null && (
                    <div className="space-y-3">
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
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={saveCard} onChange={(e) => onSaveCardChange(e.target.checked)} className="accent-primary" />
                        <span className="text-sm text-gray-500">儲存此卡片，下次免重新輸入</span>
                      </label>
                      <p className="text-xs text-gray-400">測試卡號：4242 4242 4242 4242 / 01/28 / 123</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          )
        })}
      </div>

      {/* Line 瀏覽器限制提示 */}
      {isMethodBlockedByLine && (
        <div className="mt-4 p-4 bg-red-50 rounded-lg text-sm text-red-700">
          <p className="font-medium">Line 應用不支援此支付方式</p>
          <p className="mt-1 text-red-600">請使用信用卡或 Line Pay，或點右下角「⋯」選擇「在瀏覽器中開啟」</p>
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
        {loading ? '處理中...' : selectedCardId ? `使用已儲存卡片付款` : '確認付款'}
      </button>
    </div>
  )
}
