'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wifi, CreditCard, Truck, Save, RefreshCw, RotateCcw } from 'lucide-react'

interface Order {
  id: string; order_number: string; email: string; status: string
  total_amount: number; payment_method: string; tappay_trade_id: string | null
  member_id: string | null; created_at: string
  shipping_name: string | null; shipping_phone: string | null; shipping_address: string | null
}

interface OrderSku {
  id: string; sku_number: string | null; bc_sku_id: string; bc_sku_name: string | null
  product_name: string | null; display_name: string | null; copies: string
  days: number | null; unit_price: number; quantity: number; subtotal: number
  iccid: string[] | null; qr_code_url: string | null; lpa_code: string | null
  sim_iccid: string[] | null; bc_sub_order_id: string | null; status: string
}

interface SubOrder {
  id: string; sub_order_number: string; category: string; status: string
  bc_order_id: string | null; subtotal: number
  tracking_number: string | null; shipping_status: string | null
  skus: OrderSku[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '處理中', color: 'bg-blue-100 text-blue-700' },
  awaiting_card: { label: '待配卡', color: 'bg-orange-100 text-orange-700' },
  card_assigned: { label: '已配卡', color: 'bg-cyan-100 text-cyan-700' },
  shipping: { label: '配送中', color: 'bg-purple-100 text-purple-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
  paid: { label: '已付款', color: 'bg-green-100 text-green-700' },
  pending_payment: { label: '待付款', color: 'bg-yellow-100 text-yellow-700' },
  failed: { label: '失敗', color: 'bg-red-100 text-red-700' },
  refunded: { label: '已退款', color: 'bg-gray-200 text-gray-700' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
  return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${s.color}`}>{s.label}</span>
}

export default function AdminOrderDetailPage() {
  const { id } = useParams() as { id: string }
  const [order, setOrder] = useState<Order | null>(null)
  const [subOrders, setSubOrders] = useState<SubOrder[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const res = await fetch(`/api/admin/orders/${id}`)
    if (res.ok) {
      const data = await res.json()
      setOrder(data.order)
      setSubOrders(data.sub_orders || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function updateSubOrder(subOrderId: string, updates: Record<string, unknown>) {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_order_id: subOrderId, ...updates }),
    })
    load()
  }

  async function updateSku(skuId: string, updates: Record<string, unknown>) {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_id: skuId, ...updates }),
    })
    load()
  }

  async function batchSave(subOrderId: string) {
    if (!confirm('確定要批次儲存並送出 BC 訂單？')) return
    const res = await fetch(`/api/admin/orders/${id}/bc-order`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_order_id: subOrderId }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || '送出失敗')
    } else {
      alert(`BC 訂單已送出！BC Order ID: ${data.bc_order_id}`)
    }
    load()
  }

  const [syncing, setSyncing] = useState(false)
  const [showRefund, setShowRefund] = useState(false)

  async function syncBC() {
    setSyncing(true)
    const res = await fetch(`/api/admin/orders/${id}/sync-bc`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      const ok = data.results?.filter((r: { synced: boolean }) => r.synced).length || 0
      const fail = data.results?.filter((r: { synced: boolean }) => !r.synced).length || 0
      alert(`同步完成：${ok} 成功，${fail} 失敗`)
    } else {
      alert(data.error || '同步失敗')
    }
    setSyncing(false)
    load()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!order) return <div>找不到訂單</div>

  const hasOldItems = subOrders.length === 0

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回訂單列表
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">訂單詳情</h1>
        <div className="flex items-center gap-2">
          {order.payment_method === 'antom' && order.status !== 'refunded' && (
            <button onClick={() => setShowRefund(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50">
              <RotateCcw className="w-4 h-4" /> 發起退款
            </button>
          )}
          {subOrders.some((s) => s.bc_order_id) && (
            <button onClick={syncBC} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> 同步 BC 狀態
            </button>
          )}
        </div>
      </div>

      {/* L1: 主訂單資訊 */}
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-gray-500">訂單編號</div><div className="font-mono font-medium">{order.order_number}</div></div>
          <div><div className="text-gray-500">Email</div><div>{order.email}</div></div>
          <div><div className="text-gray-500">金額</div><div className="font-semibold">NT$ {order.total_amount}</div></div>
          <div><div className="text-gray-500">狀態</div><StatusBadge status={order.status} /></div>
          <div><div className="text-gray-500">付款方式</div><div>{order.payment_method || '-'}</div></div>
          <div><div className="text-gray-500">建立時間</div><div>{new Date(order.created_at).toLocaleString('zh-TW')}</div></div>
          <div><div className="text-gray-500">會員</div><div className="text-xs font-mono">{order.member_id || '訪客'}</div></div>
          <div><div className="text-gray-500">TapPay</div><div className="text-xs font-mono">{order.tappay_trade_id || '-'}</div></div>
        </div>

        {/* 收件資訊 */}
        {(order.shipping_name || order.shipping_phone || order.shipping_address) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs font-medium text-gray-500 mb-2">收件資訊</div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-gray-400">姓名：</span>{order.shipping_name || '-'}</div>
              <div><span className="text-gray-400">電話：</span>{order.shipping_phone || '-'}</div>
              <div><span className="text-gray-400">地址：</span>{order.shipping_address || '-'}</div>
            </div>
          </div>
        )}
      </div>

      {/* L2/L3: 子訂單 */}
      {subOrders.length > 0 ? (
        <div className="mt-6 space-y-6">
          {subOrders.map((sub) => (
            <SubOrderCard key={sub.id} sub={sub} onUpdateSub={updateSubOrder} onUpdateSku={updateSku} onBatchSave={batchSave} />
          ))}
        </div>
      ) : hasOldItems && (
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg text-sm text-yellow-700">
          此訂單使用舊架構，無子訂單結構。請查看舊版訂單明細。
        </div>
      )}

      {showRefund && (
        <RefundModal orderId={id} orderNumber={order.order_number} onClose={() => setShowRefund(false)} onDone={load} />
      )}
    </div>
  )
}

function RefundModal({ orderId, orderNumber, onClose, onDone }: {
  orderId: string; orderNumber: string; onClose: () => void; onDone: () => void
}) {
  const [info, setInfo] = useState<{ currency: string; amount: number | null } | null>(null)
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch(`/api/admin/orders/${orderId}/antom-refund`).then((r) => r.json()).then((d) => {
      if (d.currency) { setInfo({ currency: d.currency, amount: d.amount }); if (d.amount != null) setAmount(String(d.amount)) }
      else setInfo({ currency: '', amount: null })
    }).catch(() => setInfo({ currency: '', amount: null }))
  }, [orderId])

  const max = info?.amount ?? null
  const partialInvalid = mode === 'partial' && (!amount || Number(amount) <= 0 || (max != null && Number(amount) > max))

  async function submit() {
    setSubmitting(true); setResult(null)
    const d = await fetch(`/api/admin/orders/${orderId}/antom-refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'partial' ? { amount: Number(amount) } : {}),
    }).then((r) => r.json()).catch(() => ({ error: '連線失敗' }))
    setSubmitting(false)
    if (d.ok) { setResult({ ok: true, msg: `退款已送出：${d.amount}${d.full ? '（全額）' : '（部分）'}` }); onDone() }
    else setResult({ ok: false, msg: d.error || '退款失敗' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><RotateCcw className="w-5 h-5 text-red-500" />發起退款</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-xs text-gray-400 mb-4">訂單 <span className="font-mono">{orderNumber}</span></p>

        {result?.ok ? (
          <div className="py-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto text-3xl">✓</div>
            <div className="mt-3 font-semibold text-gray-800">退款已受理</div>
            <div className="mt-1 text-sm text-gray-500">{result.msg}</div>
            <div className="mt-1 text-xs text-gray-400">款項將由 Antom 處理，狀態以退款通知為準。</div>
            <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700">關閉</button>
          </div>
        ) : !info ? <div className="py-6 text-center text-gray-400 text-sm">讀取付款資訊…</div> : (
          <>
            <div className="rounded-lg bg-gray-50 p-3 text-sm mb-4">
              <div className="flex justify-between"><span className="text-gray-500">原付款金額</span>
                <span className="font-semibold">{info.currency && info.amount != null ? `${info.currency} ${info.amount}` : '無法取得'}</span></div>
            </div>

            <div className="flex gap-2 mb-3">
              {(['full', 'partial'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border ${mode === m ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}>
                  {m === 'full' ? '全額退款' : '部分退款'}
                </button>
              ))}
            </div>

            {mode === 'partial' && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">退款金額（{info.currency || '原幣別'}）</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min="0" max={max ?? undefined}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${partialInvalid ? 'border-red-400' : 'border-gray-200'}`} placeholder={max != null ? `最多 ${max}` : ''} />
                {partialInvalid && <div className="text-xs text-red-500 mt-1">金額須介於 0 與 {max} 之間</div>}
              </div>
            )}

            {result && !result.ok && <div className="text-sm mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-600">{result.msg}</div>}

            <div className="flex justify-end gap-2 mt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={submit} disabled={submitting || partialInvalid || (mode === 'full' && info.amount == null)}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
                {submitting ? '退款中…' : '確認退款'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SubOrderCard({ sub, onUpdateSub, onUpdateSku, onBatchSave }: {
  sub: SubOrder
  onUpdateSub: (id: string, updates: Record<string, unknown>) => void
  onUpdateSku: (id: string, updates: Record<string, unknown>) => void
  onBatchSave: (subOrderId: string) => void
}) {
  const isEsim = sub.category === 'esim'
  const [trackingInput, setTrackingInput] = useState(sub.tracking_number || '')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Sub-order header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEsim ? <Wifi className="w-5 h-5 text-blue-500" /> : <CreditCard className="w-5 h-5 text-green-500" />}
          <div>
            <div className="font-semibold text-sm">
              {isEsim ? 'eSIM 子訂單' : 'SIM 卡子訂單'}
              <span className="ml-2 text-xs text-gray-400 font-mono">{sub.sub_order_number}</span>
            </div>
            <div className="text-xs text-gray-500">
              {sub.skus.length} 項 · NT$ {sub.subtotal}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={sub.status} />
          <select value={sub.status} onChange={(e) => onUpdateSub(sub.id, { status: e.target.value })}
            className="text-xs border border-gray-300 rounded px-2 py-1">
            <option value="pending">待處理</option>
            <option value="processing">處理中</option>
            {isEsim && <option value="completed">已完成</option>}
            {!isEsim && <option value="awaiting_card">待配卡</option>}
            {!isEsim && <option value="card_assigned">已配卡</option>}
            {!isEsim && <option value="shipping">配送中</option>}
            <option value="completed">已完成</option>
          </select>
        </div>
      </div>

      {/* SIM 物流資訊 */}
      {!isEsim && (
        <div className="px-4 py-3 bg-orange-50/50 border-b border-gray-100 flex items-center gap-3">
          <Truck className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <input value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)}
            placeholder="填入物流追蹤號碼..." className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm" />
          <select value={sub.shipping_status || ''} onChange={(e) => onUpdateSub(sub.id, { shipping_status: e.target.value || null })}
            className="text-xs border border-gray-300 rounded px-2 py-1.5">
            <option value="">物流狀態</option>
            <option value="preparing">備貨中</option>
            <option value="shipped">已出貨</option>
            <option value="delivered">已送達</option>
          </select>
          <button onClick={() => onUpdateSub(sub.id, { tracking_number: trackingInput })}
            className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600">
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 批次儲存按鈕 */}
      <div className="px-4 py-3 bg-blue-50/50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {isEsim ? '填入 ICCID + LPA Code 後儲存' : '填入所有 SIM 卡 ICCID 後批次儲存並送出 BC 訂單'}
        </span>
        <button onClick={() => onBatchSave(sub.id)}
          className={`px-4 py-1.5 text-xs font-medium rounded flex items-center gap-1 ${
            isEsim ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-green-600 text-white hover:bg-green-700'
          }`}>
          <Save className="w-3.5 h-3.5" /> 批次儲存
        </button>
      </div>

      {/* L3: SKU 列表 */}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">商品 / SKU</th>
            <th className="text-left px-4 py-2 font-medium w-16">Copies</th>
            <th className="text-left px-4 py-2 font-medium w-16">數量</th>
            <th className="text-left px-4 py-2 font-medium w-20">小計</th>
            <th className="text-left px-4 py-2 font-medium">{isEsim ? 'ICCID / LPA Code' : 'SIM ICCID'}</th>
            <th className="text-left px-4 py-2 font-medium w-20">狀態</th>
            <th className="text-left px-4 py-2 font-medium w-24">BC 單號</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sub.skus.map((sku) => (
            <SkuRow key={sku.id} sku={sku} isEsim={isEsim} onUpdate={onUpdateSku} bcOrderId={sub.bc_order_id} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SkuRow({ sku, isEsim, onUpdate, bcOrderId }: { sku: OrderSku; isEsim: boolean; onUpdate: (id: string, updates: Record<string, unknown>) => void; bcOrderId: string | null }) {
  const existingIccids = isEsim ? (sku.iccid || []) : (sku.sim_iccid || [])
  const [iccids, setIccids] = useState<string[]>(() => {
    const arr = [...existingIccids]
    while (arr.length < sku.quantity) arr.push('')
    return arr
  })
  const [lpaCode, setLpaCode] = useState(sku.lpa_code || '')
  const [saving, setSaving] = useState(false)

  function updateIccid(idx: number, val: string) {
    const arr = [...iccids]; arr[idx] = val; setIccids(arr)
  }

  async function handleSave() {
    setSaving(true)
    const filled = iccids.filter(Boolean)
    const allFilled = filled.length === sku.quantity
    if (isEsim) {
      onUpdate(sku.id, {
        iccid: filled.length > 0 ? filled : null,
        lpa_code: lpaCode || null,
        status: allFilled ? 'completed' : 'processing',
      })
    } else {
      onUpdate(sku.id, {
        sim_iccid: filled.length > 0 ? filled : null,
        status: allFilled ? 'card_assigned' : 'pending',
      })
    }
    setSaving(false)
  }

  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="px-4 py-2">
        {sku.product_name && <div className="font-medium text-xs">{sku.product_name}</div>}
        <div className="text-xs text-gray-600">{sku.display_name || sku.bc_sku_name || '-'}</div>
        <div className="text-[10px] text-gray-400 font-mono">{sku.bc_sku_id}</div>
        {sku.sku_number && <div className="text-[10px] text-blue-500 font-mono mt-0.5">{sku.sku_number}</div>}
      </td>
      <td className="px-4 py-2 text-xs">{sku.copies}</td>
      <td className="px-4 py-2 text-xs">{sku.quantity}</td>
      <td className="px-4 py-2 text-xs font-medium">NT$ {sku.subtotal}</td>
      <td className="px-4 py-2">
        <div className="space-y-1">
          {iccids.map((val, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 w-4">{i + 1}</span>
              <input value={val} onChange={(e) => updateIccid(i, e.target.value)}
                placeholder={isEsim ? 'ICCID' : 'SIM ICCID'}
                className={`flex-1 px-2 py-1 border rounded text-xs font-mono ${val ? 'border-green-300 bg-green-50' : 'border-gray-200'}`} />
            </div>
          ))}
          {isEsim && (
            <input value={lpaCode} onChange={(e) => setLpaCode(e.target.value)}
              placeholder="LPA Code (QR Code Content)"
              className={`w-full px-2 py-1 border rounded text-xs font-mono ${lpaCode ? 'border-green-300 bg-green-50' : 'border-gray-200'}`} />
          )}
          <button onClick={handleSave} disabled={saving}
            className="mt-1 w-full px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1">
            <Save className="w-3 h-3" /> 儲存 ({iccids.filter(Boolean).length}/{sku.quantity})
          </button>
        </div>
      </td>
      <td className="px-4 py-2"><StatusBadge status={sku.status} /></td>
      <td className="px-4 py-2">
        {bcOrderId ? (
          <span className="text-[10px] text-green-600 font-mono">{bcOrderId}</span>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </td>
    </tr>
  )
}
