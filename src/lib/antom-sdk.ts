// Antom Web SDK（ams-checkout）loader — 收銀台與綁卡共用同一顆 AMSCashierPayment
// v2 Payment Element（新版）：Apple Pay 等錢包按鈕會依 session 設定（productScene=ELEMENT_PAYMENT）自動內嵌渲染
const ANTOM_SDK = 'https://js.antom.com/v2/ams-checkout.js'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AMSCashierPayment?: new (cfg: Record<string, unknown>) => any
  }
}

export function loadAntomSdk(): Promise<Window['AMSCashierPayment'] | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    if (window.AMSCashierPayment) return resolve(window.AMSCashierPayment)
    const s = document.createElement('script')
    s.src = ANTOM_SDK
    s.async = true
    s.onload = () => resolve(window.AMSCashierPayment || null)
    s.onerror = () => resolve(null)
    document.body.appendChild(s)
  })
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
