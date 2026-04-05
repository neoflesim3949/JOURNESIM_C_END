'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Search, Printer, Send, X, Undo2 } from 'lucide-react'

interface ShopeeItem {
  id: string; shopee_product_name: string | null; shopee_variation_name: string | null
  shopee_sku_code: string | null; shopee_product_id: string | null; shopee_variation_id: string | null
  original_price: number | null; sale_price: number | null; quantity: number; return_quantity: number
  matched_package_id: string | null; matched_plan_id: string | null; matched_copies: string | null
  bc_sku_id: string | null; iccid: string[] | null; bc_order_id: string | null; bc_sub_order_id: string | null
  status: string
}

interface ShopeeOrder {
  id: string; shopee_order_number: string; order_status: string | null; return_status: string | null
  buyer_account: string | null; order_date: string | null
  product_total: number | null; buyer_shipping_fee: number | null; shopee_shipping_subsidy: number | null
  return_shipping_fee: number | null; buyer_total_payment: number | null; seller_coupon: number | null
  transaction_fee: number | null; other_service_fee: number | null
  payment_processing_fee: number | null; payment_processing_rate: string | null
  recipient_name: string | null; recipient_phone: string | null; shipping_address: string | null
  shopee_tracking_code: string | null; pickup_store_id: string | null
  city: string | null; district: string | null; zip_code: string | null
  shipping_method: string | null; fulfillment_method: string | null; payment_method: string | null
  buyer_note: string | null; seller_note: string | null; internal_status: string
}

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待對應', color: 'bg-orange-100 text-orange-700' },
  matched: { label: '已對應', color: 'bg-blue-100 text-blue-700' },
  iccid_filled: { label: '已回填', color: 'bg-cyan-100 text-cyan-700' },
  bc_ordered: { label: '已下單', color: 'bg-purple-100 text-purple-700' },
  completed: { label: '完成', color: 'bg-green-100 text-green-700' },
}

