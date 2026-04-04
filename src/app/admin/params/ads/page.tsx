'use client'

import { useEffect, useState } from 'react'
import { Save, Globe, Megaphone } from 'lucide-react'

interface Setting { key: string; value: string }

const ADS_FIELDS = [
  { key: 'ga4_measurement_id', label: 'Google Analytics 4 (GA4)', placeholder: 'G-XXXXXXXXXX', desc: '流量分析、使用者行為追蹤', group: 'google' },
  { key: 'google_ads_id', label: 'Google Ads Conversion ID', placeholder: 'AW-XXXXXXXXXX', desc: 'Google Ads 廣告轉換追蹤', group: 'google' },
  { key: 'google_ads_conversion_label', label: 'Google Ads 購買轉換 Label', placeholder: 'xXxXxXxXxXx', desc: '購買事件的 Conversion Label，在 Google Ads 後台取得', group: 'google' },
  { key: 'gtm_container_id', label: 'Google Tag Manager (GTM)', placeholder: 'GTM-XXXXXXX', desc: '選填，如使用 GTM 統一管理所有追蹤碼', group: 'google' },
  { key: 'meta_pixel_id', label: 'Meta Pixel ID', placeholder: '123456789012345', desc: 'Facebook / Instagram 廣告轉換追蹤與再行銷', group: 'meta' },
  { key: 'meta_conversions_api_token', label: 'Meta Conversions API Token', placeholder: 'EAAxxxxxxxxx...', desc: '選填，伺服器端轉換追蹤（提高歸因準確度）', group: 'meta' },
]

export default function AdminAdsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edited, setEdited] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch('/api/admin/settings').then((r) => r.json()).then(setSettings).finally(() => setLoading(false))
  }, [])

  function getValue(key: string) {
    if (edited.has(key)) return edited.get(key)!
    return settings.find((s) => s.key === key)?.value || ''
  }

  function handleChange(key: string, value: string) {
    setEdited((prev) => new Map(prev).set(key, value))
  }

  async function handleSave() {
    if (edited.size === 0) return
    setSaving(true)
    const updates = Array.from(edited.entries()).map(([key, value]) => ({ key, value }))
    await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    const res = await fetch('/api/admin/settings')
    if (res.ok) setSettings(await res.json())
    setEdited(new Map())
    setSaving(false)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  const googleFields = ADS_FIELDS.filter((f) => f.group === 'google')
  const metaFields = ADS_FIELDS.filter((f) => f.group === 'meta')

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">廣告追蹤管理</h1>
          <p className="mt-1 text-sm text-gray-500">設定 Google 和 Meta 廣告追蹤碼，前台自動載入</p>
        </div>
        {edited.size > 0 && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? '儲存中...' : `儲存（${edited.size} 項）`}
          </button>
        )}
      </div>

      {/* Google */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <Globe className="w-5 h-5 text-blue-500" />
          Google 追蹤
        </h2>
        <p className="text-xs text-gray-500 mt-1">GA4、Google Ads、GTM 共用 gtag.js 載入</p>

        <div className="mt-4 space-y-4">
          {googleFields.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-medium">{f.label}</label>
              <input value={getValue(f.key)} onChange={(e) => handleChange(f.key, e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" placeholder={f.placeholder} />
              <p className="text-xs text-gray-400 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <Megaphone className="w-5 h-5 text-blue-600" />
          Meta 追蹤
        </h2>
        <p className="text-xs text-gray-500 mt-1">Facebook Pixel + Conversions API</p>

        <div className="mt-4 space-y-4">
          {metaFields.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-medium">{f.label}</label>
              <input value={getValue(f.key)} onChange={(e) => handleChange(f.key, e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" placeholder={f.placeholder} />
              <p className="text-xs text-gray-400 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 追蹤事件說明 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
        <p className="font-medium">自動追蹤的事件</p>
        <ul className="mt-2 space-y-1 text-xs text-blue-600">
          <li>• <strong>PageView</strong> — 每次頁面載入</li>
          <li>• <strong>AddToCart</strong> — 加入購物車</li>
          <li>• <strong>InitiateCheckout</strong> — 進入結帳頁</li>
          <li>• <strong>Purchase</strong> — 完成付款（含金額、訂單號）</li>
        </ul>
      </div>
    </div>
  )
}
