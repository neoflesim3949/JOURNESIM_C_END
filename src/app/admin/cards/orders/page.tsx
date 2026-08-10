'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, Send, ChevronDown, ChevronRight, Wand2 } from 'lucide-react'
import { BcMatchModal } from '@/components/admin/bc-match-modal'
import { getProductTypeLabel } from '@/lib/bc-enums'

interface PriceTier { copies: string; settlementPrice: string }
interface SkuInfo { sku_id: string; name: string; type: string | null; days: number | null; prices: PriceTier[] | null; cost_price: number | null }
interface OrderLine { sku: SkuInfo; copies: string; number: string }
interface HistoryRow {
  id: string; status: string; error_message: string | null
  request_body: Record<string, unknown> | null; response_body: Record<string, unknown> | null
  created_at: string
}

// 地址識別：從整段收貨資訊拆出 姓名 / 電話 / 省市區 / 詳細地址
function parseAddress(raw: string): { name: string; phone: string; province: string; city: string; district: string; address: string } {
  let text = raw.replace(/[，,;；]/g, ' ').replace(/\s+/g, ' ').trim()
  // 電話：8 碼以上數字（容忍 +886 / 09xx / 1xx）
  const phoneMatch = text.match(/(?:\+?\d[\d-]{7,17}\d)/)
  const phone = phoneMatch ? phoneMatch[0].replace(/-/g, '') : ''
  if (phoneMatch) text = text.replace(phoneMatch[0], ' ').replace(/\s+/g, ' ').trim()
  // 姓名：取剩餘 token 中最短且 ≤4 字的中文（常見「張三 廣東省深圳市…」）
  const tokens = text.split(' ').filter(Boolean)
  let name = ''
  for (const t of tokens) {
    if (/^[一-龥·]{2,4}$/.test(t) && !/[省市區县区縣鎮镇路街號号巷弄樓楼]/.test(t)) { name = t; break }
  }
  if (name) text = text.replace(name, ' ').replace(/\s+/g, ' ').trim()
  // 省市區拆分（大陸格式；直轄市「北京市北京市」也容忍）
  const m = text.match(/^(.{2,8}?(?:省|自治[區区]|北京市|上海市|天津市|重慶市|重庆市))?(.{2,10}?市)?(.{2,10}?(?:[區区]|[縣县]|[鎮镇]))?(.*)$/)
  return {
    name, phone,
    province: (m?.[1] || '').trim(),
    city: (m?.[2] || '').trim(),
    district: (m?.[3] || '').trim(),
    address: (m?.[4] || text).trim(),
  }
}