export default function ShopeeOrderDetailPage() {
  const { id } = useParams() as { id: string }
  const [order, setOrder] = useState<ShopeeOrder | null>(null)
  const [items, setItems] = useState<ShopeeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [matchingItem, setMatchingItem] = useState<ShopeeItem | null>(null)
  const [matchSearch, setMatchSearch] = useState('')
  const [matchResults, setMatchResults] = useState<{ id: string; name: string; product_type: string; plans: { id: string; bc_sku_id: string; display_name: string | null; copies: string[] }[] }[]>([])

  async function load() {
    const res = await fetch(`/api/admin/shopee/orders/${id}`).then(r => r.json())
    setOrder(res.order); setItems(res.items || []); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function saveIccid(itemId: string, iccids: string[]) {
    const filled = iccids.filter(Boolean)
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, iccid: filled.length > 0 ? filled : null, status: filled.length > 0 ? 'iccid_filled' : 'matched' }),
    }); load()
  }

  async function matchItem(itemId: string, packageId: string, planId: string, copies: string, bcSkuId: string) {
    if (!matchingItem) return
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId, matched_package_id: packageId, matched_plan_id: planId,
        matched_copies: copies, bc_sku_id: bcSkuId, status: 'matched', save_mapping: true,
        shopee_sku_code: matchingItem.shopee_sku_code, shopee_product_id: matchingItem.shopee_product_id,
        shopee_variation_id: matchingItem.shopee_variation_id, shopee_product_name: matchingItem.shopee_product_name,
        shopee_variation_name: matchingItem.shopee_variation_name,
      }),
    }); setMatchingItem(null); load()
  }

  async function unmatchItem(itemId: string) {
    if (!confirm('確定取消此商品對應？')) return
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, matched_package_id: null, matched_plan_id: null, matched_copies: null, bc_sku_id: null, iccid: null, status: 'pending' }),
    }); load()
  }

  async function submitBcOrder() {
    if (!confirm('確定送出 BC 訂單？')) return
    const res = await fetch(`/api/admin/shopee/orders/${id}/bc-order`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) alert(data.error || '送出失敗')
    else alert(`送出完成：${data.results?.length || 0} 項`)
    load()
  }

  async function searchPackages(q: string) {
    setMatchSearch(q)
    if (q.length < 1) { setMatchResults([]); return }
    const res = await fetch(`/api/admin/packages/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) return
    const pkgs = await res.json()
    const results = []
    for (const pkg of pkgs.slice(0, 10)) {
      const pRes = await fetch(`/api/admin/packages/${pkg.id}`)
      if (!pRes.ok) continue
      const pData = await pRes.json()
      results.push({
        id: pkg.id, name: pkg.name, product_type: pkg.product_type,
        plans: (pData.plans || []).map((p: any) => ({
          id: p.id, bc_sku_id: p.bc_sku_id, display_name: p.display_name || p.bc_name,
          copies: (p.copy_prices || []).map((c: any) => c.copies),
        })),
      })
    }
    setMatchResults(results)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!order) return <div>找不到訂單</div>

  const pendingCount = items.filter(i => i.status === 'pending').length
  const canSubmitBc = items.some(i => i.status === 'matched' || i.status === 'iccid_filled')

  return (
    <div>
      <Link href="/admin/shopee/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回蝦皮訂單
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">蝦皮訂單 {order.shopee_order_number}</h1>
          <p className="text-sm text-gray-500">{order.order_date} · {order.buyer_account}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/shopee/labels?order=${id}`} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 列印標籤
          </Link>
          {canSubmitBc && (
            <button onClick={submitBcOrder} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
              <Send className="w-4 h-4" /> 送出 BC 訂單
            </button>
          )}
        </div>
      </div>

      {/* 基本訂單資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">基本訂單資訊</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-500">訂單編號：</span><span className="font-mono">{order.shopee_order_number}</span></div>
          <div><span className="text-gray-500">訂單狀態：</span>{order.order_status || '-'}</div>
          <div><span className="text-gray-500">退貨/退款：</span>{order.return_status || '-'}</div>
          <div><span className="text-gray-500">買家帳號：</span>{order.buyer_account || '-'}</div>
          <div><span className="text-gray-500">訂單日期：</span>{order.order_date || '-'}</div>
        </div>
      </div>

      {/* 收件資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">收件資訊</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-500">收件人：</span>{order.recipient_name || '-'}</div>
          <div><span className="text-gray-500">電話：</span>{order.recipient_phone || '-'}</div>
          <div className="col-span-2"><span className="text-gray-500">地址：</span>{order.zip_code} {order.city}{order.district} {order.shipping_address || '-'}</div>
          <div><span className="text-gray-500">查詢碼：</span><span className="font-mono text-xs">{order.shopee_tracking_code || '-'}</span></div>
          <div><span className="text-gray-500">取件門市：</span>{order.pickup_store_id || '-'}</div>
          <div><span className="text-gray-500">寄送方式：</span>{order.shipping_method || '-'}</div>
          <div><span className="text-gray-500">出貨方式：</span>{order.fulfillment_method || '-'}</div>
          <div><span className="text-gray-500">付款方式：</span>{order.payment_method || '-'}</div>
          {order.buyer_note && <div className="col-span-2"><span className="text-gray-500">買家備註：</span><span className="text-orange-600 font-medium">{order.buyer_note}</span></div>}
          {order.seller_note && <div className="col-span-2"><span className="text-gray-500">備註：</span>{order.seller_note}</div>}
        </div>
      </div>

      {/* 金流資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">金流資訊</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div><span className="text-gray-500">商品總價：</span>NT$ {order.product_total ?? '-'}</div>
          <div><span className="text-gray-500">買家運費：</span>NT$ {order.buyer_shipping_fee ?? '-'}</div>
          <div><span className="text-gray-500">蝦皮補運費：</span>NT$ {order.shopee_shipping_subsidy ?? '-'}</div>
          <div><span className="text-gray-500">退貨運費：</span>NT$ {order.return_shipping_fee ?? '-'}</div>
          <div><span className="font-medium">買家總付：</span><span className="font-semibold">NT$ {order.buyer_total_payment ?? '-'}</span></div>
          <div><span className="text-gray-500">賣家優惠券：</span>NT$ {order.seller_coupon ?? '-'}</div>
          <div><span className="text-gray-500">成交手續費：</span>NT$ {order.transaction_fee ?? '-'}</div>
          <div><span className="text-gray-500">其他服務費：</span>NT$ {order.other_service_fee ?? '-'}</div>
          <div><span className="text-gray-500">金流處理費：</span>NT$ {order.payment_processing_fee ?? '-'}</div>
          <div><span className="text-gray-500">處理費率：</span>{order.payment_processing_rate || '-'}</div>
        </div>
      </div>

      {/* 商品明細 */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">商品明細（{items.length}）{pendingCount > 0 && <span className="text-orange-500 text-sm ml-2">{pendingCount} 待對應</span>}</h2>
        <div className="mt-3 space-y-3">
          {items.map((item) => {
            const st = ITEM_STATUS[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-600' }
            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{item.shopee_product_name || '-'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.shopee_variation_name || '-'}</div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500">
                      <div>商品ID：<span className="font-mono">{item.shopee_product_id || '-'}</span></div>
                      <div>規格ID：<span className="font-mono">{item.shopee_variation_id || '-'}</span></div>
                      <div>商品編碼：<span className="font-mono text-blue-600">{item.shopee_sku_code || '-'}</span></div>
                      <div>數量：{item.quantity}{item.return_quantity > 0 && <span className="text-red-500 ml-1">（退 {item.return_quantity}）</span>}</div>
                      <div>原價：NT$ {item.original_price ?? '-'}</div>
                      <div>活動價：NT$ {item.sale_price ?? '-'}</div>
                    </div>
                    {item.bc_sku_id && <div className="mt-2 text-xs text-blue-600">已對應 BC SKU: {item.bc_sku_id} · copies: {item.matched_copies}</div>}
                    {item.bc_order_id && <div className="text-xs text-green-600 mt-0.5">BC 訂單: {item.bc_order_id}</div>}
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${st.color}`}>{st.label}</span>
                    {item.status === 'pending' && (
                      <button onClick={() => { setMatchingItem(item); setMatchSearch(''); setMatchResults([]) }}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">對應</button>
                    )}
                    {(item.status === 'matched' || item.status === 'iccid_filled') && (
                      <button onClick={() => unmatchItem(item.id)} title="取消對應"
                        className="p-1 text-gray-400 hover:text-red-500"><Undo2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
                {(item.status === 'matched' || item.status === 'iccid_filled') && <IccidInput item={item} onSave={saveIccid} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* 對應彈窗 */}
      {matchingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setMatchingItem(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">對應商品</h2>
                  <p className="text-xs text-gray-500 mt-1">{matchingItem.shopee_product_name} · {matchingItem.shopee_variation_name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">SKU: {matchingItem.shopee_sku_code}</p>
                </div>
                <button onClick={() => setMatchingItem(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={matchSearch} onChange={(e) => searchPackages(e.target.value)}
                  placeholder="搜尋套餐名稱..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {matchResults.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">搜尋套餐以進行對應</p>
              ) : (
                <div className="space-y-3">
                  {matchResults.map(pkg => (
                    <div key={pkg.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-sm">{pkg.name} <span className="text-xs text-gray-400">{pkg.product_type}</span></div>
                      <div className="mt-2 space-y-1">
                        {pkg.plans.map(plan => (
                          <div key={plan.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                            <div>
                              <span className="font-medium">{plan.display_name || plan.bc_sku_id}</span>
                              <span className="text-gray-400 ml-2 font-mono">SKU: {plan.bc_sku_id}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {plan.copies.slice(0, 8).map(c => (
                                <button key={c} onClick={() => matchItem(matchingItem.id, pkg.id, plan.id, c, plan.bc_sku_id)}
                                  className="px-2 py-0.5 border border-blue-300 text-blue-600 rounded hover:bg-blue-50 text-xs">{c}份</button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IccidInput({ item, onSave }: { item: ShopeeItem; onSave: (id: string, iccids: string[]) => void }) {
  const [iccids, setIccids] = useState<string[]>(() => {
    const arr = [...(item.iccid || [])]; while (arr.length < item.quantity) arr.push(''); return arr
  })
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="text-xs font-medium text-gray-500 mb-1">ICCID 回填（{iccids.filter(Boolean).length}/{item.quantity}）</div>
      <div className="flex flex-wrap gap-2">
        {iccids.map((v, i) => (
          <input key={i} value={v} onChange={(e) => { const a = [...iccids]; a[i] = e.target.value; setIccids(a) }}
            placeholder={`ICCID ${i + 1}`}
            className={`px-2 py-1 border rounded text-xs font-mono flex-1 min-w-[200px] ${v ? 'border-green-300 bg-green-50' : 'border-gray-200'}`} />
        ))}
        <button onClick={() => onSave(item.id, iccids)}
          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 flex items-center gap-1">
          <Save className="w-3 h-3" /> 儲存
        </button>
      </div>
    </div>
  )
}
