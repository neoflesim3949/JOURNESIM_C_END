'use client'

import { useEffect, useState } from 'react'
import { formatCapacity, formatSpeed } from '@/lib/format'
import { getProductTypeLabel, getPlanTypeLabel } from '@/lib/bc-enums'

interface CountryItem { mcc: string; name: string }
interface F002CountryDetail {
  mcc: string; name: string; apn?: string; apnUsername?: string; apnPassword?: string
  operatorInfo?: { operator?: string; network?: string; priority?: string }[]
  ProviderZone?: string; ip1?: string; ip2?: string; ip3?: string; ipRemarks?: string
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Product = any

// BC 商品詳情彈窗：傳入 skuId，自動抓取完整資料；可查詢 F002 運營商/APN
export default function BcDetailModal({ skuId, onClose }: { skuId: string; onClose: () => void }) {
  const [p, setP] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState<F002CountryDetail[] | null>(null)
  const [f002Loading, setF002Loading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/plans/one?sku_id=${encodeURIComponent(skuId)}`)
      .then(r => r.ok ? r.json() : Promise.resolve({ product: null }))
      .then(d => setP(d.product))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [skuId])

  async function queryF002() {
    if (!p?.sales_method) { setErr('此商品無 sales_method，無法呼叫 F002'); return }
    setF002Loading(true); setErr('')
    try {
      const res = await fetch(`/api/admin/plans/details?sku_id=${encodeURIComponent(p.sku_id)}&sales_method=${encodeURIComponent(p.sales_method)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '查詢失敗')
      setCountries(data.countries || [])
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setF002Loading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">套餐詳情</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          {loading ? <p className="text-sm text-gray-500">載入中…</p> : !p ? <p className="text-sm text-gray-400">找不到此商品</p> : (
            <>
              <div className="space-y-3 text-sm">
                {([
                  ['套餐編號', p.sku_id],
                  ['套餐名稱', p.name],
                  ['商品類型', getProductTypeLabel(p.type)],
                  ['套餐類型', getPlanTypeLabel(p.plan_type)],
                  ['高速流量', formatCapacity(p.high_flow_size ?? p.capacity, p.plan_type === '1')],
                  ['限速峰值', formatSpeed(p.limit_flow_speed)],
                  ['支持加速', p.acceleration_support || '—'],
                  ['熱點分享', p.hotspot_support === '1' ? '支持' : '—'],
                  ['設備可用次數', p.usage_count || '—'],
                  ['日切點類型', p.point_contact_type || '—'],
                  ['運營商時區', p.time_zone || '—'],
                  ['供應商', p.provider || '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              </div>

              {p.desc && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs font-medium text-blue-700 mb-1">套餐描述</div>
                  <div className="text-xs text-blue-600 whitespace-pre-line">{p.desc}</div>
                </div>
              )}

              {Array.isArray(p.country_data) && p.country_data.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-gray-500">覆蓋國家 / 運營商 · {p.country_data.length}</div>
                    {!countries && (
                      <button onClick={queryF002} disabled={f002Loading}
                        className="px-2 py-0.5 text-[11px] border border-blue-300 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50">
                        {f002Loading ? '查詢中…' : '查詢運營商 / APN (F002)'}
                      </button>
                    )}
                  </div>
                  {err && <div className="text-xs text-red-500 mb-2">{err}</div>}
                  {!countries ? (
                    <div className="flex flex-wrap gap-1">
                      {(p.country_data as CountryItem[]).map((c) => (
                        <span key={c.mcc} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{c.name}</span>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {countries.map((c) => (
                        <div key={c.mcc} className="border border-gray-200 rounded-lg p-2.5 text-xs">
                          <div className="font-medium text-gray-800">{c.name} <span className="text-gray-400">({c.mcc})</span></div>
                          {(c.apn || c.apnUsername || c.apnPassword) && (
                            <div className="mt-1 text-gray-600">
                              <span className="text-gray-400">APN：</span><span className="font-mono">{c.apn || '—'}</span>
                              {c.apnUsername && <span className="ml-2 text-gray-400">user: <span className="font-mono text-gray-700">{c.apnUsername}</span></span>}
                              {c.apnPassword && <span className="ml-2 text-gray-400">pwd: <span className="font-mono text-gray-700">{c.apnPassword}</span></span>}
                            </div>
                          )}
                          {c.operatorInfo && c.operatorInfo.length > 0 && (
                            <table className="w-full text-[11px] mt-1">
                              <thead className="text-gray-400"><tr><th className="text-left font-normal">優先級</th><th className="text-left font-normal">運營商</th><th className="text-left font-normal">網絡</th></tr></thead>
                              <tbody>{c.operatorInfo.map((op, i) => <tr key={i} className="text-gray-700"><td className="py-0.5">{op.priority ?? '—'}</td><td className="py-0.5">{op.operator ?? '—'}</td><td className="py-0.5">{op.network ?? '—'}</td></tr>)}</tbody>
                            </table>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {p.refund_policy && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs font-medium text-gray-500 mb-1">退款政策</div>
                  <div className="text-xs text-gray-600 whitespace-pre-line">{p.refund_policy}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
