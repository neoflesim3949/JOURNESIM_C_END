import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 匯入蝦皮 Excel 訂單（前端解析後傳 JSON 陣列）
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows, account_id } = await request.json() as { rows: Record<string, string>[]; account_id?: string }
  if (!rows || rows.length === 0) return NextResponse.json({ error: '無資料' }, { status: 400 })

  // 模糊找欄位名（Excel 表頭可能有微妙差異）
  function findCol(row: Record<string, string>, ...keywords: string[]): string | null {
    for (const kw of keywords) {
      const key = Object.keys(row).find(k => k.includes(kw))
      if (key && row[key]) return row[key]
    }
    return null
  }

  const supabase = createAdminClient()

  // 對應來源＝V2 蝦皮表（依選項ID；只認 V2，不回退舊表）— 分頁撈全
  // 注意：不過濾 bc_sku_id，因為也要帶自設名稱快照（即使尚未對應 BC）
  type V2Opt = { shopee_variation_id: string; bc_sku_id: string | null; copies: string | null; custom_product_name: string | null; custom_variation_name: string | null }
  const v2opts: V2Opt[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('shopee_product_options_v2')
      .select('shopee_variation_id, bc_sku_id, copies, custom_product_name, custom_variation_name')
    if (account_id) q = q.eq('account_id', account_id)
    const { data } = await q.range(from, from + 999)
    if (!data || data.length === 0) break
    v2opts.push(...data)
    if (data.length < 1000) break
  }
  const mappingMap = new Map(v2opts.map(o => [String(o.shopee_variation_id), o]))

  // 按訂單編號分組
  const orderGroups = new Map<string, Record<string, string>[]>()
  for (const row of rows) {
    const num = row['訂單編號']?.trim()
    if (!num) continue
    if (!orderGroups.has(num)) orderGroups.set(num, [])
    orderGroups.get(num)!.push(row)
  }

  let created = 0, updated = 0, itemsCreated = 0

  for (const [orderNum, orderRows] of orderGroups) {
    const first = orderRows[0]

    // Upsert 訂單
    const shopeeStatus = first['訂單狀態'] || null
    const orderData = {
      shopee_order_number: orderNum,
      order_status: shopeeStatus,
      ...(shopeeStatus === '不成立' ? { internal_status: '不成立' } : {}),
      return_status: first['退貨 / 退款狀態'] || first['退貨/退款狀態'] || null,
      buyer_account: first['買家帳號'] || null,
      order_date: first['訂單成立日期'] || null,
      product_total: parseFloat(first['商品總價']) || null,
      buyer_shipping_fee: parseFloat(first['買家支付運費']) || null,
      shopee_shipping_subsidy: parseFloat(first['蝦皮補助運費']) || null,
      return_shipping_fee: parseFloat(first['退貨運費']) || null,
      buyer_total_payment: parseFloat(first['買家總支付金額']) || null,
      seller_coupon: parseFloat(first['賣家負擔優惠券']) || null,
      transaction_fee: parseFloat(first['成交手續費']) || null,
      other_service_fee: parseFloat(first['其他服務費']) || null,
      payment_processing_fee: parseFloat(first['金流與系統處理費']) || null,
      payment_processing_rate: first['金流與系統處理費率'] || null,
      recipient_name: first['收件者姓名'] || null,
      recipient_phone: findCol(first, '收件者電話') || null,
      shipping_address: first['收件地址'] || null,
      shopee_tracking_code: findCol(first, '包裹查詢號碼', '蝦皮專線') || null,
      pickup_store_id: first['取件門市店號'] || null,
      city: first['城市'] || null,
      district: first['行政區'] || null,
      zip_code: first['郵遞區號'] || null,
      shipping_method: first['寄送方式'] || null,
      fulfillment_method: first['出貨方式'] || null,
      payment_method: first['付款方式'] || null,
      buyer_note: first['買家備註'] || null,
      seller_note: first['備註'] || null,
      raw_data: first,
      updated_at: new Date().toISOString(),
      ...(account_id ? { shopee_account_id: account_id } : {}),
    }

    // 檢查是否已存在
    const { data: existing } = await supabase.from('shopee_orders')
      .select('id').eq('shopee_order_number', orderNum).single()

    let orderId: string
    if (existing) {
      await supabase.from('shopee_orders').update(orderData).eq('id', existing.id)
      orderId = existing.id
      updated++
    } else {
      const { data: newOrder } = await supabase.from('shopee_orders').insert(orderData).select().single()
      if (!newOrder) continue
      orderId = newOrder.id
      created++
    }

    // 處理商品明細
    for (const row of orderRows) {
      const skuCode = findCol(row, '蝦皮商品編碼') || ''
      const productId = row['商品ID'] || ''
      const variationId = row['規格ID'] || ''

      // 查對應（依選項ID 從 V2 蝦皮表）
      const mapping = variationId ? mappingMap.get(String(variationId)) : undefined

      const itemData = {
        shopee_order_id: orderId,
        shopee_product_name: row['商品名稱'] || null,
        shopee_product_id: productId || null,
        shopee_variation_name: row['商品選項名稱'] || null,
        shopee_variation_id: variationId || null,
        shopee_sku_code: skuCode || null,
        original_price: parseFloat(row['商品原價']) || null,
        sale_price: parseFloat(row['商品活動價格']) || null,
        quantity: parseInt(row['數量']) || 1,
        return_quantity: parseInt(row['退貨數量']) || 0,
        matched_package_id: null,
        matched_plan_id: null,
        matched_copies: mapping?.copies || null,
        bc_sku_id: mapping?.bc_sku_id || null,
        status: mapping?.bc_sku_id ? 'matched' : 'pending',
        // 自設名稱快照（標籤/收據讀此；之後改 V2 不影響既有訂單）
        custom_product_name: mapping?.custom_product_name || null,
        custom_variation_name: mapping?.custom_variation_name || null,
        raw_data: row,
      }

      // 如果重複上傳，用 shopee_order_id + shopee_sku_code 判斷是否已存在
      if (existing && skuCode) {
        const { data: existingItem } = await supabase.from('shopee_order_items')
          .select('id').eq('shopee_order_id', orderId).eq('shopee_sku_code', skuCode).single()
        if (existingItem) {
          await supabase.from('shopee_order_items').update({
            return_quantity: itemData.return_quantity,
            shopee_product_name: itemData.shopee_product_name,
            shopee_variation_name: itemData.shopee_variation_name,
            custom_product_name: itemData.custom_product_name,
            custom_variation_name: itemData.custom_variation_name,
          }).eq('id', existingItem.id)
          continue
        }
      }

      await supabase.from('shopee_order_items').insert(itemData)
      itemsCreated++
      // 註：不回寫任何共用對應表；訂單只保存自己的快照
    }
  }

  return NextResponse.json({ created, updated, items: itemsCreated, total: orderGroups.size })
}
