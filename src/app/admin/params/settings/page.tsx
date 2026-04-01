'use client'

import { useEffect, useState } from 'react'
import { Save, CreditCard, Smartphone, Shield } from 'lucide-react'

interface Setting {
  key: string
  value: string
  description: string
}

const PAYMENT_METHODS = [
  { key: 'payment_credit_card', label: '信用卡（Direct Pay）', desc: '信用卡直接付款' },
  { key: 'payment_line_pay', label: 'Line Pay', desc: '台灣最常用電子錢包' },
  { key: 'payment_apple_pay', label: 'Apple Pay', desc: 'iOS / Safari 用戶' },
  { key: 'payment_google_pay', label: 'Google Pay', desc: 'Android / Chrome 用戶' },
  { key: 'payment_samsung_pay', label: 'Samsung Pay', desc: 'Samsung 裝置' },
  { key: 'payment_jko_pay', label: '街口支付', desc: 'JKO Pay' },
  { key: 'payment_pxpay', label: 'PX Pay Plus', desc: '全聯支付' },
]

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edited, setEdited] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch('/api/admin/settings').then((r) => r.json()).then(setSettings).finally(() => setLoading(false))
  }, [])

  function getValue(key: string) {
    return edited.has(key) ? edited.get(key)! : settings.find((s) => s.key === key)?.value || ''
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
    setEdited(new Map())
    // reload
    const res = await fetch('/api/admin/settings')
    if (res.ok) setSettings(await res.json())
    setSaving(false)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">系統設定</h1>
          <p className="mt-1 text-sm text-gray-500">金流參數與支付方式管理</p>
        </div>
        {edited.size > 0 && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? '儲存中...' : `儲存（${edited.size} 項）`}
          </button>
        )}
      </div>

      {/* Test Mode */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-orange-500" />
            <div>
              <div className="font-medium">測試模式</div>
              <div className="text-xs text-gray-500">開啟時不會呼叫 BillionConnect API 建立真實訂單</div>
            </div>
          </div>
          <button
            onClick={() => handleChange('test_mode', getValue('test_mode') === 'true' ? 'false' : 'true')}
            className={`relative w-12 h-6 rounded-full transition-colors ${getValue('test_mode') === 'true' ? 'bg-orange-500' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${getValue('test_mode') === 'true' ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* TapPay Settings */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="w-5 h-5" />
          TapPay 金流設定
        </h2>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">App ID</label>
              <input value={getValue('tappay_app_id')} onChange={(e) => handleChange('tappay_app_id', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="19672" />
            </div>
            <div>
              <label className="text-sm font-medium">環境</label>
              <select value={getValue('tappay_env')} onChange={(e) => handleChange('tappay_env', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="sandbox">Sandbox（測試）</option>
                <option value="production">Production（正式）</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">App Key（前端用）</label>
            <input value={getValue('tappay_app_key')} onChange={(e) => handleChange('tappay_app_key', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-xs" placeholder="app_..." />
          </div>
          <div>
            <label className="text-sm font-medium">Partner Key（後端用，選填）</label>
            <input value={getValue('tappay_partner_key')} onChange={(e) => handleChange('tappay_partner_key', e.target.value)}
              type="password"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-xs" placeholder="partner_..." />
            <p className="text-xs text-gray-400 mt-1">用於 Pay by Prime 後端扣款，沒有則使用前端模式</p>
          </div>
        </div>
      </div>

      {/* Merchant IDs per payment method */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="w-5 h-5" />
          Merchant ID（各付款方式）
        </h2>
        <p className="text-xs text-gray-500 mt-1">每種付款方式需要對應的 Merchant ID，請至 TapPay Portal → 商家管理 查詢</p>

        <div className="mt-4 space-y-3">
          {[
            { key: 'tappay_merchant_id', label: '信用卡（Direct Pay）', placeholder: 'tppf_simpay_GP_POS_3' },
            { key: 'tappay_merchant_id_line_pay', label: 'Line Pay', placeholder: 'simpay_LINE_PAY...' },
            { key: 'tappay_merchant_id_apple_pay', label: 'Apple Pay', placeholder: 'simpay_APPLE...' },
            { key: 'tappay_merchant_id_jko_pay', label: '街口支付（JKO Pay）', placeholder: 'simpay_JKO...' },
            { key: 'tappay_merchant_id_pxpay', label: 'PX Pay Plus（全聯）', placeholder: 'simpay_PX_PAY_PLUS_EC' },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-4">
              <label className="text-sm font-medium w-48 flex-shrink-0">{item.label}</label>
              <input
                value={getValue(item.key)}
                onChange={(e) => handleChange(item.key, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-xs"
                placeholder={item.placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <Smartphone className="w-5 h-5" />
          支付方式
        </h2>
        <p className="text-xs text-gray-500 mt-1">啟用的支付方式將顯示在結帳頁面</p>

        <div className="mt-4 space-y-4">
          {PAYMENT_METHODS.map((pm) => (
            <div key={pm.key} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{pm.label}</div>
                  <div className="text-xs text-gray-400">{pm.desc}</div>
                </div>
                <button
                  onClick={() => handleChange(pm.key, getValue(pm.key) === 'true' ? 'false' : 'true')}
                  className={`relative w-12 h-6 rounded-full transition-colors ${getValue(pm.key) === 'true' ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${getValue(pm.key) === 'true' ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              {/* 自訂名稱和 Icon */}
              {getValue(pm.key) === 'true' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">顯示名稱</label>
                    <input
                      value={getValue(`${pm.key}_label`)}
                      onChange={(e) => handleChange(`${pm.key}_label`, e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      placeholder={pm.label}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Icon URL（選填）</label>
                    <input
                      value={getValue(`${pm.key}_icon`)}
                      onChange={(e) => handleChange(`${pm.key}_icon`, e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      placeholder="https://example.com/icon.png"
                    />
                    {getValue(`${pm.key}_icon`) && (
                      <div className="mt-1 flex items-center gap-2">
                        <img src={getValue(`${pm.key}_icon`)} alt="icon" className="w-6 h-6 object-contain" />
                        <span className="text-xs text-gray-400">預覽</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
