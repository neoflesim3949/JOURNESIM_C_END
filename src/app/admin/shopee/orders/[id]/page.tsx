'use client'

import { Fragment, useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Printer, Send, X, Undo2, Split, Plus, Trash2, Download, Activity } from 'lucide-react'

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
  is_manual?: boolean
  delivery_type?: 'sim' | 'esim'
  qr_code_url?: string | null
  lpa_code?: string | null
}

interface IdMapping { shopee_product_id?: string; shopee_variation_id?: string; display_name: string }

interface CardExpiryRow { iccid: string; type?: string; status?: string; expirationDate?: string; usageCount?: string }
interface PlanUsageCountry { mcc?: string; name?: string; apn?: string; apnUsername?: string; apnPassword?: string; operator?: string }
interface PlanUsageSub { subOrderId?: string; skuName?: string; planStatus?: string; planStartTime?: string | null; planEndTime?: string | null; totalDays?: string; remainingDays?: string; totalTraffic?: string; remainingTraffic?: string; copies?: string; country?: PlanUsageCountry[] }
interface PlanUsageOrder { orderId?: string; channelOrderId?: string; subOrderList?: PlanUsageSub[] }
interface PlanUsageResult { iccid: string; ok: boolean; data?: PlanUsageOrder[]; error?: string }
interface CardUsageResp { iccids: string[]; cardExpiry: CardExpiryRow[]; cardError: string | null; planUsage: PlanUsageResult[] }

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
  shopee_account_id: string | null
  is_manual?: boolean
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

interface CountryDetail {
  mcc: string; name_zh: string
  apn: string | null; apn_username: string | null; apn_password: string | null
  operator: string | null
}
interface BcResult {
  sku_id: string; name: string; unit_days: number
  capacity: string; speed: string
  cost_cny: number; cost_twd: number
  copies_options: CopiesOption[]
  countries: string[]; country_total: number
  country_details?: CountryDetail[]
}

// 台灣時區格式化 (Asia/Taipei)
function formatTW(value: string | null | undefined, withTime = true): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const fmt = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
  return fmt.format(d)
}

