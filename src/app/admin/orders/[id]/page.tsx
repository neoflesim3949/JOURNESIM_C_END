'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wifi, CreditCard, Truck, Save } from 'lucide-react'

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
    // TODO: 收集所有有 ICCID 值的 SKU，批次儲存並呼叫 BC API
    alert('批次儲存功能開發中 — 將收集所有已填入的 ICCID 並送出 BC 訂單')
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

      <h1 className="mt-4 text-2xl font-bold">訂單詳情</h1>

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
            <SkuRow key={sku.id} sku={sku} isEsim={isEsim} onUpdate={onUpdateSku} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SkuRow({ sku, isEsim, onUpdate }: { sku: OrderSku; isEsim: boolean; onUpdate: (id: string, updates: Record<string, unknown>) => void }) {
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
        {sku.bc_sub_order_id ? (
          <span className="text-[10px] text-green-600 font-mono">{sku.bc_sub_order_id}</span>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </td>
    </tr>
  )
}
