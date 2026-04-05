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
  status: string; expiry_date: string | null
}

interface IdMapping { shopee_product_id?: string; shopee_variation_id?: string; display_name: string }

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
  // ID 對應名稱
  const [productIdMap, setProductIdMap] = useState<Map<string, string>>(new Map())
  const [variationIdMap, setVariationIdMap] = useState<Map<string, string>>(new Map())
  // 列印彈窗
  const [printModal, setPrintModal] = useState<'detail' | 'product' | null>(null)

  async function load() {
    const [orderRes, idRes] = await Promise.all([
      fetch(`/api/admin/shopee/orders/${id}`).then(r => r.json()),
      fetch('/api/admin/shopee/id-mappings').then(r => r.json()),
    ])
    setOrder(orderRes.order); setItems(orderRes.items || [])
    setProductIdMap(new Map((idRes.products || []).map((p: IdMapping) => [p.shopee_product_id!, p.display_name])))
    setVariationIdMap(new Map((idRes.variations || []).map((v: IdMapping) => [v.shopee_variation_id!, v.display_name])))
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  // 儲存 ID 對應名稱
  async function saveIdMapping(type: 'product' | 'variation', shopeeId: string, displayName: string) {
    await fetch('/api/admin/shopee/id-mappings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, shopee_id: shopeeId, display_name: displayName }),
    })
    if (type === 'product') setProductIdMap(prev => new Map(prev).set(shopeeId, displayName))
    else setVariationIdMap(prev => new Map(prev).set(shopeeId, displayName))
  }

  // 儲存使用期限
  async function saveExpiryDate(itemId: string, date: string) {
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, expiry_date: date || null }),
    }); load()
  }

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
          <button onClick={() => setPrintModal('detail')} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 列印明細標籤
          </button>
          <button onClick={() => setPrintModal('product')} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 列印商品標籤
          </button>
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
                      <div className="flex items-center gap-1">
                        <span>商品ID：</span>
                        <span className="font-mono">{item.shopee_product_id || '-'}</span>
                        {item.shopee_product_id && (
                          <EditableIdName
                            value={productIdMap.get(item.shopee_product_id) || ''}
                            onSave={(name) => saveIdMapping('product', item.shopee_product_id!, name)}
                            placeholder="設定名稱"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span>規格ID：</span>
                        <span className="font-mono">{item.shopee_variation_id || '-'}</span>
                        {item.shopee_variation_id && (
                          <EditableIdName
                            value={variationIdMap.get(item.shopee_variation_id) || ''}
                            onSave={(name) => saveIdMapping('variation', item.shopee_variation_id!, name)}
                            placeholder="設定名稱"
                          />
                        )}
                      </div>
                      <div>商品編碼：<span className="font-mono text-blue-600">{item.shopee_sku_code || '-'}</span></div>
                      <div>數量：{item.quantity}{item.return_quantity > 0 && <span className="text-red-500 ml-1">（退 {item.return_quantity}）</span>}</div>
                      <div>原價：NT$ {item.original_price ?? '-'}</div>
                      <div>活動價：NT$ {item.sale_price ?? '-'}</div>
                      <div className="flex items-center gap-1">
                        <span>使用期限：</span>
                        <input type="date" value={item.expiry_date || ''} onChange={(e) => saveExpiryDate(item.id, e.target.value)}
                          className="px-1 py-0.5 border border-gray-200 rounded text-xs" />
                      </div>
                    </div>
                    {/* 顯示對應名稱 */}
                    {(productIdMap.get(item.shopee_product_id || '') || variationIdMap.get(item.shopee_variation_id || '')) && (
                      <div className="mt-1 text-xs">
                        {productIdMap.get(item.shopee_product_id || '') && <span className="text-purple-600 mr-2">商品：{productIdMap.get(item.shopee_product_id || '')}</span>}
                        {variationIdMap.get(item.shopee_variation_id || '') && <span className="text-teal-600">規格：{variationIdMap.get(item.shopee_variation_id || '')}</span>}
                      </div>
                    )}
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

      {/* 列印彈窗 */}
      {printModal && order && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">{printModal === 'detail' ? '明細標籤預覽' : '商品標籤預覽'}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { const el = document.getElementById('print-area'); if (el) { const w = window.open('', '', 'width=400,height=600'); if (w) { w.document.write('<html><head><style>body{margin:0;font-family:sans-serif}@page{margin:0}</style></head><body>' + el.innerHTML + '</body></html>'); w.document.close(); w.print(); w.close() } } }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Printer className="w-4 h-4" /> 列印
                </button>
                <button onClick={() => setPrintModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5" id="print-area">
              {printModal === 'detail' ? (
                /* 明細標籤 100mm × 150mm */
                <div style={{ width: '100mm', minHeight: '150mm', padding: '5mm', fontSize: '11px', fontFamily: 'sans-serif', border: '1px solid #ccc', margin: '0 auto' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                    蝦皮訂單：{order.shopee_order_number}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666', marginBottom: '3mm' }}>日期：{order.order_date}</div>
                  <div style={{ borderBottom: '1px dashed #ccc', paddingBottom: '3mm', marginBottom: '3mm' }}>
                    <div><strong>收件人：</strong>{order.recipient_name}</div>
                    <div><strong>電話：</strong>{order.recipient_phone}</div>
                    <div><strong>地址：</strong>{order.zip_code} {order.city}{order.district} {order.shipping_address}</div>
                    {order.shipping_method && <div><strong>寄送：</strong>{order.shipping_method}</div>}
                    {order.pickup_store_id && <div><strong>門市：</strong>{order.pickup_store_id}</div>}
                  </div>
                  <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>商品明細：</div>
                  {items.map((item, i) => (
                    <div key={i} style={{ border: '1px solid #ddd', borderRadius: '2mm', padding: '2mm', marginBottom: '2mm' }}>
                      <div><strong>{i + 1}. {productIdMap.get(item.shopee_product_id || '') || item.shopee_product_name}</strong> × {item.quantity}</div>
                      <div style={{ fontSize: '10px', color: '#666' }}>{variationIdMap.get(item.shopee_variation_id || '') || item.shopee_variation_name}</div>
                      {item.expiry_date && <div style={{ fontSize: '9px' }}>使用期限：{item.expiry_date}</div>}
                      {item.iccid?.map((ic, j) => <div key={j} style={{ fontSize: '9px', fontFamily: 'monospace' }}>ICCID: {ic}</div>)}
                    </div>
                  ))}
                  {order.buyer_note && <div style={{ marginTop: '3mm', padding: '2mm', background: '#fff3cd', borderRadius: '2mm', fontSize: '10px' }}><strong>買家備註：</strong>{order.buyer_note}</div>}
                  <div style={{ marginTop: '3mm', textAlign: 'right', fontWeight: 'bold' }}>金額：NT$ {order.buyer_total_payment}</div>
                </div>
              ) : (
                /* 商品標籤 30mm × 15mm — 每張卡獨立一張 */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4mm', alignItems: 'center' }}>
                  {items.flatMap(item =>
                    Array.from({ length: item.quantity }, (_, j) => (
                      <div key={`${item.id}-${j}`}
                        style={{ width: '30mm', height: '15mm', border: '1px solid #ccc', padding: '1mm 2mm', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', pageBreakAfter: 'always' }}>
                        <div style={{ fontSize: '9px', fontWeight: 'bold', lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {productIdMap.get(item.shopee_product_id || '') || item.shopee_product_name}
                        </div>
                        <div style={{ fontSize: '9px', lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {variationIdMap.get(item.shopee_variation_id || '') || item.shopee_variation_name}
                        </div>
                        {item.expiry_date && (
                          <div style={{ fontSize: '8px', lineHeight: 1.3 }}>使用期限：{item.expiry_date}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

// 行內可編輯的 ID 對應名稱
function EditableIdName({ value, onSave, placeholder }: { value: string; onSave: (name: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value)

  if (!editing) {
    return value ? (
      <button onClick={() => { setInput(value); setEditing(true) }} className="text-purple-600 hover:underline text-xs ml-1">({value})</button>
    ) : (
      <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-blue-500 text-xs ml-1">[{placeholder}]</button>
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(input); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        className="px-1 py-0 border border-blue-300 rounded text-xs w-20" />
      <button onClick={() => { onSave(input); setEditing(false) }} className="text-blue-500 text-xs">✓</button>
      <button onClick={() => setEditing(false)} className="text-gray-400 text-xs">✕</button>
    </span>
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
