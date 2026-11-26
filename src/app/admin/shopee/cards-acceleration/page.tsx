'use client'

import { useState } from 'react'
import { Search, Loader2, Zap, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'

// ---- 型別（對齊 F012 / F015 回傳）----
interface PlanSub {
  subOrderId?: string
  skuId?: string
  skuName?: string
  copies?: string
  planStatus?: string
  planStartTime?: string
  planEndTime?: string
  totalDays?: string
  remainingDays?: string
  totalTraffic?: string
  remainingTraffic?: string
}
interface PlanOrder {
  orderId: string
  channelOrderId: string
  subOrderList?: PlanSub[]
}
interface AccSku {
  skuId: string
  name?: string
  settlementPrice?: string
  days?: string
  planType?: string
  capacity?: string
  highFlowSize?: string
  limitFlowSpeed?: string
  hotspotSupport?: string
  desc?: string
  country?: { mcc?: string; name?: string; apn?: string; apnType?: string;
    operatorInfo?: { operator?: string; network?: string; priority?: string }[] }[]
}
interface AccQuery {
  orderId: string
  iccid: string
  skuId?: string
  accelerationSkuList?: AccSku[]
}

// F012 planStatus：0-未使用 1-正在使用 2-使用結束 3-已取消
const PLAN_STATUS: Record<string, string> = { '0': '未使用', '1': '正在使用', '2': '使用結束', '3': '已取消' }
const DAY_TYPES = [
  { value: '0', label: '單日加速' },
  { value: '1', label: '套餐升級' },
  { value: '2', label: '總量升級' },
]

// F015/F016 流量欄位單位為 KB（1048576 KB = 1 GB）
function fmtKB(s?: string) {
  if (s == null || s === '') return '—'
  const n = Number(s)
  if (isNaN(n)) return s
  if (n < 0) return '不限'
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' GB'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' MB'
  return n + ' KB'
}
function fmtSpeed(s?: string) {
  if (!s) return '—'
  const n = Number(s)
  if (isNaN(n)) return s
  if (n >= 1024) return (n / 1024).toFixed(0) + ' Mbps'
  return n + ' kbps'
}
function money(s?: string | number) {
  const n = Number(s)
  return isNaN(n) ? String(s ?? '—') : n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function CardsAccelerationPage() {
  const [iccid, setIccid] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [orders, setOrders] = useState<PlanOrder[] | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<PlanOrder | null>(null)

  const [dayType, setDayType] = useState('0')
  const [loadingSkus, setLoadingSkus] = useState(false)
  const [accQuery, setAccQuery] = useState<AccQuery | null>(null)
  const [selectedSku, setSelectedSku] = useState<AccSku | null>(null)
  const [copies, setCopies] = useState(1)

  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ channelOrderId: string; totalAmount: string; subOrderList?: { isActivated?: string; apn?: string; startTime?: string }[] } | null>(null)

  const reset = (keepIccid = true) => {
    setOrders(null); setSelectedOrder(null); setAccQuery(null); setSelectedSku(null)
    setCopies(1); setResult(null); setError(null)
    if (!keepIccid) setIccid('')
  }

  // Step 1：釣出該卡所有訂單（F012）
  async function lookupOrders() {
    const ic = iccid.trim()
    if (!ic) { setError('請輸入卡號'); return }
    reset(); setLoadingOrders(true)
    try {
      const res = await fetch(`/api/admin/cards-acceleration?step=orders&iccid=${encodeURIComponent(ic)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '查詢失敗')
      setOrders(json.orders || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setOrders([])
    } finally { setLoadingOrders(false) }
  }

  // Step 2：選訂單後查加速包（F015）
  async function pickOrder(o: PlanOrder) {
    setSelectedOrder(o); setAccQuery(null); setSelectedSku(null); setCopies(1); setResult(null); setError(null)
    await loadSkus(o, dayType)
  }
  async function loadSkus(o: PlanOrder, dt: string) {
    setLoadingSkus(true); setAccQuery(null); setSelectedSku(null)
    try {
      const res = await fetch(`/api/admin/cards-acceleration?step=skus&iccid=${encodeURIComponent(iccid.trim())}&orderId=${encodeURIComponent(o.orderId)}&dayType=${dt}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '查詢加速包失敗')
      setAccQuery(json.result || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoadingSkus(false) }
  }
  function changeDayType(dt: string) {
    setDayType(dt)
    if (selectedOrder) loadSkus(selectedOrder, dt)
  }

  // Step 3：下加購單（F016）
  async function submitOrder() {
    if (!selectedOrder || !selectedSku || !accQuery) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/admin/cards-acceleration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          iccid: iccid.trim(),
          originalSaleGoodsId: accQuery.skuId || selectedOrder.subOrderList?.[0]?.skuId || '',
          skuId: selectedSku.skuId,
          copies,
          settlementPrice: selectedSku.settlementPrice || '0',
          dayType,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || '加購失敗')
      setResult({ channelOrderId: json.channelOrderId, totalAmount: json.totalAmount, subOrderList: json.result?.subOrderList })
      setConfirmOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setConfirmOpen(false)
    } finally { setSubmitting(false) }
  }

  const unitPrice = Number(selectedSku?.settlementPrice || 0)
  const total = (unitPrice * copies)

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Zap className="w-6 h-6 text-amber-500" />
        <h1 className="text-xl font-bold">卡片加購（加速包）</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-2">輸入卡號 → 選擇該卡的訂單 → 查詢可加購加速包 → 下加購單（F015 / F016）。</p>

      {/* Step 1：卡號 */}
      <div className="bg-white rounded-xl border p-4">
        <label className="text-sm font-medium text-gray-700">① 卡號（ICCID）</label>
        <div className="flex gap-2 mt-2">
          <input
            value={iccid}
            onChange={(e) => setIccid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookupOrders()}
            placeholder="輸入卡號後查詢該卡所有訂單"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={lookupOrders} disabled={loadingOrders}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 disabled:opacity-50">
            {loadingOrders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}查詢
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Step 2：訂單清單 */}
      {orders && (
        <div className="bg-white rounded-xl border p-4">
          <label className="text-sm font-medium text-gray-700">② 選擇要加購的訂單</label>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">查無此卡的訂單。</p>
          ) : (
            <div className="mt-2 space-y-2">
              {orders.map((o) => {
                const active = selectedOrder?.orderId === o.orderId
                const sub = o.subOrderList?.[0]
                return (
                  <button key={o.orderId} onClick={() => pickOrder(o)}
                    className={`w-full text-left border rounded-lg p-3 transition ${active ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{sub?.skuName || '（無套餐名）'}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          訂單 {o.orderId}
                          {sub?.planStatus != null && <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100">{PLAN_STATUS[sub.planStatus] || sub.planStatus}</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {sub?.planStartTime || '—'} ~ {sub?.planEndTime || '—'}
                          {sub?.remainingTraffic != null && <span className="ml-2">剩餘 {fmtKB(sub.remainingTraffic)}</span>}
                          {sub?.remainingDays != null && <span className="ml-2">剩 {sub.remainingDays} 天</span>}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 shrink-0 ${active ? 'text-blue-500' : 'text-gray-300'}`} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3：加速包 */}
      {selectedOrder && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">③ 選擇加速包</label>
            <div className="flex gap-1">
              {DAY_TYPES.map((d) => (
                <button key={d.value} onClick={() => changeDayType(d.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${dayType === d.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {loadingSkus ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-4"><Loader2 className="w-4 h-4 animate-spin" />查詢加速包中…</div>
          ) : !accQuery ? null : (accQuery.accelerationSkuList || []).length === 0 ? (
            <p className="text-sm text-gray-400 mt-3">此訂單目前沒有可加購的加速包。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {(accQuery.accelerationSkuList || []).map((s) => {
                const active = selectedSku?.skuId === s.skuId
                return (
                  <button key={s.skuId} onClick={() => setSelectedSku(s)}
                    className={`w-full text-left border rounded-lg p-3 transition ${active ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-50/50' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{s.name || s.skuId}</div>
                      <div className="text-amber-600 font-semibold text-sm whitespace-nowrap">結算 ${money(s.settlementPrice)}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                      {s.days && <span>天數 {s.days}</span>}
                      {s.highFlowSize && <span>高速 {fmtKB(s.highFlowSize)}</span>}
                      {s.capacity && <span>流量 {fmtKB(s.capacity)}</span>}
                      {s.limitFlowSpeed && <span>限速 {fmtSpeed(s.limitFlowSpeed)}</span>}
                      {s.hotspotSupport != null && <span>熱點 {s.hotspotSupport === '1' ? '支援' : '不支援'}</span>}
                    </div>
                    {(s.country || []).length > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        {(s.country || []).map((c) => `${c.name || c.mcc}${c.apn ? `(APN:${c.apn})` : ''}`).join('、')}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* 份數 + 下單 */}
          {selectedSku && (
            <div className="mt-4 border-t pt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">份數</span>
                <input type="number" min={1} value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="w-20 border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div className="text-sm text-gray-700">合計 <span className="font-semibold text-amber-600">${money(total)}</span></div>
              <button onClick={() => setConfirmOpen(true)}
                className="ml-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-1">
                <Zap className="w-4 h-4" />確認加購
              </button>
            </div>
          )}
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-700 font-medium"><CheckCircle2 className="w-5 h-5" />加購成功</div>
          <div className="text-sm text-gray-600 mt-2 space-y-1">
            <div>渠道單號：{result.channelOrderId}</div>
            <div>扣款金額：${money(result.totalAmount)}</div>
            {result.subOrderList?.map((s, i) => (
              <div key={i} className="text-xs text-gray-500">
                {s.isActivated === '1' ? '已激活' : '未激活'}
                {s.startTime ? `｜開始 ${s.startTime}` : ''}
                {s.apn ? `｜APN ${s.apn}` : ''}
              </div>
            ))}
          </div>
          <button onClick={() => reset(false)} className="mt-3 text-sm text-blue-600 underline">查下一張卡</button>
        </div>
      )}

      {/* 二次確認（會扣 BC 預存款） */}
      {confirmOpen && selectedSku && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !submitting && setConfirmOpen(false)}>
          <div className="bg-white rounded-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-amber-600 font-semibold"><AlertTriangle className="w-5 h-5" />確認加購</div>
            <div className="text-sm text-gray-700 mt-3 space-y-1.5">
              <div>卡號：<span className="font-mono">{iccid.trim()}</span></div>
              <div>原訂單：{selectedOrder?.orderId}</div>
              <div>加速包：{selectedSku.name || selectedSku.skuId}</div>
              <div>份數：{copies}</div>
              <div className="text-base font-semibold text-amber-600">將扣 BC 預存款 ${money(total)}</div>
            </div>
            <p className="text-xs text-gray-400 mt-2">送出後會對 BillionConnect 建立真實加購訂單並扣款，無法自動撤銷。</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmOpen(false)} disabled={submitting}
                className="flex-1 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={submitOrder} disabled={submitting}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}確認送出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
