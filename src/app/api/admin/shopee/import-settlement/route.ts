import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// Excel 欄位對應
const COL_MAP: Record<string, string> = {
  '訂單編號': 'shopee_order_number',
  '退款編號': 'refund_number',
  '買家帳號': 'buyer_account',
  '訂單成立日期': 'order_date',
  '買家付款方式': 'payment_method',
  '錢包入帳日期': 'wallet_date',
  '商品原價': 'original_price',
  '賣場商品促銷折扣': 'promo_discount',
  '退款金額': 'refund_amount',
  '蝦皮補貼金額': 'shopee_subsidy',
  '賣家負擔優惠券': 'seller_coupon',
  '賣家負擔蝦幣回饋券': 'seller_coin_cashback',
  '買家支付運費': 'buyer_shipping_fee',
  '蝦皮補助運費': 'shopee_shipping_subsidy',
  '蝦皮代付運費': 'shopee_paid_shipping',
  '退貨運費': 'return_shipping_fee',
  '分期付款期數': 'installment_periods',
  '金流與系統處理費率': 'processing_rate',
  'AMS推廣費用': 'ams_fee',
  '成交手續費': 'transaction_fee',
  '其他服務費': 'other_service_fee',
  '金流與系統處理費': 'processing_fee',
  '錢包入帳金額': 'wallet_amount',
  '撥款來源': 'payment_source',
  '優惠代碼': 'promo_code',
  '損失賠償': 'damage_compensation',
}

function toNum(v: string | undefined): number | null {
  if (!v || v === '-' || v === '') return null
  const n = parseFloat(v.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

const NUM_FIELDS = new Set([
  'original_price', 'promo_discount', 'refund_amount', 'shopee_subsidy',
  'seller_coupon', 'seller_coin_cashback', 'buyer_shipping_fee',
  'shopee_shipping_subsidy', 'shopee_paid_shipping', 'return_shipping_fee',
  'ams_fee', 'transaction_fee', 'other_service_fee', 'processing_fee',
  'wallet_amount', 'damage_compensation',
])

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows } = await request.json() as { rows: Record<string, string>[] }
  if (!rows || rows.length === 0) return NextResponse.json({ error: '無資料' }, { status: 400 })

  try {
  const supabase = createAdminClient()

  // 取得所有訂單 ID 對應
  const orderNumbers = [...new Set(rows.map(r => r['訂單編號'] != null ? String(r['訂單編號']).trim() : '').filter(Boolean))]
  const { data: orders } = await supabase.from('shopee_orders')
    .select('id, shopee_order_number').in('shopee_order_number', orderNumbers)
  const orderMap = new Map((orders || []).map(o => [o.shopee_order_number, o.id]))

  let created = 0, updated = 0

  for (const row of rows) {
    const orderNum = row['訂單編號'] != null ? String(row['訂單編號']).trim() : ''
    if (!orderNum) continue

    const record: Record<string, unknown> = { raw_data: row }
    for (const [zhKey, dbKey] of Object.entries(COL_MAP)) {
      const raw = row[zhKey]
      const val = raw != null ? String(raw).trim() : ''
      if (NUM_FIELDS.has(dbKey)) {
        record[dbKey] = toNum(val)
      } else {
        record[dbKey] = val || null
      }
    }

    // 關聯訂單
    record.shopee_order_id = orderMap.get(orderNum) || null

    // upsert by shopee_order_number + refund_number
    const refundNum = record.refund_number as string | null
    let findQuery = supabase.from('shopee_settlements')
      .select('id')
      .eq('shopee_order_number', orderNum)
    if (refundNum) {
      findQuery = findQuery.eq('refund_number', refundNum)
    } else {
      findQuery = findQuery.is('refund_number', null)
    }
    const { data: existing } = await findQuery.maybeSingle()

    if (existing) {
      const { error } = await supabase.from('shopee_settlements').update(record).eq('id', existing.id)
      if (error) { console.error('[settlement update]', error.message); continue }
      updated++
    } else {
      const { error } = await supabase.from('shopee_settlements').insert(record)
      if (error) { console.error('[settlement insert]', error.message); continue }
      created++
    }
  }

  return NextResponse.json({ created, updated, total: rows.length })
  } catch (err) {
    console.error('[import-settlement]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : '匯入失敗' }, { status: 500 })
  }
}