export default function CardOrdersPage() {
  const [lines, setLines] = useState<OrderLine[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [addingSkus, setAddingSkus] = useState(false)
  // 地址識別
  const [rawAddress, setRawAddress] = useState('')
  // 收貨人 / 收貨地址 / 配送（F006 express）
  const [userName, setUserName] = useState('')
  const [userPhone, setUserPhone] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [logistics, setLogistics] = useState('')
  const [logisticsOpts, setLogisticsOpts] = useState<{ code: string; name: string }[]>([])
  const [logisticsErr, setLogisticsErr] = useState('')
  const [expressFee, setExpressFee] = useState('')
  const [comment, setComment] = useState('')
  const [estimatedUseTime, setEstimatedUseTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // 歷史
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // F005 物流公司（一次載入）
  useEffect(() => {
    fetch('/api/admin/cards/orders?action=logistics').then(r => r.json()).then(d => {
      if (d.companies) setLogisticsOpts(d.companies)
      else setLogisticsErr(d.error || 'F005 物流清單載入失敗')
    }).catch(e => setLogisticsErr(String(e)))
    loadHistory()
  }, [])

  async function loadHistory() {
    const res = await fetch('/api/admin/cards/orders?action=history')
    if (res.ok) { const d = await res.json(); setHistory(d.items || []) }
  }

  function recognizeAddress() {
    if (!rawAddress.trim()) { alert('請先貼上完整收貨資訊'); return }
    const p = parseAddress(rawAddress)
    if (p.name) setUserName(p.name)
    if (p.phone) setUserPhone(p.phone)
    if (p.province) setProvince(p.province)
    if (p.city) setCity(p.city)
    if (p.district) setDistrict(p.district)
    if (p.address) setAddress(p.address)
  }

  // 從 BC 商品彈窗加入 SKU → 撈明細（份數價格）
  async function addSkus(skuIds: string[]) {
    setAddingSkus(true)
    try {
      const res = await fetch(`/api/admin/cards/orders?action=skus&skus=${skuIds.join(',')}`)
      const d = await res.json()
      const items: SkuInfo[] = d.items || []
      setLines(prev => {
        const have = new Set(prev.map(l => l.sku.sku_id))
        const added = items.filter(i => !have.has(i.sku_id)).map(i => ({
          sku: i,
          copies: i.prices?.[0]?.copies || '1',
          number: '1',
        }))
        return [...prev, ...added]
      })
      setShowPicker(false)
    } finally { setAddingSkus(false) }
  }

  function updateLine(idx: number, patch: Partial<Pick<OrderLine, 'copies' | 'number'>>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  // 結算價估算（CNY）：所選份數的 settlementPrice × 數量
  function lineCost(l: OrderLine): number {
    const tier = l.sku.prices?.find(p => p.copies === l.copies)
    const unit = tier ? Number(tier.settlementPrice) || 0 : 0
    return unit * (Number(l.number) || 0)
  }
  const totalCost = lines.reduce((a, l) => a + lineCost(l), 0)

  async function submit() {
    setResultMsg(null)
    if (lines.length === 0) { alert('請先加入商品'); return }
    if (!userName.trim() || !userPhone.trim() || !address.trim()) { alert('收貨人姓名、電話、詳細地址必填'); return }
    if (!confirm(`確定送出卡訂單（F006）？\n共 ${lines.length} 項商品，訂單金額約 CN¥ ${totalCost.toFixed(2)}`)) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/cards/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sub_orders: lines.map(l => ({
            device_sku_id: l.sku.sku_id,
            plan_copies: l.copies,
            number: l.number,
          })),
          express: {
            userName: userName.trim(), userPhone: userPhone.trim(),
            logisticsCompany: logistics, province, city, district,
            address: address.trim(), expressFee,
          },
          total_amount: totalCost ? totalCost.toFixed(2) : undefined,
          comment: comment.trim() || undefined,
          estimated_use_time: estimatedUseTime || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setResultMsg({ ok: false, text: `下單失敗：${d.error || '未知錯誤'}` }); return }
      setResultMsg({ ok: true, text: `下單成功！BC 訂單號：${d.result?.orderId || '—'}（渠道單號 ${d.channel_order_id}）` })
      setLines([])
      loadHistory()
    } finally { setSubmitting(false) }
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'
  const requiredMark = <span className="text-red-500 mr-0.5">*</span>

  return (
    <div>
      <h1 className="text-2xl font-bold">卡片訂單</h1>
      <p className="mt-1 text-sm text-gray-500">手動下實體卡訂單（F002 商品 / F003 價格 / F005 物流 / F006 下單）</p>

      {/* 商品 + 訂單金額 */}
      <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">商品明細</h2>
          <button onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> 新增商品
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400 text-center py-6">尚未加入商品，點「新增商品」從 BC 商品挑選</p>
        ) : (
          <>
            <table className="mt-3 w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left border-b">套餐名稱</th>
                  <th className="px-2 py-2 text-left border-b">類型</th>
                  <th className="px-2 py-2 text-left border-b">份數</th>
                  <th className="px-2 py-2 text-left border-b">套餐數量</th>
                  <th className="px-2 py-2 text-right border-b">套餐價格 (CN¥)</th>
                  <th className="px-2 py-2 border-b"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.sku.sku_id} className="border-b">
                    <td className="px-2 py-2">
                      <div className="font-medium">{l.sku.name}</div>
                      <div className="font-mono text-[10px] text-gray-400">{l.sku.sku_id}</div>
                    </td>
                    <td className="px-2 py-2">{getProductTypeLabel(l.sku.type || '')}</td>
                    <td className="px-2 py-2">
                      {l.sku.prices?.length ? (
                        <select value={l.copies} onChange={e => updateLine(i, { copies: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded">
                          {l.sku.prices.map(p => (
                            <option key={p.copies} value={p.copies}>
                              {p.copies} 份{l.sku.days ? `（${Number(l.sku.days) * Number(p.copies)} 天）` : ''} ¥{p.settlementPrice}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={l.copies} onChange={e => updateLine(i, { copies: e.target.value })}
                          className="w-16 px-2 py-1 border border-gray-300 rounded" />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={1} value={l.number}
                        onChange={e => updateLine(i, { number: e.target.value })}
                        className="w-20 px-2 py-1 border border-gray-300 rounded" />
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{lineCost(l).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setLines(prev => prev.filter((_, x) => x !== i))}
                        className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end items-baseline gap-2 px-2">
              <span className="text-sm text-gray-500">訂單金額：</span>
              <span className="text-lg font-bold font-mono">CN¥ {totalCost.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>

      {/* 地址識別 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold text-sm">地址識別</h2>
        <p className="mt-0.5 text-xs text-gray-400">貼上完整收貨資訊後可自動識別姓名、電話和地址</p>
        <div className="mt-2 flex gap-2">
          <textarea value={rawAddress} onChange={e => setRawAddress(e.target.value)} rows={2}
            placeholder="例：張三 13800138000 廣東省深圳市南山區創業路6號"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={recognizeAddress}
            className="self-end flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Wand2 className="w-4 h-4" /> 地址識別
          </button>
        </div>
      </div>

      {/* 收貨人信息 / 收貨地址 / 配送信息 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold text-sm pb-2 border-b border-gray-100">收貨人信息</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{requiredMark}收貨人姓名</label>
            <input value={userName} onChange={e => setUserName(e.target.value)} placeholder="請輸入收貨人姓名" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{requiredMark}聯繫電話</label>
            <input value={userPhone} onChange={e => setUserPhone(e.target.value)} placeholder="請輸入聯繫電話" className={inputCls} />
          </div>
        </div>

        <h2 className="font-semibold text-sm mt-6 pb-2 border-b border-gray-100">收貨地址</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">省份</label>
            <input value={province} onChange={e => setProvince(e.target.value)} placeholder="如：廣東省" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">城市</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="如：深圳市" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">區縣</label>
            <input value={district} onChange={e => setDistrict(e.target.value)} placeholder="如：南山區" className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-gray-500 mb-1">{requiredMark}詳細地址</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="請輸入詳細地址" className={inputCls} />
          </div>
        </div>

        <h2 className="font-semibold text-sm mt-6 pb-2 border-b border-gray-100">配送信息</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">物流公司（F005）</label>
            <select value={logistics} onChange={e => setLogistics(e.target.value)} className={inputCls}>
              <option value="">由 BC 預設</option>
              {logisticsOpts.map(o => <option key={o.code} value={o.code}>{o.name}（{o.code}）</option>)}
            </select>
            {logisticsErr && <p className="mt-1 text-[10px] text-red-500">{logisticsErr}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">運費</label>
            <input value={expressFee} onChange={e => setExpressFee(e.target.value)} placeholder="選填" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">預計出行時間</label>
            <input type="date" value={estimatedUseTime} onChange={e => setEstimatedUseTime(e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-gray-500 mb-1">備註（選填）</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
              placeholder="請輸入訂單或配送備註，例：請發順豐" className={inputCls} />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={submit} disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? '送出中…' : '創建訂單 (F006)'}
          </button>
          {resultMsg && (
            <span className={`text-sm ${resultMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{resultMsg.text}</span>
          )}
        </div>
      </div>

      {/* 歷史 F006 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold text-sm">近期下單紀錄（F006）</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">尚無紀錄</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {history.map(h => {
              const req = h.request_body as { tradeData?: { channelOrderId?: string; subOrderList?: unknown[] } } | null
              const resp = h.response_body as { tradeData?: { orderId?: string } } | null
              const expanded = expandedIds.has(h.id)
              return (
                <div key={h.id} className="border border-gray-100 rounded-lg">
                  <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 text-xs"
                    onClick={() => toggleExpand(h.id)}>
                    {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                    <span className="text-gray-500">{new Date(h.created_at).toLocaleString('zh-TW')}</span>
                    <span className="font-mono">{req?.tradeData?.channelOrderId || '—'}</span>
                    <span className="text-gray-400">{req?.tradeData?.subOrderList?.length || 0} 項</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${h.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {h.status === 'success' ? `成功 → ${resp?.tradeData?.orderId || ''}` : '失敗'}
                    </span>
                    {h.error_message && <span className="text-red-500 truncate">{h.error_message}</span>}
                  </div>
                  {expanded && (
                    <div className="border-t border-gray-100 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <pre className="text-[10px] bg-gray-50 rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap font-mono">
                        {JSON.stringify(h.request_body, null, 2)}
                      </pre>
                      <pre className="text-[10px] bg-gray-50 rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap font-mono">
                        {JSON.stringify(h.response_body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showPicker && (
        <BcMatchModal
          mode="add"
          title="選擇 BC 商品（實體卡）"
          subtitle="F002 商品清單；價格為 F003 結算價"
          defaultKind="sim"
          existingSkus={new Set(lines.map(l => l.sku.sku_id))}
          onAdd={addSkus}
          adding={addingSkus}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
