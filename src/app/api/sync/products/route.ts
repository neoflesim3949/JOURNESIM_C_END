import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProducts, getProductPrices, getAccelerationProducts } from '@/lib/billionconnect'

const BATCH_SIZE = 30 // 每批寫入筆數，避免 Nano 方案超載

export async function POST() {
  try {
    const supabase = createAdminClient()
    const salesMethod = '5'

    // 並行呼叫 5 個 BC API
    const [products, prices, accelerationProducts, enProducts, enAccel] = await Promise.all([
      getProducts({ salesMethod, language: '1', networkOperatorScope: '2' }),
      getProductPrices(salesMethod),
      getAccelerationProducts({ language: '1' }).catch(() => []),
      getProducts({ salesMethod, language: '2', networkOperatorScope: '2' }).catch(() => []),
      getAccelerationProducts({ language: '2' }).catch(() => []),
    ])

    // 建立價格 map
    const priceMap = new Map(prices.map((p) => [p.skuId, p.price]))

    // 合併主商品 + 加速包，去重
    const allProducts = new Map<string, typeof products[0]>()
    for (const p of [...products, ...accelerationProducts]) {
      allProducts.set(p.skuId, p)
    }

    // 英文 name/desc map
    const enMap = new Map<string, { name: string; desc: string }>()
    for (const p of [...enProducts, ...enAccel]) {
      enMap.set(p.skuId, { name: p.name, desc: p.desc })
    }

    // 組合資料（精簡 raw_data，只保留必要欄位以減少資料量）
    const records = Array.from(allProducts.values()).map((p) => {
      const skuPrices = priceMap.get(p.skuId) || []
      const costPrice = skuPrices.find((t) => t.copies === '1')?.settlementPrice || null
      const enData = enMap.get(p.skuId)

      // 精簡 country_data，只保留 mcc + name
      const countries = p.country?.map((c) => ({ mcc: c.mcc, name: c.name })) || null

      return {
        sku_id: p.skuId,
        name: p.name,
        type: p.type,
        sales_method: salesMethod,
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
        speed_limit_rule: p.speedLimitRule || null,
        validity_period: p.validityPeroid || null,
        desc: p.desc,
        country_data: countries,
        prices: skuPrices.length > 0 ? skuPrices : null,
        cost_price: costPrice ? Number(costPrice) : null,
        name_en: enData?.name || null,
        desc_en: enData?.desc || null,
        raw_data: null, // 不存 raw_data，節省空間避免 Nano 超載
        updated_at: new Date().toISOString(),
      }
    })

    // 分批 upsert，避免一次寫入太多導致 DB 超載
    let synced = 0
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('bc_products')
        .upsert(batch, { onConflict: 'sku_id' })

      if (error) throw error
      synced += batch.length
    }

    // 自動建立 ISO ↔ 數字MCC 映射
    // 從 bc_products.country_data 取得 { mcc(數字), name }
    // 與 bc_countries { mcc(ISO), name } 用 name 匹配
    try {
      const { data: bcCountries } = await supabase
        .from('bc_countries')
        .select('mcc, name')

      if (bcCountries && bcCountries.length > 0) {
        // 從所有商品的 country_data 收集 name → numeric_mcc 映射
        const nameToNumericMcc = new Map<string, Set<string>>()
        for (const p of allProducts.values()) {
          for (const c of p.country || []) {
            const name = c.name?.toLowerCase()
            if (!name || !c.mcc) continue
            if (!nameToNumericMcc.has(name)) nameToNumericMcc.set(name, new Set())
            nameToNumericMcc.get(name)!.add(c.mcc)
          }
        }

        // 用國家名稱匹配，更新 bc_countries.numeric_mcc
        for (const country of bcCountries) {
          const numericMccs = nameToNumericMcc.get(country.name.toLowerCase())
          if (numericMccs && numericMccs.size > 0) {
            await supabase
              .from('bc_countries')
              .update({ numeric_mcc: Array.from(numericMccs) })
              .eq('mcc', country.mcc)
          }
        }
      }
    } catch (e) {
      console.warn('Failed to build MCC mapping:', e)
      // 不影響主流程
    }

    return NextResponse.json({ synced })
  } catch (err) {
    console.error('Product sync failed:', err)
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Sync error detail:', msg)
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    )
  }
}
