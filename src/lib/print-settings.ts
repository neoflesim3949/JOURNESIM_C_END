// 蝦皮列印設定（標籤/使用期限/寄件人/印章）— DB 為準、localStorage 為本地快取
// 列印元件（寄件單/收據）同步讀 localStorage；進頁先 hydrate 把 DB 值灌回 localStorage
export const PRINT_SETTING_KEYS = [
  'shopee_label_settings', 'shopee_expiry_date', 'shopee_sender_info', 'receipt_stamp_url',
] as const

export async function hydratePrintSettings(): Promise<Record<string, string>> {
  try {
    const d = await fetch('/api/admin/shopee/print-settings').then(r => r.json())
    const s: Record<string, string> = d.settings || {}
    const migrate: Record<string, string> = {}
    for (const k of PRINT_SETTING_KEYS) {
      if (!(k in s)) {
        // DB 沒有此 key → 保留本地值，並回填 DB（舊 localStorage 設定自動遷移）
        const local = localStorage.getItem(k)
        if (local) migrate[k] = local
        continue
      }
      if (s[k]) localStorage.setItem(k, s[k])
      else localStorage.removeItem(k)  // 空字串 = 已清除
    }
    if (Object.keys(migrate).length > 0) savePrintSettings(migrate)
    return s
  } catch { return {} }
}

// 寫 localStorage（即時生效）+ 背景存 DB
export function savePrintSettings(patch: Record<string, string>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v) localStorage.setItem(k, v)
    else localStorage.removeItem(k)
  }
  void fetch('/api/admin/shopee/print-settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: patch }),
  })
}
