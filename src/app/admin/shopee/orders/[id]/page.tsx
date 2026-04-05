'use client'

import { Fragment, useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Printer, Send, X, Undo2 } from 'lucide-react'

// ── Code 128B 一維條碼 SVG 生成 ──────────────────────────
function generateCode128SVG(text: string, height = 30, barWidth = 1.5): string {
  const P = '212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232'.split(',')
  const STOP = '2331112'
  const START_B = 104
  const vals = Array.from(text).map(c => c.charCodeAt(0) - 32)
  let checksum = START_B
  vals.forEach((v, i) => { checksum += v * (i + 1) })
  checksum = checksum % 103
  const codes = [P[START_B], ...vals.map(v => P[v]), P[checksum], STOP]
  // 靜區（Quiet Zone）= 10 個模組寬度
  const quietZone = 10 * barWidth
  let x = quietZone
  const bars: string[] = []
  for (const code of codes) {
    for (let i = 0; i < code.length; i++) {
      const w = Number(code[i]) * barWidth
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`)
      x += w
    }
  }
  const totalWidth = x + quietZone
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" style="background:white">${bars.join('')}</svg>`
}

interface ShopeeItem {
  id: string; shopee_product_name: string | null; shopee_variation_name: string | null
  shopee_sku_code: string | null; shopee_product_id: string | null; shopee_variation_id: string | null
  original_price: number | null; sale_price: number | null; quantity: number; return_quantity: number
  matched_package_id: string | null; matched_plan_id: string | null; matched_copies: string | null
  bc_sku_id: string | null; iccid: string[] | null; bc_order_id: string | null; bc_sub_order_id: string | null
  cost_cny: number | null; cost_twd: number | null
  status: string
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
  expiry_date: string | null
}

interface Settlement {
  id: string; shopee_order_number: string; refund_number: string | null
  buyer_account: string | null; order_date: string | null; payment_method: string | null
  wallet_date: string | null; original_price: number | null; promo_discount: number | null
  refund_amount: number | null; shopee_subsidy: number | null; seller_coupon: number | null
  seller_coin_cashback: number | null; buyer_shipping_fee: number | null
  shopee_shipping_subsidy: number | null; shopee_paid_shipping: number | null
  return_shipping_fee: number | null; installment_periods: string | null
  processing_rate: string | null; ams_fee: number | null; transaction_fee: number | null
  other_service_fee: number | null; processing_fee: number | null
  wallet_amount: number | null; payment_source: string | null
  promo_code: string | null; damage_compensation: number | null
}

interface CopiesOption {
  copies: string; days: number; costCny: number; costTwd: number
}

interface BcResult {
  sku_id: string; name: string; unit_days: number
  capacity: string; speed: string
  cost_cny: number; cost_twd: number
  copies_options: CopiesOption[]
  countries: string[]; country_total: number
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
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [matchingItem, setMatchingItem] = useState<ShopeeItem | null>(null)
  // ID 對應名稱
  const [productIdMap, setProductIdMap] = useState<Map<string, string>>(new Map())
  const [variationIdMap, setVariationIdMap] = useState<Map<string, string>>(new Map())
  // BC SKU 名稱
  const [bcSkuNameMap, setBcSkuNameMap] = useState<Map<string, string>>(new Map())
  // 列印彈窗
  const [printModal, setPrintModal] = useState<'detail' | 'product' | null>(null)

  async function load() {
    const [orderRes, idRes] = await Promise.all([
      fetch(`/api/admin/shopee/orders/${id}`).then(r => r.json()),
      fetch('/api/admin/shopee/id-mappings').then(r => r.json()),
    ])
    setOrder(orderRes.order); setItems(orderRes.items || []); setSettlements(orderRes.settlements || [])
    setProductIdMap(new Map((idRes.products || []).map((p: IdMapping) => [p.shopee_product_id!, p.display_name])))
    setVariationIdMap(new Map((idRes.variations || []).map((v: IdMapping) => [v.shopee_variation_id!, v.display_name])))
    // 查 BC SKU 名稱
    const bcSkuIds = [...new Set((orderRes.items || []).map((i: ShopeeItem) => i.bc_sku_id).filter(Boolean))]
    if (bcSkuIds.length > 0) {
      const params = new URLSearchParams({ action: 'names', sku_ids: bcSkuIds.join(',') })
      const bcRes = await fetch(`/api/admin/shopee/bc-search?${params}`).then(r => r.json())
      setBcSkuNameMap(new Map((bcRes || []).map((b: { sku_id: string; name: string }) => [b.sku_id, b.name])))
    }
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


  async function saveIccid(itemId: string, iccids: string[]) {
    const filled = iccids.filter(Boolean)
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, iccid: filled.length > 0 ? filled : null, status: filled.length > 0 ? 'iccid_filled' : 'matched' }),
    }); load()
  }

  // 對應 BC 商品（直接對應 bc_sku_id + copies）
  async function matchBcItem(itemId: string, bcSkuId: string, copies: string) {
    if (!matchingItem) return
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId, bc_sku_id: bcSkuId, matched_copies: copies, status: 'matched',
        save_mapping: true,
        shopee_sku_code: matchingItem.shopee_sku_code,
        shopee_product_id: matchingItem.shopee_product_id,
        shopee_variation_id: matchingItem.shopee_variation_id,
        shopee_product_name: matchingItem.shopee_product_name,
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
    if (!res.ok) {
      alert(data.error || '送出失敗')
    } else {
      const errors = (data.results || []).filter((r: { error?: string }) => r.error)
      if (errors.length > 0) {
        alert(`部分失敗：\n${errors.map((e: { error: string }) => e.error).join('\n')}`)
      } else {
        alert(`送出完成：${data.results?.length || 0} 項`)
      }
    }
    load()
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
        <div className="flex items-center gap-2">
          <button onClick={() => setPrintModal('detail')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 明細標籤
          </button>
          <button onClick={() => setPrintModal('product')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 商品標籤
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
          <div className="col-span-2"><span className="text-gray-500">包裹查詢號碼：</span><span className="font-mono text-xs font-medium">{order.shopee_tracking_code || '-'}</span></div>
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

      {/* 金流結算 & 利潤結算 */}
      {(() => {
        const s = settlements.length > 0 ? settlements[0] : null
        // 用金流 Excel 的商品原價（original_price），沒有就用訂單的 product_total
        const originalPrice = s?.original_price ?? order.product_total ?? 0
        const sellerCoupon = Math.abs(s?.seller_coupon ?? order.seller_coupon ?? 0)
        const amsFee = Math.abs(s?.ams_fee ?? 0)
        const txFee = Math.abs(s?.transaction_fee ?? order.transaction_fee ?? 0)
        const otherFee = Math.abs(s?.other_service_fee ?? order.other_service_fee ?? 0)
        const processingFee = Math.abs(s?.processing_fee ?? order.payment_processing_fee ?? 0)
        const walletAmount = s?.wallet_amount ?? null
        const platformFees = amsFee + txFee + otherFee + processingFee
        // 毛利率：入帳金額 / 商品原價
        const grossMargin = originalPrice > 0 && walletAmount !== null ? ((walletAmount / originalPrice) * 100) : null
        const platformRate = originalPrice > 0 ? ((platformFees / originalPrice) * 100) : 0
        const totalCost = items.reduce((sum, i) => sum + ((i.cost_twd ?? 0) * i.quantity), 0)
        const netProfit = walletAmount !== null ? walletAmount - totalCost : null
        const netRate = originalPrice > 0 && netProfit !== null ? ((netProfit / originalPrice) * 100) : null
        // 金流異常：原價 - 優惠券 - 平台費用 應等於入帳金額
        const expectedAmount = originalPrice - sellerCoupon - platformFees
        const hasDiscrepancy = walletAmount !== null && Math.abs(expectedAmount - walletAmount) > 1

        return (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 金流結算 */}
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">金流結算</h3>
                {!s && <span className="text-xs text-gray-400">尚未匯入金流資料</span>}
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">訂單編號：</span><span>{s?.shopee_order_number ?? order.shopee_order_number}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">退款編號：</span><span>{s?.refund_number || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">買家付款方式：</span><span>{s?.payment_method || order.payment_method || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">錢包入帳日期：</span><span>{s?.wallet_date || '-'}</span></div>
                <div className="border-t border-gray-100 my-2" />
                <div className="flex justify-between"><span className="text-gray-500">退款金額：</span><span>NT$ {s?.refund_amount ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">退貨運費：</span><span>NT$ {s?.return_shipping_fee ?? order.return_shipping_fee ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">金流與系統處理費率：</span><span>{s?.processing_rate || order.payment_processing_rate || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">AMS 推廣費用：</span><span>NT$ {s?.ams_fee ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">成交手續費：</span><span>NT$ {s?.transaction_fee ?? order.transaction_fee ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">其他服務費：</span><span>NT$ {s?.other_service_fee ?? order.other_service_fee ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">金流與系統處理費：</span><span>NT$ {s?.processing_fee ?? order.payment_processing_fee ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">損失賠償：</span><span>NT$ {s?.damage_compensation ?? '-'}</span></div>
                <div className="border-t border-gray-200 my-2" />
                <div className="flex justify-between font-semibold"><span>錢包入帳金額：</span><span className={walletAmount !== null ? 'text-green-600' : 'text-gray-400'}>NT$ {walletAmount ?? '-'}</span></div>
              </div>
            </div>

            {/* 利潤結算 */}
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">利潤結算</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">商品原價：</span><span className="font-medium">NT$ {originalPrice}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">賣家優惠券：</span><span>-NT$ {sellerCoupon}</span></div>
                <div className="border-t border-gray-100 my-2" />
                <div className="flex justify-between"><span className="text-gray-500">AMS 推廣費用：</span><span>-NT$ {amsFee}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">成交手續費：</span><span>-NT$ {txFee}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">其他服務費：</span><span>-NT$ {otherFee}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">金流與系統處理費：</span><span>-NT$ {processingFee}</span></div>
                <div className="border-t border-gray-200 my-2" />
                <div className="flex justify-between"><span className="text-gray-500">平台費用合計：</span><span className="text-red-500">-NT$ {platformFees.toFixed(0)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">平台費用率：</span><span className="text-orange-500">{platformRate.toFixed(1)}%</span></div>
                <div className="border-t border-gray-200 my-2" />
                <div className="flex justify-between font-semibold"><span>錢包入帳金額：</span><span className={walletAmount !== null ? 'text-green-600' : 'text-gray-400'}>NT$ {walletAmount ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">毛利率：</span><span className={grossMargin !== null ? (grossMargin >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}>{grossMargin !== null ? `${grossMargin.toFixed(1)}%` : '-'}</span></div>
                <div className="border-t border-gray-200 my-2" />
                <div className="flex justify-between"><span className="text-gray-500">商品成本：</span><span className={totalCost > 0 ? 'text-gray-700' : 'text-gray-400'}>{totalCost > 0 ? `NT$ ${totalCost}` : '-'}</span></div>
                <div className="flex justify-between font-semibold"><span>淨利率：</span><span className={netRate !== null ? (netRate >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}>{netRate !== null ? `${netRate.toFixed(1)}%` : '-'}</span></div>
                {hasDiscrepancy && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                    ⚠ 金流異常：商品原價(NT${originalPrice}) - 優惠券(NT${sellerCoupon}) - 平台費用(NT${platformFees.toFixed(0)}) = NT${expectedAmount.toFixed(0)}，與入帳金額(NT${walletAmount}) 差額 NT${Math.abs(expectedAmount - (walletAmount ?? 0)).toFixed(0)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
                    <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div>數量：<span className="font-medium text-gray-700">{item.quantity}</span>{item.return_quantity > 0 && <span className="text-red-500">（退{item.return_quantity}）</span>}</div>
                      <div>原價：NT$ {item.original_price ?? '-'}</div>
                      <div>活動價：NT$ {item.sale_price ?? '-'}</div>
                      <div className="col-span-3">商品編碼：<span className="font-mono text-blue-600">{item.shopee_sku_code || '-'}</span></div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1">商品ID：<span className="font-mono">{item.shopee_product_id || '-'}</span></div>
                      <div className="flex items-center gap-1">
                        商品名稱：
                        {item.shopee_product_id && <EditableIdName value={productIdMap.get(item.shopee_product_id) || ''} onSave={(name) => saveIdMapping('product', item.shopee_product_id!, name)} placeholder="設定" />}
                        {!item.shopee_product_id && '-'}
                      </div>
                      <div className="flex items-center gap-1">規格ID：<span className="font-mono">{item.shopee_variation_id || '-'}</span></div>
                      <div className="flex items-center gap-1">
                        規格名稱：
                        {item.shopee_variation_id && <EditableIdName value={variationIdMap.get(item.shopee_variation_id) || ''} onSave={(name) => saveIdMapping('variation', item.shopee_variation_id!, name)} placeholder="設定" />}
                        {!item.shopee_variation_id && '-'}
                      </div>
                    </div>
                    {item.bc_sku_id && <div className="mt-2 text-xs text-blue-600">已對應 BC SKU: {bcSkuNameMap.get(item.bc_sku_id) || ''} · {item.bc_sku_id} · copies: {item.matched_copies}</div>}
                    {item.bc_order_id && <div className="text-xs text-green-600 mt-0.5">BC 訂單: {item.bc_order_id}{item.bc_sub_order_id && ` · 子訂單: ${item.bc_sub_order_id}`}</div>}
                    {item.cost_twd != null && <div className="text-xs text-gray-500 mt-0.5">成本：¥{item.cost_cny ?? 0} · NT${item.cost_twd}</div>}
                    {item.iccid && item.iccid.length > 0 && item.status !== 'matched' && item.status !== 'iccid_filled' && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.iccid.map((ic, j) => <span key={j} className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">ICCID: {ic}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${st.color}`}>{st.label}</span>
                    {!item.bc_order_id && (
                      <button onClick={() => setMatchingItem(item)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                        {item.status === 'pending' ? '對應' : '重新對應'}
                      </button>
                    )}
                    {!item.bc_order_id && item.bc_sku_id && (
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
                <button onClick={() => {
                  const el = document.getElementById('print-area')
                  if (!el) return
                  const w = window.open('', '', `width=${screen.width},height=${screen.height}`)
                  if (!w) return
                  if (printModal === 'product') {
                    // 商品標籤：頁面尺寸 30mm×15mm，每標籤一頁
                    w.document.write(`<html><head><style>
                      @page{size:30mm 15mm;margin:0}
                      body{margin:0;padding:0;font-family:sans-serif}
                      body>div{gap:0!important}
                      .label{width:30mm;height:15mm;padding:1mm 2mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:1mm;page-break-after:always;border:none!important}
                    </style></head><body>${el.innerHTML}</body></html>`)
                  } else {
                    // 明細標籤：頁面尺寸 100mm×150mm
                    w.document.write(`<html><head><style>
                      @page{size:100mm 150mm;margin:0}
                      body{margin:0;font-family:sans-serif}
                    </style></head><body>${el.innerHTML}</body></html>`)
                  }
                  w.document.close(); w.print(); w.close()
                }}
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
                  <div style={{ borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>收件人：</strong>{order.recipient_name}</span><span><strong>電話：</strong>{order.recipient_phone}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>地址：</strong>{order.zip_code} {order.city}{order.district} {order.shipping_address}</span>
                      <span>{order.shipping_method && <><strong>寄送：</strong>{order.shipping_method}</>}{order.pickup_store_id && <> · <strong>門市：</strong>{order.pickup_store_id}</>}</span>
                    </div>
                  </div>
                  {order.shopee_tracking_code && (
                    <div style={{ borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '1mm' }}>包裹：{order.shopee_tracking_code}</div>
                      <div dangerouslySetInnerHTML={{ __html: generateCode128SVG(order.shopee_tracking_code, 25, 1.5) }} />
                    </div>
                  )}
                  <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>商品明細：</div>
                  {items.map((item, i) => (
                    <div key={i} style={{ border: '1px solid #000', borderRadius: '2mm', padding: '2mm', marginBottom: '2mm' }}>
                      <div><strong>{i + 1}. {item.shopee_product_name}</strong> × {item.quantity}</div>
                      <div style={{ fontSize: '10px', color: '#666' }}>{item.shopee_variation_name}</div>
                      {item.iccid?.map((ic, j) => <div key={j} style={{ fontSize: '9px', fontFamily: 'monospace' }}>ICCID: {ic}</div>)}
                    </div>
                  ))}
                  {order.buyer_note && <div style={{ marginTop: '3mm', padding: '2mm', background: '#fff3cd', borderRadius: '2mm', fontSize: '10px' }}><strong>買家備註：</strong>{order.buyer_note}</div>}
                  <div style={{ marginTop: '3mm', textAlign: 'right', fontWeight: 'bold' }}>金額：NT$ {order.buyer_total_payment}</div>
                </div>
              ) : (
                /* 商品標籤 30mm × 15mm — 每標籤獨立一頁，頁面尺寸即標籤尺寸 */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4mm', alignItems: 'center' }}>
                  {(() => {
                    let ls = { line1: 12, line2: 12, line3: 10 }
                    try { const saved = localStorage.getItem('shopee_label_settings'); if (saved) ls = JSON.parse(saved) } catch {}
                    const expiry = localStorage.getItem('shopee_expiry_date') || ''
                    return items.flatMap(item =>
                      Array.from({ length: item.quantity }, (_, j) => (
                        <div key={`${item.id}-${j}`} className="label"
                          style={{ width: '30mm', height: '15mm', border: '1px solid #ccc', padding: '1mm 2mm', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxSizing: 'border-box', pageBreakAfter: 'always' }}>
                          <div style={{ fontSize: `${ls.line1}px`, fontWeight: 'bold', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {productIdMap.get(item.shopee_product_id || '') || item.shopee_product_name}
                          </div>
                          <div style={{ fontSize: `${ls.line2}px`, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {variationIdMap.get(item.shopee_variation_id || '') || item.shopee_variation_name}
                          </div>
                          {expiry && (
                            <div style={{ fontSize: `${ls.line3}px`, lineHeight: 1.2, whiteSpace: 'nowrap' }}>使用期限：{expiry.replace(/-/g, '/')}</div>
                          )}
                        </div>
                      ))
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BC 商品對應彈窗 */}
      {matchingItem && (
        <BcMatchModal
          item={matchingItem}
          onMatch={(skuId, copies) => matchBcItem(matchingItem.id, skuId, copies)}
          onClose={() => setMatchingItem(null)}
        />
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

// ── BC 商品對應彈窗（JOURNESIM 風格）──────────────────────────
function BcMatchModal({ item, onMatch, onClose }: {
  item: ShopeeItem
  onMatch: (skuId: string, copies: string) => void
  onClose: () => void
}) {
  const [countries, setCountries] = useState<{ mcc: string; name: string }[]>([])
  const [daysOpts, setDaysOpts] = useState<string[]>([])
  const [capacityOpts, setCapacityOpts] = useState<string[]>([])
  const [selCountries, setSelCountries] = useState<string[]>([])
  const [selDays, setSelDays] = useState('')
  const [selCapacity, setSelCapacity] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<BcResult[]>([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortPrice, setSortPrice] = useState<'asc' | 'desc' | null>(null)

  // 國家下拉
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryQ, setCountryQ] = useState('')
  const countryRef = useRef<HTMLDivElement>(null)

  // 點擊外部關閉國家下拉
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 載入選項
  useEffect(() => {
    fetch('/api/admin/shopee/bc-search?action=options').then(r => r.json()).then(d => {
      setCountries(d.countries || [])
      setDaysOpts(d.days || [])
      setCapacityOpts(d.capacities || [])
    })
  }, [])

  async function doSearch() {
    setSearching(true)
    const params = new URLSearchParams({ action: 'search' })
    if (selCountries.length > 0) params.set('countries', selCountries.join(','))
    if (selDays) params.set('days', selDays)
    if (selCapacity) params.set('capacity', selCapacity)
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/shopee/bc-search?${params}`)
    if (res.ok) setResults(await res.json())
    setSearching(false)
  }

  function toggleCountry(mcc: string) {
    setSelCountries(prev => prev.includes(mcc) ? prev.filter(m => m !== mcc) : [...prev, mcc])
  }

  const filteredCountries = countryQ
    ? countries.filter(c => c.name.toLowerCase().includes(countryQ.toLowerCase()) || c.mcc.toLowerCase().includes(countryQ.toLowerCase()))
    : countries

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 標題 */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">對應 BC 商品</h2>
            <p className="text-xs text-gray-500 mt-1">{item.shopee_product_name} · {item.shopee_variation_name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        {/* 篩選列 */}
        <div className="p-5 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {/* 國家多選 */}
            <div ref={countryRef} className="relative">
              <button type="button" onClick={() => setCountryOpen(v => !v)}
                className="w-full text-left px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
                {selCountries.length > 0 ? (
                  <span className="flex items-center gap-1 flex-wrap">
                    {selCountries.slice(0, 3).map(mcc => {
                      const c = countries.find(o => o.mcc === mcc)
                      return <span key={mcc} className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
                        {c?.name || mcc} <span className="cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleCountry(mcc) }}>×</span>
                      </span>
                    })}
                    {selCountries.length > 3 && <span className="text-xs text-gray-400">+{selCountries.length - 3}</span>}
                  </span>
                ) : <span className="text-gray-400">搜索國家或地區</span>}
              </button>
              {countryOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input value={countryQ} onChange={e => setCountryQ(e.target.value)} placeholder="搜索國家..."
                      className="w-full px-2 py-1.5 bg-gray-50 rounded text-sm" autoFocus />
                  </div>
                  {selCountries.length > 0 && (
                    <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
                      <span className="text-xs text-gray-500">已選 {selCountries.length} 個</span>
                      <button onClick={() => setSelCountries([])} className="text-xs text-blue-600 hover:underline">清除全部</button>
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto">
                    {filteredCountries.map(c => (
                      <label key={c.mcc} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm ${selCountries.includes(c.mcc) ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={selCountries.includes(c.mcc)} onChange={() => toggleCountry(c.mcc)} className="accent-blue-600" />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 天數 */}
            <select value={selDays} onChange={e => setSelDays(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">全部天數</option>
              {daysOpts.map(d => <option key={d} value={d}>{d} 天</option>)}
            </select>

            {/* 流量 */}
            <select value={selCapacity} onChange={e => setSelCapacity(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">選擇流量</option>
              {capacityOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="搜索套餐名稱或 SKU ID" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-xs text-gray-400 whitespace-nowrap">符合：{results.length} 個</span>
            <button onClick={doSearch} disabled={searching}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {searching ? '搜尋中...' : '查 詢'}
            </button>
          </div>
        </div>

        {/* 結果表格 */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">輸入篩選條件後點擊查詢</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-gray-500 bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">套餐名稱</th>
                  <th className="text-left px-4 py-2.5 font-medium w-16">流量</th>
                  <th className="text-left px-4 py-2.5 font-medium w-16">限速</th>
                  <th className="text-left px-4 py-2.5 font-medium w-36">適用國家</th>
                  <th className="text-right px-4 py-2.5 font-medium w-20">天數</th>
                  <th className="text-right px-4 py-2.5 font-medium w-24 cursor-pointer select-none hover:text-blue-600" onClick={() => setSortPrice(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}>
                    結算價 {sortPrice === 'asc' ? '↑' : sortPrice === 'desc' ? '↓' : ''}
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium w-14">詳情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  let sorted = results
                  if (sortPrice && selDays) {
                    const target = parseInt(selDays)
                    sorted = [...results].sort((a, b) => {
                      const aP = a.copies_options.find(o => o.days === target)?.costCny ?? Infinity
                      const bP = b.copies_options.find(o => o.days === target)?.costCny ?? Infinity
                      return sortPrice === 'asc' ? aP - bP : bP - aP
                    })
                  }
                  return sorted
                })().map((bc, i) => {
                  const isExpanded = expanded.has(bc.sku_id)
                  const toggleExpand = () => setExpanded(prev => {
                    const next = new Set(prev)
                    next.has(bc.sku_id) ? next.delete(bc.sku_id) : next.add(bc.sku_id)
                    return next
                  })
                  // 如果有篩選天數，找到匹配的 copies option
                  const matchedOpt = selDays ? bc.copies_options.find(o => o.days === parseInt(selDays)) : null
                  return (
                    <Fragment key={`${bc.sku_id}-${i}`}>
                      <tr className={`hover:bg-blue-50/50 cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''}`} onClick={toggleExpand}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 flex-shrink-0 w-3">{isExpanded ? '▾' : '▸'}</span>
                            <div>
                              <div className={`font-medium text-sm ${isExpanded ? 'text-blue-700' : 'truncate max-w-[350px]'}`}>{bc.name}</div>
                              <div className="text-gray-400 font-mono text-[10px]">{bc.sku_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">{bc.capacity}</td>
                        <td className="px-4 py-2.5">{bc.speed}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-0.5">
                            {bc.countries.map((c, j) => <span key={j} className="px-1 bg-gray-100 rounded text-[10px]">{c}</span>)}
                            {bc.country_total > 5 && <span className="text-[10px] text-gray-400">+{bc.country_total - 5}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {matchedOpt ? `${matchedOpt.days} 天` : `${bc.copies_options.length} 規格`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-blue-600">
                          {matchedOpt ? `¥${matchedOpt.costCny.toFixed(2)}` : (isExpanded ? '' : '展開查看')}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {matchedOpt ? (
                            <button onClick={(e) => { e.stopPropagation(); onMatch(bc.sku_id, matchedOpt.copies) }}
                              className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium">
                              選取
                            </button>
                          ) : '📋'}
                        </td>
                      </tr>
                      {isExpanded && bc.copies_options.map((opt, oi) => (
                        <tr key={`${bc.sku_id}-opt-${oi}`} className={`${oi % 2 === 0 ? 'bg-white' : 'bg-blue-50/20'} hover:bg-blue-50/50`}>
                          <td colSpan={4}></td>
                          <td className="px-4 py-2 text-right font-medium">{opt.days} 天</td>
                          <td className="px-4 py-2 text-right font-medium text-blue-600">¥{opt.costCny.toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={(e) => { e.stopPropagation(); onMatch(bc.sku_id, opt.copies) }}
                              className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium">
                              選取
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
