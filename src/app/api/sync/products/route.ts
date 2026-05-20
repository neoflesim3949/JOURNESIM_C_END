import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProducts, getProductPrices, getAccelerationProducts, type BCProductPrice } from '@/lib/billionconnect'

const BATCH_SIZE = 30

export async function POST() {
  try {
    const supabase = createAdminClient()

    // 拉取所有銷售方式的商品（1-6），確保商品總數與 BC 一致
    const salesMethods = ['1', '2', '3', '4', '5', '6']

    // 並行呼叫所有 salesMethod 的 F002（簡中）
    const allProductsArrays = await Promise.all(
      salesMethods.map((sm) =>
        getProducts({ salesMethod: sm, language: '1', networkOperatorScope: '2' }).catch(() => [])
      )
    )

    // 並行呼叫所有 salesMethod 的 F003（價格）
    const allPricesArrays = await Promise.all(
      salesMethods.map((sm) =>
        getProductPrices(sm).catch(() => [])
      )
    )

    // 並行呼叫所有 salesMethod 的 F002（英文）
    const allEnProductsArrays = await Promise.all(
      salesMethods.map((sm) =>
        getProducts({ salesMethod: sm, language: '2', networkOperatorScope: '2' }).catch(() => [])
      )
    )

    // 加速包
    const [accelCn, accelEn] = await Promise.all([
      getAccelerationProducts({ language: '1' }).catch(() => []),
      getAccelerationProducts({ language: '2' }).catch(() => []),
    ])

    // 合併所有商品去重（簡中）
    const productMap = new Map<string, (typeof allProductsArrays)[0][0]>()
    for (const arr of allProductsArrays) {
      for (const p of arr) productMap.set(p.skuId, p)
    }
    for (const p of accelCn) productMap.set(p.skuId, p)

    // 合併所有價格
    const priceMap = new Map<string, BCProductPrice['price']>()
    for (const arr of allPricesArrays) {
      for (const p of arr) priceMap.set(p.skuId, p.price)
    }

    // 合併英文 name/desc
    const enMap = new Map<string, { name: string; desc: string }>()
    for (const arr of allEnProductsArrays) {
      for (const p of arr) enMap.set(p.skuId, { name: p.name, desc: p.desc })
    }
    for (const p of accelEn) enMap.set(p.skuId, { name: p.name, desc: p.desc })

    // 組合寫入資料
    const records = Array.from(productMap.values()).map((p) => {
      const skuPrices = priceMap.get(p.skuId) || []
      const costPrice = Array.isArray(skuPrices)
        ? skuPrices.find((t) => t.copies === '1')?.settlementPrice || null
        : null
      const enData = enMap.get(p.skuId)
      const countries = p.country?.map((c) => ({ 
        mcc: c.mcc, 
        name: c.name,
        apn: c.apn,
        apnUsername: c.apnUsername,
        apnPassword: c.apnPassword,
        operatorInfo: c.operatorInfo
      })) || null

      return {
        sku_id: p.skuId,
        name: p.name,
        type: p.type,
        sales_method: '5', // 保留欄位相容
        days: p.days ? Number(p.days) : null,
        capacity: p.capacity || null,
        high_flow_size: p.highFlowSize || null,
        limit_flow_speed: p.limitFlowSpeed || null,
        plan_type: p.planType || null,
        hotspot_support: p.hotspotSupport || null,
        acceleration_support: p.accelerationSupport || null,
        apply_to_device: p.applyToDevice || null,
        apply_to_device_type: p.applyToDeviceType || null,
        point_contact_type: p.pointContactType || null,
        point_contact_hours: p.pointContactHours || null,
        time_zone: p.timeZone || null,
        usage_count: p.usageCount || null,
        operator_info: p.operatorInfo || null,
        provider: p.provider || null,
        refund_policy: p.refundPolicy || null,
        rechargeable_product: p.rechargeableProduct || null,
        speed_limit_rule: p.speedLimitRule || null,
        validity_period: p.validityPeroid || null,
        desc: p.desc,
        country_data: countries,
        prices: Array.isArray(skuPrices) && skuPrices.length > 0 ? skuPrices : null,
        cost_price: costPrice ? Number(costPrice) : null,
        name_en: enData?.name || null,
        desc_en: enData?.desc || null,
        raw_data: null,
        updated_at: new Date().toISOString(),
      }
    })

    // 分批 upsert
    let synced = 0
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('bc_products')
        .upsert(batch, { onConflict: 'sku_id' })
      if (error) throw new Error(`upsert 失敗：${error.message}${error.details ? ' / ' + error.details : ''}${error.hint ? ' / ' + error.hint : ''}`)
      synced += batch.length
    }

    return NextResponse.json({ synced })
  } catch (err) {
    console.error('Product sync failed:', err)
    let msg: string
    if (err instanceof Error) msg = err.message
    else if (typeof err === 'string') msg = err
    else if (err && typeof err === 'object') {
      const eo = err as { message?: unknown; details?: unknown; hint?: unknown }
      msg = String(eo.message ?? '') + (eo.details ? ` / ${String(eo.details)}` : '') + (eo.hint ? ` / ${String(eo.hint)}` : '')
      if (!msg.trim()) msg = JSON.stringify(err)
    } else msg = String(err)
    // 如果錯誤內容包含 HTML（例如 Cloudflare 502 error page），萃取狀態資訊
    if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
      const codeMatch = msg.match(/Error code (\d+)/i) || msg.match(/\b(502|503|504|500)\b/)
      msg = codeMatch ? `上游服務暫時無回應（${codeMatch[1]}），請稍後再試` : '上游服務暫時無回應，請稍後再試'
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
