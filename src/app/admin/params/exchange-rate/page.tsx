'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'

interface ExchangeRate {
  id: string
  currency: string
  rate: number
  updated_at: string
}

export default function AdminExchangeRatePage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cnyRate, setCnyRate] = useState('')
  const [cnyToTwd, setCnyToTwd] = useState('')
  const [message, setMessage] = useState('')

  async function loadRates() {
    const res = await fetch('/api/admin/exchange-rate')
    if (res.ok) {
      const data = await res.json()
      setRates(data)
      const cny = data.find((r: ExchangeRate) => r.currency === 'CNY')
      if (cny) {
        setCnyRate(String(cny.rate))
        setCnyToTwd(String(parseFloat((1 / cny.rate).toFixed(4))))
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadRates() }, [])

  async function handleSave() {
    if (!cnyRate) return
    setSaving(true)
    setMessage('')

    const res = await fetch('/api/admin/exchange-rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: 'CNY', rate: parseFloat(cnyRate) }),
    })

    if (res.ok) {
      setMessage('匯率已更新')
      await loadRates()
    } else {
      setMessage('更新失敗')
    }
    setSaving(false)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  const cnyRateData = rates.find((r) => r.currency === 'CNY')

  // 換算範例
  const rate = parseFloat(cnyRate) || 0
  const examples = rate > 0 ? [
    { cny: 10, twd: Math.round(10 / rate) },
    { cny: 50, twd: Math.round(50 / rate) },
    { cny: 100, twd: Math.round(100 / rate) },
  ] : []

  return (
    <div>
      <h1 className="text-2xl font-bold">匯率管理</h1>
      <p className="mt-1 text-sm text-gray-500">設定 CNY（人民幣）兌 TWD（台幣）的交易匯率，用於商品定價</p>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${message.includes('失敗') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message}
        </div>
      )}

      {/* 匯率設定 */}
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200">
        <h2 className="font-semibold">CNY ↔ TWD 交易匯率</h2>
        <p className="text-xs text-gray-500 mt-1">
          人工設定的固定匯率，用於將 BC 成本價（CNY）轉換為台幣售價（TWD）。任一欄輸入後自動換算另一欄。
        </p>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-medium">1 TWD = ? CNY</label>
            <input
              type="number"
              step="0.001"
              value={cnyRate}
              onChange={(e) => {
                const v = e.target.value
                setCnyRate(v)
                const num = parseFloat(v)
                if (num > 0) setCnyToTwd(String(parseFloat((1 / num).toFixed(4))))
              }}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-center text-lg"
              placeholder="0.217"
            />
            <p className="text-xs text-gray-400 mt-1 text-center">台幣兌人民幣</p>
          </div>
          <div>
            <label className="text-sm font-medium">1 CNY = ? TWD</label>
            <input
              type="number"
              step="0.01"
              value={cnyToTwd}
              onChange={(e) => {
                const v = e.target.value
                setCnyToTwd(v)
                const num = parseFloat(v)
                if (num > 0) setCnyRate(String(parseFloat((1 / num).toFixed(4))))
              }}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-center text-lg"
              placeholder="4.61"
            />
            <p className="text-xs text-gray-400 mt-1 text-center">人民幣兌台幣</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            {cnyRateData && (
              <span className="text-xs text-gray-400">
                上次更新：{new Date(cnyRateData.updated_at).toLocaleString('zh-TW')}
              </span>
            )}
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>

      {/* 換算公式 */}
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200">
        <h2 className="font-semibold">定價公式</h2>
        <div className="mt-3 p-4 bg-gray-50 rounded-lg font-mono text-sm">
          TWD 售價 = CNY 成本 ÷ 交易匯率
        </div>

        {examples.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-500">換算範例（匯率 {cnyRate}）</h3>
            <div className="mt-2 space-y-1">
              {examples.map((ex) => (
                <div key={ex.cny} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-gray-500">¥{ex.cny}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono font-medium">NT$ {ex.twd}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 說明 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
        <p className="font-medium">注意事項</p>
        <ul className="mt-2 space-y-1 text-blue-600 list-disc list-inside">
          <li>交易匯率由人工設定，不會自動連動市場匯率</li>
          <li>目的是穩定商品售價，避免匯率波動造成價格頻繁浮動</li>
          <li>建議定期檢查並更新匯率</li>
          <li>BC 成本價為人民幣（CNY），進入系統後以台幣（TWD）為基準定價</li>
        </ul>
      </div>
    </div>
  )
}
