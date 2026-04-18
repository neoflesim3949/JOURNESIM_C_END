'use client'

import { use, useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'

interface EsimData {
  iccid: string
  qr_code_url: string | null
  lpa_code: string | null
  activation_code?: string | null
  sm_dp_address?: string | null
  source?: string
}

export default function EsimInstallPage({ params }: { params: Promise<{ iccid: string }> }) {
  const { iccid } = use(params)
  const [data, setData] = useState<EsimData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/esim/install/${iccid}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) setError(d.error || '載入失敗')
        else setData(d)
      })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false))
  }, [iccid])

  // 從 LPA:1$SM-DP$ACTIVATION 格式解析 SM-DP 和 ActivationCode
  const parsed = (() => {
    if (data?.sm_dp_address && data?.activation_code) {
      return { smDp: data.sm_dp_address, activation: data.activation_code }
    }
    if (data?.lpa_code?.startsWith('LPA:1$')) {
      const parts = data.lpa_code.substring(6).split('$')
      return { smDp: parts[0] || '', activation: parts[1] || '' }
    }
    return { smDp: '', activation: '' }
  })()

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  function CopyBtn({ k, text }: { k: string; text: string }) {
    return (
      <button onClick={() => copy(k, text)} className="p-1 text-gray-400 hover:text-blue-600 rounded">
        {copied === k ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    )
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">載入中⋯</div>
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-xl border border-gray-200 p-6 text-center">
          <div className="text-4xl mb-3">😕</div>
          <div className="text-gray-700 font-medium">{error || '找不到 eSIM 資料'}</div>
          <div className="text-xs text-gray-500 mt-2 font-mono">{iccid}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-indigo-700">eSIM 安裝</h1>
          <p className="text-sm text-gray-500 mt-1">掃描 QR Code 或依下方指示手動設定</p>
        </div>

        {/* QR Code 區 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
          {data.qr_code_url ? (
            <div className="flex justify-center">
              <img src={data.qr_code_url} alt="eSIM QR Code" className="w-64 h-64 object-contain" />
            </div>
          ) : data.lpa_code ? (
            <div className="flex justify-center">
              <QRCodeCanvas value={data.lpa_code} size={256} level="M" marginSize={0} />
            </div>
          ) : (
            <div className="w-64 h-64 mx-auto bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">
              無 QR Code
            </div>
          )}
          <div className="mt-4 text-center text-xs text-gray-500">eSIM QR Code</div>
        </div>

        {/* ICCID */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">ICCID</div>
              <div className="font-mono text-sm mt-0.5">{data.iccid}</div>
            </div>
            <CopyBtn k="iccid" text={data.iccid} />
          </div>
        </div>

        {/* iOS 指示 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="text-lg"></span> iOS
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500">SM-DP+ Address</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="font-mono text-sm break-all flex-1">{parsed.smDp || '-'}</div>
                {parsed.smDp && <CopyBtn k="smdp" text={parsed.smDp} />}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Activation Code</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="font-mono text-sm break-all flex-1">{parsed.activation || '-'}</div>
                {parsed.activation && <CopyBtn k="act" text={parsed.activation} />}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Confirmation Code</div>
              <div className="text-sm mt-0.5 text-gray-400">無需填寫</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
            <div>設定 → 行動服務 → 加入 eSIM → 使用 QR Code</div>
            <div>或選「手動輸入詳細資訊」貼上上方兩欄資料</div>
          </div>
        </div>

        {/* Android 指示 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="text-lg">🤖</span> Android
          </div>
          <div>
            <div className="text-xs text-gray-500">LPA Code</div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="font-mono text-xs break-all flex-1">{data.lpa_code || '-'}</div>
              {data.lpa_code && <CopyBtn k="lpa" text={data.lpa_code} />}
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
            設定 → 網路和網際網路 → SIM 卡 → 下載 SIM 卡 → 需要協助？ → 輸入啟用碼
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 mt-6">
          FLESIM · 全球旅遊 eSIM
        </div>
      </div>
    </div>
  )
}
