// Antom Web SDK（ams-checkout v2，js.antom.com/v2 v2.0.20+）
// 官方 Payment Element 正解：用 AMSElement 類別（new AMSElement({environment,locale,sessionData})
//  → element.mount({type:'payment',...}, selector) → element.submitPayment()）。
// AMSCashierPayment 是「收銀台/drop-in」，非 Payment Element。
const ANTOM_SDK = 'https://js.antom.com/v2/ams-checkout.js'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AMSElement?: new (cfg: Record<string, unknown>) => any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AMSCashierPayment?: new (cfg: Record<string, unknown>) => any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AMSPaymentElement?: new (cfg: Record<string, unknown>) => any
  }
}

// 載入 SDK <script>（只載一次）
function ensureScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'))
    if (window.AMSElement || window.AMSCashierPayment || window.AMSPaymentElement) return resolve()
    const existing = document.querySelector(`script[src="${ANTOM_SDK}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('sdk load fail')))
      return
    }
    const s = document.createElement('script')
    s.src = ANTOM_SDK
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('sdk load fail'))
    document.body.appendChild(s)
  })
}

// 傳統收銀台 / 綁卡（AMSCashierPayment）
export async function loadAntomSdk(): Promise<Window['AMSCashierPayment'] | null> {
  try { await ensureScript() } catch { return null }
  return window.AMSCashierPayment || null
}

// Payment Element（官方正解）：AMSElement（new AMSElement({sessionData}) → mount() → submitPayment()）
export async function loadAntomElement(): Promise<Window['AMSElement'] | null> {
  try { await ensureScript() } catch { return null }
  return window.AMSElement || null
}

// 彈窗模式（保留介面；目前前台不提供彈窗選項）：同一支 1.47.0 SDK
export async function loadAntomPopup(): Promise<Window['AMSCashierPayment'] | null> {
  try { await ensureScript() } catch { return null }
  return window.AMSCashierPayment || null
}

// 掛載 Antom 元件（收銀台 sessionData 或綁卡 vaultingSessionData）到指定容器選擇器
export async function mountAntom(sessionData: string, selector: string, environment: 'prod' | 'sandbox') {
  const SDK = await loadAntomSdk()
  if (!SDK) throw new Error('無法載入 Antom SDK')
  const inst = new SDK({ environment, locale: 'zh_TW', onEventCallback: () => { }, onError: () => { } })
  const opts = { sessionData, appearance: { showSubmitButton: true } }
  if (typeof inst.mountComponent === 'function') {
    await inst.mountComponent(opts, selector)
  } else if (typeof inst.createComponent === 'function') {
    const comp = await inst.createComponent(opts)
    if (comp?.mount) await comp.mount(selector)
  } else {
    throw new Error('SDK 無 mountComponent/createComponent 方法')
  }
  return inst
}