// 用於 datetime-local input 的 TW 時間字串
function toTWDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return tw.toISOString().slice(0, 16)
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
  const router = useRouter()
  const [order, setOrder] = useState<ShopeeOrder | null>(null)
  const [items, setItems] = useState<ShopeeItem[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [matchingItem, setMatchingItem] = useState<ShopeeItem | null>(null)
  const [usageModal, setUsageModal] = useState<{ itemId: string; loading: boolean; data: CardUsageResp | null; error: string | null } | null>(null)
  // 自設名稱（商品名稱 by SKU code, 規格名稱 by variation ID）
  const [skuProductNameMap, setSkuProductNameMap] = useState<Map<string, string>>(new Map())
  const [variationIdMap, setVariationIdMap] = useState<Map<string, string>>(new Map())
  // BC SKU 名稱
  const [bcSkuNameMap, setBcSkuNameMap] = useState<Map<string, string>>(new Map())
  // 蝦皮帳號
  const [accountMap, setAccountMap] = useState<Map<string, string>>(new Map())
  // 列印彈窗
  const [printModal, setPrintModal] = useState<'detail' | 'product' | 'receipt' | 'receipt_a5' | 'shipping' | null>(null)
  // 收據資訊
  const [receiptBuyer, setReceiptBuyer] = useState('')
  const [receiptTaxId, setReceiptTaxId] = useState('')
  const [receiptAddress, setReceiptAddress] = useState('')
  // 手動加入品項
  const [addingItem, setAddingItem] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualVariation, setManualVariation] = useState('')
  const [manualQty, setManualQty] = useState('1')
  const [manualPrice, setManualPrice] = useState('0')
  const [manualDeliveryType, setManualDeliveryType] = useState<'sim' | 'esim'>('sim')

  async function load() {
    const [orderRes, idRes, accRes] = await Promise.all([
      fetch(`/api/admin/shopee/orders/${id}`).then(r => r.json()),
      fetch('/api/admin/shopee/id-mappings').then(r => r.json()),
      fetch('/api/admin/shopee/accounts').then(r => r.json()),
    ])
    setOrder(orderRes.order); setItems(orderRes.items || []); setSettlements(orderRes.settlements || [])
    setAccountMap(new Map((accRes || []).map((a: { id: string; name: string }) => [a.id, a.name])))
    // 商品名稱 by SKU code（shopee_product_id 欄位現存放 SKU code）
    setSkuProductNameMap(new Map((idRes.products || []).map((p: IdMapping) => [p.shopee_product_id!, p.display_name])))
    setVariationIdMap(new Map((idRes.variations || []).map((v: IdMapping) => [v.shopee_variation_id!, v.display_name])))
    // 查 BC SKU 名稱
    const bcSkuIds = [...new Set((orderRes.items || []).map((i: ShopeeItem) => i.bc_sku_id).filter(Boolean))]
    if (bcSkuIds.length > 0) {
      const params = new URLSearchParams({ action: 'names', sku_ids: bcSkuIds.join(',') })
      const bcRes = await fetch(`/api/admin/shopee/bc-search?${params}`).then(r => r.json())
      setBcSkuNameMap(new Map((bcRes || []).map((b: { sku_id: string; name: string }) => [b.sku_id, b.name])))
    }
    // 自動解析買家備註中的收據資訊
    const note = orderRes.order?.buyer_note || ''
    const companyMatch = note.match(/公司抬頭[：:]\s*(.+?)(?:\s|統編|$)/)
    const taxMatch = note.match(/統編[：:]\s*(\d+)/)
    if (companyMatch) setReceiptBuyer(companyMatch[1].trim())
    if (taxMatch) setReceiptTaxId(taxMatch[1].trim())
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  // 更新訂單層級欄位（為手動訂單提供直接編輯）
  async function saveOrderField(field: string, value: string | number | null) {
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    load()
  }

  async function saveSettlementField(field: string, value: number | string | null) {
    await fetch(`/api/admin/shopee/orders/${id}/settlement`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    load()
  }

  async function deleteOrder() {
    if (!confirm('確定刪除此訂單？\n\n所有商品明細將一併刪除，此操作無法還原。')) return
    const res = await fetch(`/api/admin/shopee/orders/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '刪除失敗'); return }
    alert('已刪除')
    router.push('/admin/shopee/orders')
  }

  // 儲存自設名稱（product by SKU code, variation by variation ID）
  async function saveIdMapping(type: 'product' | 'variation', shopeeId: string, displayName: string) {
    await fetch('/api/admin/shopee/id-mappings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, shopee_id: shopeeId, display_name: displayName }),
    })
    if (type === 'product') setSkuProductNameMap(prev => new Map(prev).set(shopeeId, displayName))
    else setVariationIdMap(prev => new Map(prev).set(shopeeId, displayName))
  }


  async function saveIccid(itemId: string, iccids: string[]) {
    const filled = iccids.filter(Boolean)
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, iccid: filled.length > 0 ? filled : null, status: filled.length > 0 ? 'iccid_filled' : 'matched' }),
    }); load()
  }

  // 對應 BC 商品（直接對應 bc_sku_id + copies）— 保留原已回填的 ICCID，不重設
  async function matchBcItem(itemId: string, bcSkuId: string, copies: string) {
    if (!matchingItem) return
    const hasIccid = !!(matchingItem.iccid && matchingItem.iccid.length > 0)
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId, bc_sku_id: bcSkuId, matched_copies: copies,
        status: hasIccid ? 'iccid_filled' : 'matched',
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

  async function cancelBcOrder(item: ShopeeItem) {
    const reason = prompt('請輸入售後原因代碼：\n20 = 無理由退訂\n29 = eSIM未下載退訂')
    if (reason === null) return
    if (!reason.trim()) { alert('請填寫售後原因代碼'); return }
    const res = await fetch(`/api/admin/shopee/orders/${id}/bc-aftersale`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, reason: reason.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      // F017 失敗，提供強制取消選項
      const forceCancel = confirm(`售後申請失敗：${data.error}\n\n是否強制取消系統記錄？（不影響 BC 端，需手動至 BC 後台處理）`)
      if (!forceCancel) return
      const keepIccid = !!(item.iccid && item.iccid.length > 0)
      await fetch(`/api/admin/shopee/orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, bc_order_id: null, bc_sub_order_id: null, cost_cny: null, cost_twd: null, status: keepIccid ? 'iccid_filled' : 'matched' }),
      })
      alert(keepIccid ? '已強制清除系統記錄（保留 ICCID）' : '已強制清除系統記錄')
      load(); return
    }
    alert(data.warning || `售後申請成功，售後單號：${data.afterSaleId}`)
    load()
  }

  async function openUsage(itemId: string) {
    setUsageModal({ itemId, loading: true, data: null, error: null })
    const res = await fetch(`/api/admin/shopee/orders/${id}/items/${itemId}/card-usage`)
    const d = await res.json()
    if (!res.ok) {
      setUsageModal({ itemId, loading: false, data: null, error: d.error || '查詢失敗' })
      return
    }
    setUsageModal({ itemId, loading: false, data: d, error: null })
  }

  async function syncFromBc(itemId: string) {
    const orderId = prompt('請輸入 BC orderId（BC 後台的訂單編號，如 2776523850809139）：\n\n留空會嘗試使用此品項既有的 BC orderId')
    if (orderId === null) return
    const res = await fetch(`/api/admin/shopee/orders/${id}/items/${itemId}/sync-bc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '撈取失敗'); return }
    alert(`已撈回\nBC 訂單：${data.orderId}\n子單：${data.subOrderId}\nICCID：${(data.iccid || []).join(', ') || '(無)'}\n\n${data.note || ''}`)
    load()
  }

  async function splitItem(itemId: string, quantity: number) {
    if (!confirm(`確定將此品項拆成 ${quantity} 個獨立品項？\n\n每個子品項數量為 1，可個別設定 BC SKU 與 ICCID。`)) return
    const res = await fetch(`/api/admin/shopee/orders/${id}/items/${itemId}/split`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '拆單失敗'); return }
    load()
  }

  async function deleteItem(itemId: string) {
    if (!confirm('確定刪除此品項？')) return
    const res = await fetch(`/api/admin/shopee/orders/${id}/items/${itemId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '刪除失敗'); return }
    load()
  }

  async function addManualItem(payload: { name: string; variation?: string; quantity: number; price: number; delivery_type?: 'sim' | 'esim' }) {
    const res = await fetch(`/api/admin/shopee/orders/${id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '新增失敗'); return false }
    load()
    return true
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

  // 商品標籤：每張轉圖、每張一頁，產成 PDF（頁面尺寸＝標籤尺寸，不靠印表機驅動切，避免位移）
  async function printProductLabelsPdf() {
    const area = document.getElementById('print-area')
    const labels = area ? Array.from(area.querySelectorAll<HTMLElement>('.label')) : []
    if (!labels.length) { alert('沒有可列印的標籤'); return }
    let orientation: 'landscape' | 'portrait' = 'landscape'
    try { const saved = localStorage.getItem('shopee_label_settings'); if (saved && JSON.parse(saved).orientation === 'portrait') orientation = 'portrait' } catch {}
    const wMm = orientation === 'portrait' ? 15 : 30
    const hMm = orientation === 'portrait' ? 30 : 15
    // 先同步開分頁，保留使用者手勢、避免被彈窗封鎖
    const win = window.open('', '_blank')
    if (win) win.document.write('<p style="font-family:sans-serif;padding:16px">PDF 產生中…</p>')
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
      const doc = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation })
      for (let i = 0; i < labels.length; i++) {
        const dataUrl = await toPng(labels[i], { pixelRatio: 8, backgroundColor: '#ffffff', style: { border: 'none', margin: '0' } })
        if (i > 0) doc.addPage([wMm, hMm], orientation)
        doc.addImage(dataUrl, 'PNG', 0, 0, wMm, hMm)
      }
      const blobUrl = doc.output('bloburl') as unknown as string
      if (win) win.location.href = blobUrl
      else window.open(blobUrl, '_blank')
    } catch (e) {
      if (win) win.close()
      alert('PDF 產生失敗：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div>
      <button
        onClick={() => { if (window.history.length > 1) router.back(); else router.push('/admin/shopee/orders') }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回蝦皮訂單
      </button>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            蝦皮訂單 {order.shopee_order_number}
            {order.is_manual && <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">手動</span>}
          </h1>
          <p className="text-sm text-gray-500">{formatTW(order.order_date)} · {order.buyer_account || '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPrintModal('detail')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 明細標籤
          </button>
          <button onClick={() => setPrintModal('product')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 商品標籤
          </button>
          <button onClick={() => setPrintModal('receipt')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 收據 10×15
          </button>
          <button onClick={() => setPrintModal('receipt_a5')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 收據 A5
          </button>
          <button onClick={() => setPrintModal('shipping')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> 寄件單
          </button>
          {canSubmitBc && (
            <button onClick={submitBcOrder} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
              <Send className="w-4 h-4" /> 送出 BC 訂單
            </button>
          )}
          {order.is_manual && (
            <button onClick={deleteOrder} className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> 刪除訂單
            </button>
          )}
        </div>
      </div>

      {/* 基本訂單資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">基本訂單資訊{order.is_manual && <span className="ml-2 text-xs text-purple-600 font-normal">（可編輯，離開欄位自動儲存）</span>}</h3>
        {order.is_manual ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <OrderField label="訂單編號" value={order.shopee_order_number} readOnly mono />
            <OrderField label="訂單狀態" value={order.order_status || ''} onSave={v => saveOrderField('order_status', v)} />
            <OrderField label="退貨/退款" value={order.return_status || ''} onSave={v => saveOrderField('return_status', v)} />
            <OrderField label="買家帳號" value={order.buyer_account || ''} onSave={v => saveOrderField('buyer_account', v)} />
            <div>
              <span className="text-gray-500 text-xs">訂單日期：</span>
              <input type="datetime-local" defaultValue={toTWDatetimeLocal(order.order_date)}
                onBlur={e => {
                  if (!e.target.value) { saveOrderField('order_date', null); return }
                  // 使用者輸入為台灣時區，轉回 UTC
                  const d = new Date(e.target.value + ':00+08:00')
                  saveOrderField('order_date', d.toISOString())
                }}
                className="mt-1 w-full px-2 py-1 border border-gray-200 rounded text-xs" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">訂單編號：</span><span className="font-mono">{order.shopee_order_number}</span></div>
            <div><span className="text-gray-500">訂單狀態：</span>{order.order_status || '-'}</div>
            <div><span className="text-gray-500">退貨/退款：</span>{order.return_status || '-'}</div>
            <div><span className="text-gray-500">買家帳號：</span>{order.buyer_account || '-'}</div>
            <div><span className="text-gray-500">訂單日期：</span>{formatTW(order.order_date)}</div>
          </div>
        )}
      </div>

      {/* 收件資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">收件資訊</h3>
        {order.is_manual ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <OrderField label="收件人" value={order.recipient_name || ''} onSave={v => saveOrderField('recipient_name', v)} />
            <OrderField label="電話" value={order.recipient_phone || ''} onSave={v => saveOrderField('recipient_phone', v)} />
            <OrderField label="郵遞區號" value={order.zip_code || ''} onSave={v => saveOrderField('zip_code', v)} />
            <OrderField label="城市" value={order.city || ''} onSave={v => saveOrderField('city', v)} />
            <OrderField label="區域" value={order.district || ''} onSave={v => saveOrderField('district', v)} />
            <OrderField label="地址" value={order.shipping_address || ''} onSave={v => saveOrderField('shipping_address', v)} className="col-span-3" />
            <OrderField label="包裹查詢號碼" value={order.shopee_tracking_code || ''} onSave={v => saveOrderField('shopee_tracking_code', v)} mono className="col-span-2" />
            <OrderField label="取件門市" value={order.pickup_store_id || ''} onSave={v => saveOrderField('pickup_store_id', v)} />
            <OrderField label="寄送方式" value={order.shipping_method || ''} onSave={v => saveOrderField('shipping_method', v)} />
            <OrderField label="出貨方式" value={order.fulfillment_method || ''} onSave={v => saveOrderField('fulfillment_method', v)} />
            <OrderField label="付款方式" value={order.payment_method || ''} onSave={v => saveOrderField('payment_method', v)} />
            <OrderField label="買家備註" value={order.buyer_note || ''} onSave={v => saveOrderField('buyer_note', v)} className="col-span-2" />
            <OrderField label="賣家備註" value={order.seller_note || ''} onSave={v => saveOrderField('seller_note', v)} className="col-span-2" />
          </div>
        ) : (
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
        )}
      </div>

      {/* 收據資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">收據資訊</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 flex-shrink-0">買受人：</span>
            <input value={receiptBuyer} onChange={e => setReceiptBuyer(e.target.value)} placeholder="公司或個人名稱"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 flex-shrink-0">統一編號：</span>
            <input value={receiptTaxId} onChange={e => setReceiptTaxId(e.target.value)} placeholder="統一編號"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm font-mono" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 flex-shrink-0">地址：</span>
            <input value={receiptAddress} onChange={e => setReceiptAddress(e.target.value)} placeholder="公司地址"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm" />
          </div>
        </div>
      </div>

      {/* 金流資訊 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">金流資訊</h3>
        {order.is_manual ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <OrderField label="商品總價" value={String(order.product_total ?? '')} onSave={v => saveOrderField('product_total', v === '' ? null : Number(v))} />
            <OrderField label="買家運費" value={String(order.buyer_shipping_fee ?? '')} onSave={v => saveOrderField('buyer_shipping_fee', v === '' ? null : Number(v))} />
            <OrderField label="蝦皮補運費" value={String(order.shopee_shipping_subsidy ?? '')} onSave={v => saveOrderField('shopee_shipping_subsidy', v === '' ? null : Number(v))} />
            <OrderField label="退貨運費" value={String(order.return_shipping_fee ?? '')} onSave={v => saveOrderField('return_shipping_fee', v === '' ? null : Number(v))} />
            <OrderField label="買家總付" value={String(order.buyer_total_payment ?? '')} onSave={v => saveOrderField('buyer_total_payment', v === '' ? null : Number(v))} />
            <OrderField label="賣家優惠券" value={String(order.seller_coupon ?? '')} onSave={v => saveOrderField('seller_coupon', v === '' ? null : Number(v))} />
            <OrderField label="成交手續費" value={String(order.transaction_fee ?? '')} onSave={v => saveOrderField('transaction_fee', v === '' ? null : Number(v))} />
            <OrderField label="其他服務費" value={String(order.other_service_fee ?? '')} onSave={v => saveOrderField('other_service_fee', v === '' ? null : Number(v))} />
            <OrderField label="金流處理費" value={String(order.payment_processing_fee ?? '')} onSave={v => saveOrderField('payment_processing_fee', v === '' ? null : Number(v))} />
            <OrderField label="處理費率" value={order.payment_processing_rate || ''} onSave={v => saveOrderField('payment_processing_rate', v)} />
          </div>
        ) : (
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
        )}
      </div>

      {/* 金流結算 & 利潤結算 */}
      {(() => {
        const s = settlements.length > 0 ? settlements[0] : null
        // 用金流 Excel 的商品原價，沒有金流時用商品明細活動價合計（因蝦皮商品總價已扣平台優惠券，但蝦皮會補貼回賣家）
        const itemsTotal = items.reduce((sum, i) => sum + ((i.sale_price ?? i.original_price ?? 0) * i.quantity), 0)
        const originalPrice = s?.original_price ?? (itemsTotal > 0 ? itemsTotal : order.product_total ?? 0)
        const sellerCoupon = Math.abs(s?.seller_coupon ?? order.seller_coupon ?? 0)
        const amsFee = Math.abs(s?.ams_fee ?? 0)
        const txFee = Math.abs(s?.transaction_fee ?? order.transaction_fee ?? 0)
        const otherFee = Math.abs(s?.other_service_fee ?? order.other_service_fee ?? 0)
        const processingFee = Math.abs(s?.processing_fee ?? order.payment_processing_fee ?? 0)
        const walletAmount = s?.wallet_amount ?? null
        const platformFees = amsFee + txFee + otherFee + processingFee
        const platformRate = originalPrice > 0 ? ((platformFees / originalPrice) * 100) : 0
        const totalCost = items.reduce((sum, i) => sum + ((i.cost_twd ?? 0) * i.quantity), 0)
        // 預計入帳 = 原價 - 優惠券 - 平台費用
        const expectedAmount = originalPrice - sellerCoupon - platformFees
        // 實際或預計入帳金額
        const displayAmount = walletAmount ?? (totalCost > 0 ? expectedAmount : null)
        const isEstimated = walletAmount === null && displayAmount !== null
        // 毛利率
        const grossMargin = originalPrice > 0 && displayAmount !== null ? ((displayAmount / originalPrice) * 100) : null
        const netProfit = displayAmount !== null ? displayAmount - totalCost : null
        const netRate = originalPrice > 0 && netProfit !== null ? ((netProfit / originalPrice) * 100) : null
        // 金流異常
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
                {order.is_manual ? (
                  <div className="flex items-center justify-between font-semibold">
                    <span>錢包入帳金額：</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">NT$</span>
                      <input type="number" defaultValue={walletAmount ?? ''}
                        onBlur={e => saveSettlementField('wallet_amount', e.target.value === '' ? null : Number(e.target.value))}
                        className="w-28 px-2 py-1 border border-gray-200 rounded text-right text-green-700" />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between font-semibold"><span>錢包入帳金額：</span><span className={walletAmount !== null ? 'text-green-600' : 'text-gray-400'}>NT$ {walletAmount ?? '-'}</span></div>
                )}
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
                <div className="flex justify-between font-semibold">
                  <span>{isEstimated ? '預計入帳金額：' : '錢包入帳金額：'}</span>
                  <span className={displayAmount !== null ? (isEstimated ? 'text-blue-600' : 'text-green-600') : 'text-gray-400'}>
                    {displayAmount !== null ? `NT$ ${Math.round(displayAmount)}` : '-'}{isEstimated && <span className="text-xs font-normal ml-1">(預計)</span>}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{isEstimated ? '預計毛利率：' : '毛利率：'}</span>
                  <span className={grossMargin !== null ? (grossMargin >= 0 ? (isEstimated ? 'text-blue-600' : 'text-green-600') : 'text-red-500') : 'text-gray-400'}>
                    {grossMargin !== null ? `${grossMargin.toFixed(1)}%` : '-'}{isEstimated && grossMargin !== null && <span className="text-xs ml-1">(預計)</span>}
                  </span>
                </div>
                <div className="border-t border-gray-200 my-2" />
                <div className="flex justify-between"><span className="text-gray-500">商品成本：</span><span className={totalCost > 0 ? 'text-gray-700' : 'text-gray-400'}>{totalCost > 0 ? `NT$ ${totalCost}` : '-'}</span></div>
                <div className="flex justify-between font-semibold">
                  <span>{isEstimated ? '預計淨利：' : '淨利：'}</span>
                  <span className={netProfit !== null ? (netProfit >= 0 ? (isEstimated ? 'text-blue-600' : 'text-green-600') : 'text-red-500') : 'text-gray-400'}>
                    {netProfit !== null ? `NT$ ${Math.round(netProfit)}` : '-'}{isEstimated && netProfit !== null && <span className="text-xs font-normal ml-1">(預計)</span>}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>{isEstimated ? '預計淨利率：' : '淨利率：'}</span>
                  <span className={netRate !== null ? (netRate >= 0 ? (isEstimated ? 'text-blue-600' : 'text-green-600') : 'text-red-500') : 'text-gray-400'}>
                    {netRate !== null ? `${netRate.toFixed(1)}%` : '-'}{isEstimated && netRate !== null && <span className="text-xs font-normal ml-1">(預計)</span>}
                  </span>
                </div>
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
                      <div className="flex items-center gap-1">原價：NT${item.is_manual ? (
                        <input type="number" step="1" defaultValue={item.original_price ?? ''} placeholder="-"
                          onBlur={async e => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            if (v === item.original_price) return
                            await fetch(`/api/admin/shopee/orders/${id}`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ item_id: item.id, original_price: v }),
                            }); load()
                          }}
                          className="w-20 px-1.5 py-0.5 border border-gray-200 rounded text-xs" />
                      ) : <span>&nbsp;{item.original_price ?? '-'}</span>}</div>
                      <div className="flex items-center gap-1">活動價：NT${item.is_manual ? (
                        <input type="number" step="1" defaultValue={item.sale_price ?? ''} placeholder="-"
                          onBlur={async e => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            if (v === item.sale_price) return
                            await fetch(`/api/admin/shopee/orders/${id}`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ item_id: item.id, sale_price: v }),
                            }); load()
                          }}
                          className="w-20 px-1.5 py-0.5 border border-gray-200 rounded text-xs" />
                      ) : <span>&nbsp;{item.sale_price ?? '-'}</span>}</div>
                      <div className="col-span-3">商品編碼：<span className="font-mono text-blue-600">{item.shopee_sku_code || '-'}</span></div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1">商品ID：<span className="font-mono">{item.shopee_product_id || '-'}</span></div>
                      <div className="flex items-center gap-1">
                        自訂名稱：
                        {item.shopee_sku_code
                          ? <EditableIdName value={skuProductNameMap.get(item.shopee_sku_code) || ''} onSave={(name) => saveIdMapping('product', item.shopee_sku_code!, name)} placeholder="設定" />
                          : '-'}
                      </div>
                      <div className="flex items-center gap-1">規格ID：<span className="font-mono">{item.shopee_variation_id || '-'}</span></div>
                      <div className="flex items-center gap-1">
                        自訂規格：
                        {item.shopee_variation_id
                          ? <EditableIdName value={variationIdMap.get(item.shopee_variation_id) || ''} onSave={(name) => saveIdMapping('variation', item.shopee_variation_id!, name)} placeholder="設定" />
                          : '-'}
                      </div>
                    </div>
                    {item.bc_sku_id && <div className="mt-2 text-xs text-blue-600">已對應 BC SKU: {bcSkuNameMap.get(item.bc_sku_id) || ''} · {item.bc_sku_id} · copies: {item.matched_copies}</div>}
                    {item.bc_order_id && (
                      <div className="text-xs text-green-600 mt-0.5 flex items-center gap-2">
                        <span>BC 訂單: {item.bc_order_id}{item.bc_sub_order_id && ` · 子訂單: ${item.bc_sub_order_id}`}</span>
                        <button onClick={() => cancelBcOrder(item)} className="text-red-400 hover:text-red-600 text-[10px] border border-red-300 px-1.5 py-0.5 rounded hover:bg-red-50">取消BC訂單</button>
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <span>成本：</span>
                      <span className="text-gray-400">¥</span>
                      <input type="number" step="0.01" defaultValue={item.cost_cny ?? ''} placeholder="-"
                        onBlur={async e => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          if (v === item.cost_cny) return
                          await fetch(`/api/admin/shopee/orders/${id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: item.id, cost_cny: v }),
                          }); load()
                        }}
                        className="w-20 px-1.5 py-0.5 border border-gray-200 rounded text-xs" />
                      {item.cost_twd != null && <span className="text-gray-400">（NT$ {item.cost_twd}）</span>}
                    </div>
                    {item.iccid && item.iccid.length > 0 && item.status !== 'matched' && item.status !== 'iccid_filled' && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.iccid.map((ic, j) => <span key={j} className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">ICCID: {ic}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${st.color}`}>{st.label}</span>
                    {item.is_manual && <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">手動</span>}
                    {!item.bc_order_id ? (
                      <select value={item.delivery_type || 'sim'}
                        onChange={async e => {
                          await fetch(`/api/admin/shopee/orders/${id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: item.id, delivery_type: e.target.value }),
                          }); load()
                        }}
                        className="px-2 py-0.5 text-xs rounded border border-gray-300 bg-white">
                        <option value="sim">SIM</option>
                        <option value="esim">eSIM</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${item.delivery_type === 'esim' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                        {item.delivery_type === 'esim' ? 'eSIM' : 'SIM'}
                      </span>
                    )}
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
                    {!item.bc_order_id && item.quantity > 1 && (
                      <button onClick={() => splitItem(item.id, item.quantity)} title={`拆成 ${item.quantity} 個`}
                        className="p-1 text-gray-400 hover:text-blue-600"><Split className="w-4 h-4" /></button>
                    )}
                    {!item.bc_order_id && (
                      <button onClick={() => deleteItem(item.id)} title="刪除品項"
                        className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    )}
                    {item.bc_sku_id && (
                      <button onClick={() => syncFromBc(item.id)} title="從 BC 撈回訂單資料 (F011)"
                        className="p-1 text-gray-400 hover:text-teal-600"><Download className="w-4 h-4" /></button>
                    )}
                    {item.iccid && item.iccid.length > 0 && (
                      <button onClick={() => openUsage(item.id)} title="查看卡與套餐使用狀況 (F010 + F012)"
                        className="p-1 text-gray-400 hover:text-emerald-600"><Activity className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
                {(item.status === 'matched' || item.status === 'iccid_filled') && item.delivery_type !== 'esim' && <IccidInput item={item} onSave={saveIccid} />}
                {item.delivery_type === 'esim' && item.bc_sku_id && (
                  <EsimManualEdit item={item} orderId={id} onSaved={load} />
                )}
              </div>
            )
          })}
          {addingItem ? (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-sm font-medium text-purple-700 mb-2">新增手動品項</div>
              <div className="flex items-center gap-4 mb-3 text-sm">
                <span className="text-gray-600">類型：</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" checked={manualDeliveryType === 'sim'} onChange={() => setManualDeliveryType('sim')} />
                  <span>SIM（實體卡，需 ICCID）</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" checked={manualDeliveryType === 'esim'} onChange={() => setManualDeliveryType('esim')} />
                  <span>eSIM（不需 ICCID，透過 N009 通知）</span>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="商品名稱（會顯示於收據）"
                  className="md:col-span-6 px-3 py-1.5 border border-gray-200 rounded text-sm" />
                <input value={manualVariation} onChange={e => setManualVariation(e.target.value)} placeholder="選項名 / 規格（會顯示於收據）"
                  className="md:col-span-6 px-3 py-1.5 border border-gray-200 rounded text-sm" />
                <input value={manualQty} onChange={e => setManualQty(e.target.value)} placeholder="數量" type="number" min="1"
                  className="md:col-span-2 px-3 py-1.5 border border-gray-200 rounded text-sm" />
                <input value={manualPrice} onChange={e => setManualPrice(e.target.value)} placeholder="單價" type="number" min="0"
                  className="md:col-span-2 px-3 py-1.5 border border-gray-200 rounded text-sm" />
                <div className="md:col-span-8 flex gap-2 justify-end">
                  <button onClick={async () => {
                    const ok = await addManualItem({ name: manualName, variation: manualVariation, quantity: Number(manualQty) || 1, price: Number(manualPrice) || 0, delivery_type: manualDeliveryType })
                    if (ok) { setAddingItem(false); setManualName(''); setManualVariation(''); setManualQty('1'); setManualPrice('0'); setManualDeliveryType('sim') }
                  }} className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700">加入</button>
                  <button onClick={() => { setAddingItem(false); setManualName(''); setManualVariation(''); setManualQty('1'); setManualPrice('0'); setManualDeliveryType('sim') }}
                    className="px-4 py-1.5 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200">取消</button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">商品名稱與選項名會直接作為收據上的「自訂名稱」與「自訂規格」。加入後需點「對應」選擇 BC SKU，才能送 BC 訂單。</div>
            </div>
          ) : (
            <button onClick={() => setAddingItem(true)}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> 新增手動品項
            </button>
          )}
        </div>
      </div>

      {/* 列印彈窗 */}
      {printModal && order && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">{printModal === 'detail' ? '明細標籤預覽' : printModal === 'product' ? '商品標籤預覽' : printModal === 'receipt_a5' ? '收據預覽（A5）' : printModal === 'shipping' ? '寄件單預覽（10×15）' : '收據預覽（10×15）'}</h2>
              <div className="flex items-center gap-2">
                <button onClick={async () => {
                  if (printModal === 'product') { await printProductLabelsPdf(); return }
                  const el = document.getElementById('print-area')
                  if (!el) { alert('找不到列印內容'); return }
                  const w = window.open('', '', `width=${screen.width},height=${screen.height}`)
                  if (!w) { alert('彈出視窗被瀏覽器封鎖，請允許此網站開啟彈出視窗後再試'); return }
                  if (printModal === 'receipt' || printModal === 'receipt_a5') {
                    const pageSize = printModal === 'receipt_a5' ? 'A5' : '100mm 150mm'
                    w.document.write(`<html><head><title>收據</title><style>
                      @page{size:${pageSize};margin:0}
                      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
                      html,body{margin:0;padding:0;font-family:'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif}
                      img{display:block;margin:0 auto}
                      .receipt-root{border:none!important}
                      table,tr,td,th,div{page-break-inside:avoid}
                    </style></head><body>${el.innerHTML}</body></html>`)
                    w.document.close()
                    // 等 document 完全載入再列印（雷射印表機對時機敏感）
                    const doPrint = () => { try { w.focus(); w.print(); setTimeout(() => w.close(), 500) } catch {} }
                    if (w.document.readyState === 'complete') {
                      setTimeout(doPrint, 150)
                    } else {
                      w.addEventListener('load', () => setTimeout(doPrint, 150))
                    }
                    return
                  } else if (printModal === 'shipping') {
                    w.document.write(`<html><head><style>
                      @page{size:100mm 150mm;margin:0}
                      html,body{margin:0;padding:0;font-family:'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif}
                      .shipping-root{border:none!important}
                    </style></head><body>${el.innerHTML}</body></html>`)
                  } else {
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
                  <div style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>蝦皮訂單：{order.shopee_order_number}</span>
                    {order.shopee_account_id && <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>{accountMap.get(order.shopee_account_id) || '-'}</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666', marginBottom: '3mm' }}>日期：{formatTW(order.order_date)}</div>
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
              ) : printModal === 'product' ? (
                /* 商品標籤 30mm × 15mm — 每標籤獨立一頁，頁面尺寸即標籤尺寸 */
                <div style={{ display: 'block', textAlign: 'center' }}>
                  {(() => {
                    let ls: { line1: number; line2: number; line3: number; orientation?: 'landscape' | 'portrait' } = { line1: 12, line2: 12, line3: 10 }
                    try { const saved = localStorage.getItem('shopee_label_settings'); if (saved) ls = JSON.parse(saved) } catch { }
                    const isPortrait = ls.orientation === 'portrait'
                    const w = isPortrait ? '15mm' : '30mm'
                    const h = isPortrait ? '30mm' : '15mm'
                    const expiry = localStorage.getItem('shopee_expiry_date') || ''
                    return items.flatMap(item =>
                      Array.from({ length: item.quantity }, (_, j) => (
                        <div key={`${item.id}-${j}`} className="label"
                          style={{ width: w, height: h, border: '1px solid #ccc', padding: '1mm 2mm', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxSizing: 'border-box', overflow: 'hidden', margin: '0 auto 4mm' }}>
                          <div style={{ fontSize: `${ls.line1}px`, fontWeight: 'bold', lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {skuProductNameMap.get(item.shopee_sku_code || '') || item.shopee_product_name}
                          </div>
                          <div style={{ fontSize: `${ls.line2}px`, lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {variationIdMap.get(item.shopee_variation_id || '') || item.shopee_variation_name}
                          </div>
                          {expiry && (
                            <div style={{ fontSize: `${ls.line3}px`, lineHeight: 1.1, whiteSpace: 'nowrap' }}>使用期限：{expiry.replace(/-/g, '/')}</div>
                          )}
                        </div>
                      ))
                    )
                  })()}
                </div>
              ) : printModal === 'shipping' ? (
                /* 寄件單 100mm × 150mm — 直書（右至左、字正寫） */
                <ShippingLabel order={order} />
              ) : (
                /* 收據 */
                <ReceiptTemplate order={order} items={items} skuProductNameMap={skuProductNameMap} variationIdMap={variationIdMap}
                  buyerName={receiptBuyer} taxId={receiptTaxId} address={receiptAddress}
                  size={printModal === 'receipt_a5' ? 'a5' : 'small'} />
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

      {/* 卡 + 套餐使用狀況彈窗 */}
      {usageModal && (
        <CardUsageModal modal={usageModal} onClose={() => setUsageModal(null)} />
      )}

    </div>
  )
}

// 卡 + 套餐使用狀況彈窗（F010 + F012）
interface DailyTrafficItem { usedDate: string; type: string; usedAmount: string; country: string; countryRegionCode: string }
interface DailyTrafficResult { loading: boolean; items?: DailyTrafficItem[]; error?: string; beginDate?: string; endDate?: string }

function CardUsageModal({ modal, onClose }: { modal: { itemId: string; loading: boolean; data: CardUsageResp | null; error: string | null }; onClose: () => void }) {
  const PLAN_STATUS_LABEL: Record<string, string> = {
    '0': '未使用', '1': '使用中', '2': '已用完', '3': '已過期', '4': '已退訂',
  }
  const CARD_STATUS_LABEL: Record<string, string> = {
    '0': '載體有效', '1': '載體無效', '2': '已停用',
  }

  const [trafficByIccid, setTrafficByIccid] = useState<Record<string, DailyTrafficResult>>({})

  async function loadDailyTraffic(iccid: string, expirationDate?: string) {
    setTrafficByIccid(prev => ({ ...prev, [iccid]: { loading: true } }))
    try {
      const params = new URLSearchParams({ iccid })
      // 從截止日往前推 30 天（含當天 → 共 30 天區間）
      if (expirationDate) {
        const endStr = expirationDate.slice(0, 10) // "2026-05-23 00:00:00" → "2026-05-23"
        const end = new Date(endStr + 'T00:00:00Z')
        const begin = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000)
        const fmt = (d: Date) => d.toISOString().slice(0, 10)
        params.set('end_date', fmt(end))
        params.set('begin_date', fmt(begin))
      }
      const res = await fetch(`/api/admin/cards/daily-traffic?${params}`)
      const d = await res.json()
      if (!res.ok) {
        setTrafficByIccid(prev => ({ ...prev, [iccid]: { loading: false, error: d.error || '查詢失敗' } }))
        return
      }
      setTrafficByIccid(prev => ({ ...prev, [iccid]: { loading: false, items: d.items || [], beginDate: d.beginDate, endDate: d.endDate } }))
    } catch (err) {
      setTrafficByIccid(prev => ({ ...prev, [iccid]: { loading: false, error: err instanceof Error ? err.message : String(err) } }))
    }
  }

  function fmtTraffic(s?: string | null) {
    if (s == null || s === '') return '—'
    const n = Number(s)
    if (isNaN(n)) return s
    if (n < 0) return '不限'
    if (n >= 1024) return (n / 1024).toFixed(2) + ' GB'
    return n + ' MB'
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold">卡與套餐使用狀況</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 text-sm">
          {modal.loading && <div className="text-gray-500">查詢中…（同時打 F010 + F012，每張 ICCID 一次 F012）</div>}
          {modal.error && <div className="text-red-600">{modal.error}</div>}
          {modal.data && (
            <>
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">F010 載體有效期</h4>
                {modal.data.cardError && <div className="text-red-600 text-xs mb-1">{modal.data.cardError}</div>}
                <table className="w-full text-xs border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left border-b">ICCID</th>
                      <th className="px-2 py-1.5 text-left border-b">類型</th>
                      <th className="px-2 py-1.5 text-left border-b">載體狀態</th>
                      <th className="px-2 py-1.5 text-left border-b">截止日</th>
                      <th className="px-2 py-1.5 text-left border-b">已用次數</th>
                      <th className="px-2 py-1.5 text-left border-b">日流量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.data.cardExpiry.length === 0 && (
                      <tr><td colSpan={6} className="px-2 py-2 text-gray-400 text-center">無資料</td></tr>
                    )}
                    {modal.data.cardExpiry.map((c, i) => {
                      const tr = trafficByIccid[c.iccid]
                      return (
                        <Fragment key={i}>
                          <tr className="border-b">
                            <td className="px-2 py-1.5 font-mono">{c.iccid}</td>
                            <td className="px-2 py-1.5">{c.type || '—'}</td>
                            <td className="px-2 py-1.5">{CARD_STATUS_LABEL[c.status || ''] || c.status || '—'}</td>
                            <td className="px-2 py-1.5">{c.expirationDate || '—'}</td>
                            <td className="px-2 py-1.5">{c.usageCount || '—'}</td>
                            <td className="px-2 py-1.5">
                              <button onClick={() => loadDailyTraffic(c.iccid, c.expirationDate)} disabled={tr?.loading}
                                className="px-2 py-0.5 text-[11px] border border-blue-300 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50">
                                {tr?.loading ? '查詢中…' : tr ? '重新查詢' : '查流量 (F023)'}
                              </button>
                            </td>
                          </tr>
                          {tr && !tr.loading && (
                            <tr className="bg-gray-50">
                              <td colSpan={6} className="px-3 py-2">
                                {tr.error && <div className="text-red-500 text-xs">{tr.error}</div>}
                                {tr.items && tr.items.length === 0 && <div className="text-gray-400 text-xs">查詢期間 {tr.beginDate} ~ {tr.endDate} 無流量紀錄</div>}
                                {tr.items && tr.items.length > 0 && (
                                  <div>
                                    <div className="text-[11px] text-gray-500 mb-1">期間 {tr.beginDate} ~ {tr.endDate} · 共 {tr.items.length} 筆 · 合計 {fmtTraffic(String(tr.items.reduce((s, it) => s + (Number(it.usedAmount) || 0), 0)))}</div>
                                    <table className="w-full text-[11px] border border-gray-200">
                                      <thead className="bg-white">
                                        <tr>
                                          <th className="px-2 py-1 text-left border-b">日期</th>
                                          <th className="px-2 py-1 text-left border-b">國家</th>
                                          <th className="px-2 py-1 text-left border-b">用量</th>
                                          <th className="px-2 py-1 text-left border-b">類型</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tr.items.map((it, j) => (
                                          <tr key={j} className="border-b">
                                            <td className="px-2 py-1 font-mono">{it.usedDate}</td>
                                            <td className="px-2 py-1">{it.country || it.countryRegionCode || '—'}</td>
                                            <td className="px-2 py-1">{fmtTraffic(it.usedAmount)}</td>
                                            <td className="px-2 py-1">{it.type || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">F012 套餐使用</h4>
                <table className="w-full text-xs border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left border-b">套餐名稱</th>
                      <th className="px-2 py-1.5 text-left border-b">ICCID</th>
                      <th className="px-2 py-1.5 text-left border-b">APN</th>
                      <th className="px-2 py-1.5 text-left border-b">狀態</th>
                      <th className="px-2 py-1.5 text-left border-b">激活時間</th>
                      <th className="px-2 py-1.5 text-left border-b">結束時間</th>
                      <th className="px-2 py-1.5 text-left border-b">剩餘天數</th>
                      <th className="px-2 py-1.5 text-left border-b">總流量</th>
                      <th className="px-2 py-1.5 text-left border-b">剩餘流量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows: { iccid: string; sub?: PlanUsageSub; error?: string }[] = []
                      for (const p of modal.data.planUsage) {
                        if (!p.ok) {
                          rows.push({ iccid: p.iccid, error: p.error })
                          continue
                        }
                        const subs = (p.data || []).flatMap(o => o.subOrderList || [])
                        if (subs.length === 0) {
                          rows.push({ iccid: p.iccid })
                        } else {
                          for (const s of subs) rows.push({ iccid: p.iccid, sub: s })
                        }
                      }
                      if (rows.length === 0) {
                        return <tr><td colSpan={9} className="px-2 py-2 text-gray-400 text-center">無套餐記錄</td></tr>
                      }
                      const fmtApn = (cs?: PlanUsageCountry[]) => {
                        if (!cs || cs.length === 0) return '—'
                        return cs.map(c => {
                          const apn = c.apn || '—'
                          const op = c.operator ? ` (${c.operator})` : ''
                          return `${apn}${op}`
                        }).join(', ')
                      }
                      return rows.map((r, j) => {
                        if (r.error) return (
                          <tr key={j} className="border-b">
                            <td className="px-2 py-1.5 text-red-600" colSpan={1}>—</td>
                            <td className="px-2 py-1.5 font-mono">{r.iccid}</td>
                            <td className="px-2 py-1.5 text-red-600" colSpan={7}>{r.error}</td>
                          </tr>
                        )
                        const s = r.sub
                        if (!s) return (
                          <tr key={j} className="border-b">
                            <td className="px-2 py-1.5 text-gray-400">無套餐</td>
                            <td className="px-2 py-1.5 font-mono">{r.iccid}</td>
                            <td className="px-2 py-1.5 text-gray-400" colSpan={7}>—</td>
                          </tr>
                        )
                        return (
                          <tr key={j} className="border-b">
                            <td className="px-2 py-1.5">{s.skuName || '—'}{s.copies ? ` ×${s.copies}` : ''}</td>
                            <td className="px-2 py-1.5 font-mono">{r.iccid}</td>
                            <td className="px-2 py-1.5 font-mono text-xs" title={(s.country || []).map(c => `${c.name || c.mcc || ''}: ${c.apn || '—'}${c.operator ? ' / ' + c.operator : ''}${c.apnUsername ? ' / user=' + c.apnUsername : ''}${c.apnPassword ? ' / pwd=' + c.apnPassword : ''}`).join('\n') || ''}>{fmtApn(s.country)}</td>
                            <td className="px-2 py-1.5">{PLAN_STATUS_LABEL[s.planStatus || ''] || s.planStatus || '—'}</td>
                            <td className="px-2 py-1.5">{s.planStartTime || '—'}</td>
                            <td className="px-2 py-1.5">{s.planEndTime || '—'}</td>
                            <td className="px-2 py-1.5">{s.remainingDays != null ? `${s.remainingDays}/${s.totalDays || '—'}` : '—'}</td>
                            <td className="px-2 py-1.5">{fmtTraffic(s.totalTraffic)}</td>
                            <td className="px-2 py-1.5">{fmtTraffic(s.remainingTraffic)}</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// 行內可編輯的 ID 對應名稱
// ── 收據模板（A5 橫式）──────────────────────────
function numberToChinese(n: number): string {
  const digits = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '萬', '億']
  if (n === 0) return '零'
  const str = Math.floor(n).toString()
  let result = ''
  const len = str.length
  for (let i = 0; i < len; i++) {
    const d = parseInt(str[i])
    const pos = len - 1 - i
    const unitIdx = pos % 4
    const bigIdx = Math.floor(pos / 4)
    if (d !== 0) {
      result += digits[d] + units[unitIdx]
      if (unitIdx === 0 && bigIdx > 0) result += bigUnits[bigIdx]
    } else {
      if (!result.endsWith('零') && i < len - 1) result += '零'
    }
  }
  result = result.replace(/零+$/, '')
  return result + '元整'
}

function ShippingLabel({ order }: { order: ShopeeOrder }) {
  // 從 localStorage 讀寄件人預設（在訂單列表的「標籤 / 收據設定」可設定）
  let sender = { name: '', tax_id: '', phone: '', zip_city: '', address: '', contents: '文件', undeliverable: '退回寄件人' }
  try {
    const saved = localStorage.getItem('shopee_sender_info')
    if (saved) sender = { ...sender, ...JSON.parse(saved) }
  } catch {}
  const recipientLine1 = `${order.zip_code || ''}${order.city || ''}${order.district || ''}`.trim()
  const recipientLine2 = order.shipping_address || ''

  const headerStyle: React.CSSProperties = { fontSize: '18pt', fontWeight: 700, marginBottom: '2mm' }
  const bodyLineStyle: React.CSSProperties = { fontSize: '14pt', lineHeight: '1.45', whiteSpace: 'pre-line', fontWeight: 400 }

  // 整體轉 90°：外框 100×150 紙張不變、內容按 150×100 排版然後旋轉 90° 填回外框
  return (
    <div className="shipping-root" style={{ width: '100mm', height: '150mm', border: '1px solid #ccc', margin: '0 auto', boxSizing: 'border-box', overflow: 'hidden', position: 'relative' }}>
    <div style={{ width: '150mm', height: '100mm', padding: '5mm 6mm', boxSizing: 'border-box', fontFamily: '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif', transformOrigin: 'top left', transform: 'translate(100mm, 0) rotate(90deg)', position: 'absolute', top: 0, left: 0 }}>
      {/* 寄件人（整段縮 5mm） */}
      <div style={{ marginBottom: '3mm', paddingLeft: '5mm' }}>
        <div style={headerStyle}>寄件人</div>
        {(sender.zip_city || sender.address) && <div style={bodyLineStyle}>{sender.zip_city}{sender.address}</div>}
        {sender.tax_id && <div style={bodyLineStyle}>統編：{sender.tax_id}</div>}
        {sender.name && <div style={bodyLineStyle}>{sender.name}</div>}
        {sender.phone && <div style={bodyLineStyle}>{sender.phone}</div>}
      </div>
      {/* 收件人（header 縮 40mm + 黑點；body 再縮 10mm = 50mm） */}
      <div style={{ marginBottom: '3mm', paddingLeft: '40mm' }}>
        <div style={headerStyle}><span style={{ fontSize: '18pt', marginRight: '2mm' }}>●</span>收件人</div>
        {recipientLine1 && <div style={{ ...bodyLineStyle, paddingLeft: '10mm' }}>{recipientLine1}</div>}
        {recipientLine2 && <div style={{ ...bodyLineStyle, paddingLeft: '10mm' }}>{recipientLine2}</div>}
        {(order.recipient_name || order.recipient_phone) && (
          <div style={{ ...bodyLineStyle, paddingLeft: '10mm' }}>
            {order.recipient_name || ''}{order.recipient_name && order.recipient_phone ? '  ' : ''}{order.recipient_phone || ''}
          </div>
        )}
      </div>
      {/* 內裝物品 / 處理方式（整段縮 5mm，字體跟 body 一致） */}
      <div style={{ fontSize: '14pt', lineHeight: '1.45', paddingLeft: '5mm', fontWeight: 400 }}>
        <div>內裝物品：{sender.contents}</div>
        <div>無法投遞處理方式：{sender.undeliverable}</div>
      </div>
    </div>
    </div>
  )
}

function ReceiptTemplate({ order, items, skuProductNameMap, variationIdMap, buyerName, taxId, address, size = 'small' }: {
  order: ShopeeOrder; items: ShopeeItem[]
  skuProductNameMap: Map<string, string>; variationIdMap: Map<string, string>
  buyerName: string; taxId: string; address: string
  size?: 'small' | 'a5'
}) {
  const date = order.order_date ? new Date(order.order_date) : new Date()
  // 用台灣時區取得年月日
  const twParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const twYear = Number(twParts.find(p => p.type === 'year')?.value || date.getFullYear())
  const twMonth = twParts.find(p => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0')
  const twDay = twParts.find(p => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0')
  const rocYear = twYear - 1911
  const dateStr = `中華民國 ${rocYear} 年 ${twMonth} 月 ${twDay} 日`
  const total = items.reduce((sum, i) => sum + ((i.sale_price ?? i.original_price ?? 0) * i.quantity), 0)
  const stampUrl = typeof window !== 'undefined' ? localStorage.getItem('receipt_stamp_url') || '' : ''
  const s = { fontFamily: "'Microsoft JhengHei',sans-serif" }

  const isA5 = size === 'a5'
  const compact = !isA5 && items.length > 2
  const z = isA5 ? {
    line: { borderBottom: '1px solid #000', marginBottom: '4mm', paddingBottom: '4mm' },
    pad: '14mm 14mm',
    title: '36px',
    titleSp: '12px',
    titleMb: '3mm',
    base: '16px',
    dateFs: '16px',
    mb1: '2mm',
    mb2: '4mm',
    dateMb: '6mm',
    tblFs: '15px',
    cellPad: '3mm 4mm',
    totalFs: '22px',
    chineseFs: '20px',
    totalMt: '4mm',
    legalFs: '14px',
    legalLh: 1.8,
    stampLabelMb: '5mm',
    stampMt: '6mm',
    stampW: '60mm',
    stampPadTop: '2.5mm 3mm',
    stampMidPad: '2mm 3mm',
    stampFs: '16px',
    stampSideFs: '15px',
    stampTitleFs: '15px',
    stampSubFs: '13px',
    stampNumFs: '26px',
    stampImg: '160px',
  } : {
    line: { borderBottom: '1px solid #000', marginBottom: compact ? '1.5mm' : '2mm', paddingBottom: compact ? '1.5mm' : '2mm' },
    pad: compact ? '3mm 4mm' : '5mm',
    title: compact ? '16px' : '20px',
    titleSp: compact ? '4px' : '6px',
    titleMb: compact ? '0.5mm' : '1mm',
    base: compact ? '10px' : '12px',
    dateFs: compact ? '10px' : '12px',
    mb1: compact ? '0.5mm' : '1mm',
    mb2: compact ? '1mm' : '2mm',
    dateMb: compact ? '2mm' : '3mm',
    tblFs: compact ? '9px' : '10px',
    cellPad: compact ? '0.8mm 1.5mm' : '1.5mm 2mm',
    totalFs: compact ? '12px' : '14px',
    chineseFs: compact ? '11px' : '14px',
    totalMt: compact ? '1mm' : '2mm',
    legalFs: compact ? '9px' : '12px',
    legalLh: compact ? 1.4 : 1.6,
    stampLabelMb: compact ? '1.5mm' : '3mm',
    stampMt: compact ? '1.5mm' : '3mm',
    stampW: compact ? '42mm' : '46mm',
    stampPadTop: compact ? '0.8mm 2mm' : '1.5mm 2mm',
    stampMidPad: compact ? '0.5mm 2mm' : '1mm 2mm',
    stampFs: compact ? '10px' : '12px',
    stampSideFs: compact ? '9px' : '11px',
    stampTitleFs: compact ? '10px' : '11px',
    stampSubFs: compact ? '8px' : '9px',
    stampNumFs: compact ? '15px' : '17px',
    stampImg: compact ? '80px' : '100px',
  }

  return (
    <div className="receipt-root" style={{ ...s, width: isA5 ? '148mm' : '100mm', minHeight: isA5 ? '210mm' : '150mm', padding: z.pad, fontSize: z.base, border: '1px solid #ccc', margin: '0 auto' }}>
      <div style={{ fontSize: z.title, fontWeight: 'bold', textAlign: 'center', marginBottom: z.titleMb, letterSpacing: z.titleSp }}>
        國際電話卡收據
      </div>
      <div style={{ fontSize: z.dateFs, textAlign: 'center', color: '#000', marginBottom: z.dateMb }}>{dateStr}</div>

      <div style={{ fontSize: z.base, marginBottom: z.mb1 }}>買　受　人：{buyerName || ''}</div>
      <div style={{ fontSize: z.base, marginBottom: z.mb1 }}>統 一 編 號：{taxId || ''}</div>
      <div style={{ ...z.line, display: 'flex', justifyContent: 'space-between', fontSize: z.base }}>
        <span>地　　　址：{address || ''}</span>
        <span style={{ fontFamily: 'monospace', fontSize: z.base }}>{order.shopee_order_number}</span>
      </div>

      <div style={{ fontSize: z.base, marginBottom: z.mb2 }}>商品明細：</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: z.mb2, fontSize: z.tblFs }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'center', fontSize: z.tblFs }}>商品名稱</th>
            <th style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'center', fontSize: z.tblFs, width: compact ? '14mm' : '15mm' }}>單價</th>
            <th style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'center', fontSize: z.tblFs, width: compact ? '10mm' : '12mm' }}>數量</th>
            <th style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'center', fontSize: z.tblFs, width: compact ? '17mm' : '18mm' }}>金額</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const name = skuProductNameMap.get(item.shopee_sku_code || '') || (item.is_manual ? (item.shopee_product_name || '') : '')
            const spec = variationIdMap.get(item.shopee_variation_id || '') || (item.is_manual ? (item.shopee_variation_name || '') : '')
            const price = item.sale_price ?? item.original_price ?? 0
            const amount = price * item.quantity
            return (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: z.cellPad, fontSize: z.tblFs }}>
                  <div style={{ fontSize: z.tblFs }}>{name}</div>
                  <div style={{ fontSize: z.tblFs, color: '#000' }}>{spec}</div>
                </td>
                <td style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'right', fontSize: z.tblFs }}>${price}</td>
                <td style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'center', fontSize: z.tblFs }}>{item.quantity}</td>
                <td style={{ border: '1px solid #000', padding: z.cellPad, textAlign: 'right', fontSize: z.tblFs }}>${amount.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 總金額 */}
      <div style={{ marginTop: z.totalMt, textAlign: 'right', fontSize: z.totalFs }}>
        總金額：NT$ {total.toLocaleString()}
      </div>
      <div style={{ ...z.line, fontSize: z.chineseFs, textAlign: 'right' }}>
        總計{numberToChinese(total)}
      </div>

      {/* 法規文字 */}
      <div style={{ ...z.line, fontSize: z.legalFs, color: '#000', lineHeight: z.legalLh }}>
        本收據依據財政部88年9月14日台財稅第881943611號函核准使用，由銷售人自行印製，不另開立統一發票。<br />
        因國際電話卡適用零稅率，本收據不得作為申報扣抵銷項稅額之憑證。
      </div>

      {/* 印章 */}
      <div style={{ textAlign: 'center', marginTop: z.stampMt }}>
        <div style={{ fontSize: z.base, color: '#000', marginBottom: z.stampLabelMb }}>營業人蓋用統一發票專用章</div>
        {stampUrl ? (
          <img src={stampUrl} alt="印章" style={{ maxHeight: z.stampImg, display: 'block', margin: '0 auto' }} />
        ) : (
          <table style={{ display: 'inline-table', borderCollapse: 'collapse', border: '2px solid #000', color: '#000', fontFamily: "'Microsoft JhengHei',sans-serif", width: z.stampW }}>
            <tbody>
              <tr>
                <td colSpan={3} style={{ borderBottom: '1.5px solid #000', padding: z.stampPadTop, textAlign: 'center', fontSize: z.stampFs, letterSpacing: '0.5px' }}>
                  飛訊移動科技有限公司
                </td>
              </tr>
              <tr>
                <td rowSpan={4} style={{ padding: z.stampMidPad, textAlign: 'center', fontSize: z.stampSideFs, lineHeight: '1.3', borderRight: '1.5px solid #000', width: compact ? '5mm' : '6mm' }}>
                  桃<br />園<br />市
                </td>
                <td style={{ padding: `${compact ? '0.5mm' : '1mm'} 2mm 0`, textAlign: 'center', fontSize: z.stampTitleFs, letterSpacing: '1px', whiteSpace: 'nowrap' }}>統一發票專用章</td>
                <td rowSpan={4} style={{ padding: z.stampMidPad, textAlign: 'center', fontSize: z.stampSideFs, lineHeight: '1.3', borderLeft: '1.5px solid #000', width: compact ? '5mm' : '6mm' }}>
                  蘆<br />竹<br />區
                </td>
              </tr>
              <tr>
                <td style={{ padding: '0 2mm', textAlign: 'center', fontSize: z.stampSubFs, letterSpacing: '0.5px' }}>(電子收據專用)</td>
              </tr>
              <tr>
                <td style={{ padding: '0 2mm', textAlign: 'center', fontSize: z.stampTitleFs, letterSpacing: '1px' }}>統一編號</td>
              </tr>
              <tr>
                <td style={{ padding: z.stampMidPad, textAlign: 'center', fontSize: z.stampNumFs, fontWeight: 'bold', letterSpacing: '0.5px' }}>60636261</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ borderTop: '1.5px solid #000', padding: z.stampPadTop, textAlign: 'center', fontSize: z.stampFs, letterSpacing: '0.5px' }}>
                  南崁路265號6樓之6
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function OrderField({ label, value, onSave, readOnly, mono, className }: {
  label: string
  value: string
  onSave?: (v: string) => void
  readOnly?: boolean
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <span className="text-gray-500 text-xs">{label}：</span>
      <input
        defaultValue={value}
        readOnly={readOnly}
        onBlur={e => !readOnly && onSave && e.target.value !== value && onSave(e.target.value)}
        className={`mt-1 w-full px-2 py-1 border border-gray-200 rounded text-xs ${mono ? 'font-mono' : ''} ${readOnly ? 'bg-gray-50 text-gray-600' : ''}`}
      />
    </div>
  )
}

function EsimManualEdit({ item, orderId, onSaved }: { item: ShopeeItem; orderId: string; onSaved: () => void }) {
  const qty = item.quantity || 1
  const [editing, setEditing] = useState(false)
  const buildEntries = () => Array.from({ length: qty }, (_, i) => i === 0
    ? { lpa: item.lpa_code || '', iccid: (item.iccid && item.iccid[0]) || '', qr: item.qr_code_url || '' }
    : { lpa: '', iccid: '', qr: '' }
  )
  const [entries, setEntries] = useState(buildEntries)
  const [busy, setBusy] = useState(false)

  // 進入編輯時依當下 qty 重新初始化
  function startEditing() {
    setEntries(buildEntries())
    setEditing(true)
  }

  const hasData = item.qr_code_url || item.lpa_code
  const isMulti = qty > 1

  function updateEntry(idx: number, field: 'lpa' | 'iccid' | 'qr', value: string) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  async function save() {
    const cleaned = entries.map(e => ({ lpa_code: e.lpa.trim(), qr_code_url: e.qr.trim(), iccid: e.iccid.trim() }))
    if (!cleaned.some(c => c.lpa_code || c.iccid || c.qr_code_url)) { alert('請至少填寫一筆'); return }

    setBusy(true)
    try {
      if (isMulti) {
        // qty>1 走 fill-esims（會拆單）
        const res = await fetch(`/api/admin/shopee/orders/${orderId}/items/${item.id}/fill-esims`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: cleaned }),
        })
        const data = await res.json()
        if (!res.ok) { alert(data.error || '儲存失敗'); return }
      } else {
        // qty=1 直接 PATCH
        const c = cleaned[0]
        const hasContent = !!(c.lpa_code || c.iccid || c.qr_code_url)
        await fetch(`/api/admin/shopee/orders/${orderId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: item.id,
            lpa_code: c.lpa_code || null,
            qr_code_url: c.qr_code_url || null,
            iccid: c.iccid ? [c.iccid] : null,
            ...(hasContent && !item.bc_order_id ? { status: 'bc_ordered' } : {}),
          }),
        })
      }
      setEditing(false)
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 text-xs">
      {hasData && !editing ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-indigo-700 font-medium">eSIM 已就緒</span>
            {item.iccid && item.iccid[0] && (
              <a href={`/eSIM/Install/${item.iccid[0]}`} target="_blank" rel="noreferrer"
                className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[11px] hover:bg-indigo-700">📱 用戶安裝頁</a>
            )}
            <button onClick={startEditing} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] hover:bg-gray-200">✏️ 編輯</button>
          </div>
          {item.qr_code_url && <div>QR Code：<a href={item.qr_code_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{item.qr_code_url}</a></div>}
          {item.lpa_code && <div>LPA：<span className="font-mono break-all">{item.lpa_code}</span></div>}
          {item.iccid && item.iccid.length > 0 && <div>ICCID：{item.iccid.map((ic, j) => <span key={j} className="font-mono bg-gray-100 px-1.5 py-0.5 rounded ml-1">{ic}</span>)}</div>}
        </div>
      ) : editing || !hasData ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">
              {hasData ? '編輯 eSIM 資料' : '手動填寫 eSIM 資料'}
              {isMulti && <span className="text-purple-600 ml-1">（共 {qty} 張，儲存後會自動拆成 {qty} 個品項）</span>}
            </span>
            {hasData && <button onClick={() => setEditing(false)}
              className="text-gray-400 hover:text-gray-600">取消</button>}
          </div>
          <div className="space-y-3">
            {entries.map((e, idx) => (
              <div key={idx} className="border border-gray-200 rounded p-2 bg-gray-50">
                {isMulti && <div className="text-[11px] text-purple-600 font-medium mb-1.5">eSIM #{idx + 1}</div>}
                <div className="space-y-1.5">
                  <div>
                    <label className="text-[11px] text-gray-500">LPA Code</label>
                    <input value={e.lpa} onChange={ev => updateEntry(idx, 'lpa', ev.target.value)} placeholder="LPA:1$..."
                      className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded font-mono text-[11px]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-500">ICCID</label>
                      <input value={e.iccid} onChange={ev => updateEntry(idx, 'iccid', ev.target.value)} placeholder="89..."
                        className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded font-mono text-[11px]" />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500">QR Code URL（選填）</label>
                      <input value={e.qr} onChange={ev => updateEntry(idx, 'qr', ev.target.value)} placeholder="https://..."
                        className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded font-mono text-[11px]" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={busy}
              className="px-3 py-1 bg-indigo-600 text-white rounded text-[11px] hover:bg-indigo-700 disabled:opacity-50">
              {busy ? '儲存中⋯' : '儲存'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

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
  const dbText = (item.iccid || []).filter(Boolean).join('\n')
  const [text, setText] = useState(dbText)
  const [startIccid, setStartIccid] = useState('')
  const [endIccid, setEndIccid] = useState('')
  // 當 DB 的 iccid 改變（例如重新對應後 reload），同步覆蓋到輸入框
  useEffect(() => { setText(dbText) }, [dbText])
  const lines = [...new Set(text.split(/[\n,]/).map(s => s.trim()).filter(Boolean))]

  function generateRange() {
    if (!startIccid.trim() || !endIccid.trim()) return
    const startMatch = startIccid.trim().match(/^(.*?)(\d+)$/)
    const endMatch = endIccid.trim().match(/^(.*?)(\d+)$/)
    if (!startMatch || !endMatch) return
    const prefix = startMatch[1]
    const startNum = parseInt(startMatch[2])
    const endNum = parseInt(endMatch[2])
    if (endNum < startNum) return
    const padLen = startMatch[2].length
    const generated: string[] = []
    for (let i = startNum; i <= endNum; i++) {
      generated.push(prefix + String(i).padStart(padLen, '0'))
    }
    setText(generated.join('\n'))
    setStartIccid(''); setEndIccid('')
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-gray-500">ICCID 回填（{lines.length}/{item.quantity}）</div>
        <div className="flex items-center gap-1">
          <input value={startIccid} onChange={e => setStartIccid(e.target.value)}
            placeholder="起始號段" className="px-2 py-0.5 border border-gray-300 rounded text-xs font-mono w-36" />
          <span className="text-xs text-gray-400">~</span>
          <input value={endIccid} onChange={e => setEndIccid(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateRange()}
            placeholder="結束號段" className="px-2 py-0.5 border border-gray-300 rounded text-xs font-mono w-36" />
          <button onClick={generateRange} className="px-2 py-0.5 bg-gray-100 text-xs rounded hover:bg-gray-200">產生號段</button>
        </div>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)}
        onBlur={() => { const deduped = [...new Set(text.split(/[\n,]/).map(s => s.trim()).filter(Boolean))]; setText(deduped.join('\n')) }}
        rows={Math.min(Math.max(item.quantity, 3), 8)}
        placeholder="每行一個 ICCID" className={`w-full px-2 py-1 border rounded text-xs font-mono ${lines.length >= item.quantity ? 'border-green-300 bg-green-50' : 'border-gray-200'}`} />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-gray-400">{lines.length !== item.quantity && lines.length > 0 ? `需要 ${item.quantity} 個，目前 ${lines.length} 個` : ''}</span>
        <button onClick={() => onSave(item.id, lines.length > 0 ? lines : [])}
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
  const [speedOpts, setSpeedOpts] = useState<string[]>([])
  const [selCountries, setSelCountries] = useState<string[]>([])
  const [selDays, setSelDays] = useState('')
  const [selCapacity, setSelCapacity] = useState('')
  const [selSpeed, setSelSpeed] = useState('')
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
      setSpeedOpts(d.speeds || [])
    })
  }, [])

  async function doSearch() {
    setSearching(true)
    const params = new URLSearchParams({ action: 'search' })
    if (selCountries.length > 0) params.set('countries', selCountries.join(','))
    if (selDays) params.set('days', selDays)
    if (selCapacity) params.set('capacity', selCapacity)
    if (selSpeed) params.set('speed', selSpeed)
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
          <div className="grid grid-cols-4 gap-3">
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

            {/* 限速 */}
            <select value={selSpeed} onChange={e => setSelSpeed(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">選擇限速</option>
              {speedOpts.map(s => <option key={s} value={s}>{s}</option>)}
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
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleExpand() }}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 text-[10px] text-gray-700">
                              {isExpanded ? '收合' : '詳情'}
                            </button>
                            {matchedOpt && (
                              <button onClick={(e) => { e.stopPropagation(); onMatch(bc.sku_id, matchedOpt.copies) }}
                                className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium">
                                選取
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={7} className="px-4 py-3">
                            {bc.country_details && bc.country_details.length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs text-gray-500 mb-1.5">運營商 / APN 詳情（共 {bc.country_details.length} 國）</div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] border border-gray-200 bg-white">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-2 py-1 text-left border-b">國家</th>
                                        <th className="px-2 py-1 text-left border-b">運營商</th>
                                        <th className="px-2 py-1 text-left border-b">APN</th>
                                        <th className="px-2 py-1 text-left border-b">APN 帳號</th>
                                        <th className="px-2 py-1 text-left border-b">APN 密碼</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {bc.country_details.map((c, ci) => (
                                        <tr key={ci} className="border-b last:border-0">
                                          <td className="px-2 py-1">{c.name_zh} <span className="text-gray-400 font-mono">({c.mcc})</span></td>
                                          <td className="px-2 py-1">{c.operator || '—'}</td>
                                          <td className="px-2 py-1 font-mono">{c.apn || '—'}</td>
                                          <td className="px-2 py-1 font-mono">{c.apn_username || '—'}</td>
                                          <td className="px-2 py-1 font-mono">{c.apn_password || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mb-1.5">各天數規格 / 結算價</div>
                            <table className="w-full text-[11px] border border-gray-200 bg-white">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2 py-1 text-left border-b">天數</th>
                                  <th className="px-2 py-1 text-right border-b">結算價</th>
                                  <th className="px-2 py-1 text-center border-b w-16">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bc.copies_options.map((opt, oi) => (
                                  <tr key={oi} className="border-b last:border-0">
                                    <td className="px-2 py-1 font-medium">{opt.days} 天</td>
                                    <td className="px-2 py-1 text-right font-medium text-blue-600">¥{opt.costCny.toFixed(2)}</td>
                                    <td className="px-2 py-1 text-center">
                                      <button onClick={(e) => { e.stopPropagation(); onMatch(bc.sku_id, opt.copies) }}
                                        className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-medium">
                                        選取
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
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

