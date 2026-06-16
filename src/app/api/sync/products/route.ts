import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProducts, getProductPrices, getAccelerationProducts, type BCProductPrice } from '@/lib/billionconnect'

// 商品同步需呼叫多支 BC API + 寫入近 4000 筆，給足執行時間避免閘道逾時（504 → 前端「網路錯誤」）
export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_SIZE = 200
const SALES_METHODS = ['1', '2', '3', '4', '5', '6']

// 分批 upsert，回傳寫入筆數
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchUpsert(supabase: any, records: Record<string, unknown>[]) {
  let synced = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('bc_products').upsert(batch, { onConflict: 'sku_id' })
    if (error) throw error
    synced += batch.length
  }
  return synced
}

// POST ?parts=products|prices|all（預設 all）
// products＝F002 商品主檔（不動價格）；prices＝F003 價格（只更新既有商品）；all＝兩者
export async function POST(request: Request) {
  const parts = new URL(request.url).searchParams.get('parts') || 'all'
  const doProducts = parts === 'all' || parts === 'products'
  const doPrices = parts === 'all' || parts === 'prices'

  try {
    const supabase = createAdminClient()

    // ── 只同步價格（F003）：只更新既有商品的 prices / cost_price ──
    if (doPrices && !doProducts) {
      const allPricesArrays = await Promise.all(SALES_METHODS.map((sm) => getProductPrices(sm).catch(() => [])))
      const priceMap = new Map<string, BCProductPrice['price']>()
      for (const arr of allPricesArrays) for (const p of arr) priceMap.set(p.skuId, p.price)

      // 既有 sku_id（避免插入只有價格、缺商品主檔的稀疏列）
      const existing = new Set<string>()
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('bc_products').select('sku_id').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const r of data) existing.add(r.sku_id)
        if (data.length < 1000) break
      }

      const now = new Date().toISOString()
      const records: Record<string, unknown>[] = []
      for (const [skuId, skuPrices] of priceMap) {
        if (!existing.has(skuId)) continue
        const costPrice = Array.isArray(skuPrices) ? skuPrices.find((t) => t.copies === '1')?.settlementPrice || null : null
        records.push({
          sku_id: skuId,
          prices: Array.isArray(skuPrices) && skuPrices.length > 0 ? skuPrices : null,
          cost_price: costPrice ? Number(costPrice) : null,
          updated_at: now,
        })
      }
      const synced = await batchUpsert(supabase, records)
      return NextResponse.json({ synced })
    }

    // ── 同步商品主檔（F002，可含 F003 視 parts）──
    // 並行拉 F002 簡中 / F002 英文 / 加速包；只有 all 時才拉 F003 價格
    const [allProductsArrays, allEnProductsArrays, accelCn, accelEn, allPricesArrays] = await Promise.all([
      Promise.all(SALES_METHODS.map((sm) => getProducts({ salesMethod: sm, language: '1', networkOperatorScope: '2' }).catch(() => []))),
      Promise.all(SALES_METHODS.map((sm) => getProducts({ salesMethod: sm, language: '2', networkOperatorScope: '2' }).catch(() => []))),
      getAccelerationProducts({ language: '1' }).catch(() => []),
      getAccelerationProducts({ language: '2' }).catch(() => []),
      doPrices
        ? Promise.all(SALES_METHODS.map((sm) => getProductPrices(sm).catch(() => [])))
        : Promise.resolve([] as Awaited<ReturnType<typeof getProductPrices>>[]),
    ])

    // 合併所有商品去重（簡中）
    const productMap = new Map<string, (typeof allProductsArrays)[0][0]>()
    for (const arr of allProductsArrays) {
      for (const p of arr) productMap.set(p.skuId, p)
    }
    for (const p of accelCn) productMap.set(p.skuId, p)

    // 合併所有價格（僅 all）
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

    // ── 上下架比對：載入同步前的本地商品（sku_id, name, is_active）──
    const existingRows: { sku_id: string; name: string | null; is_active: boolean | null }[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('bc_products').select('sku_id, name, is_active').range(from, from + 999)
      if (!data || data.length === 0) break
      existingRows.push(...data)
      if (data.length < 1000) break
    }
    const dbSkus = new Map(existingRows.map((r) => [r.sku_id, r]))
    const bcSkus = new Set(productMap.keys())

    // 新上架＝BC 有、本地沒有（或先前已停用又回來）
    const added = [...productMap.values()]
      .filter((p) => !dbSkus.has(p.skuId) || dbSkus.get(p.skuId)!.is_active === false)
      .map((p) => ({ sku_id: p.skuId, name: p.name }))
    // 已下架＝本地仍啟用、但 BC 這次沒回傳
    const removed = existingRows
      .filter((r) => r.is_active !== false && !bcSkus.has(r.sku_id))
      .map((r) => ({ sku_id: r.sku_id, name: r.name }))

    // 安全保護：若 BC 回傳數異常偏少（疑似部分 API 失敗），不執行下架標記，避免誤殺
    const applyRemoval = bcSkus.size > 0 && (existingRows.length === 0 || bcSkus.size >= existingRows.length * 0.5)
    const note = applyRemoval ? null : `BC 回傳商品數(${bcSkus.size})明顯少於本地(${existingRows.length})，本次略過下架標記以防誤判`

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

      const rec: Record<string, unknown> = {
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
        name_en: enData?.name || null,
        desc_en: enData?.desc || null,
        raw_data: null,
        updated_at: new Date().toISOString(),
        // BC 這次有回傳 → 視為上架
        is_active: true,
        delisted_at: null,
      }
      // 只有 all 才一併寫價格；products-only 不動既有 prices/cost_price
      if (doPrices) {
        rec.prices = Array.isArray(skuPrices) && skuPrices.length > 0 ? skuPrices : null
        rec.cost_price = costPrice ? Number(costPrice) : null
      }
      return rec
    })

    const synced = await batchUpsert(supabase, records)

    // 下架標記：BC 這次沒回傳、本地仍啟用 → is_active=false + delisted_at（安全保護未過則略過）
    if (applyRemoval && removed.length > 0) {
      const nowIso = new Date().toISOString()
      const removedSkus = removed.map((r) => r.sku_id)
      for (let i = 0; i < removedSkus.length; i += BATCH_SIZE) {
        const chunk = removedSkus.slice(i, i + BATCH_SIZE)
        await supabase.from('bc_products').update({ is_active: false, delisted_at: nowIso }).in('sku_id', chunk)
      }
    }

    // 寫入本次比對紀錄（最多各留 1000 筆明細）
    const cap = <T,>(a: T[]) => a.slice(0, 1000)
    await supabase.from('bc_sync_diffs').insert({
      scope: 'products',
      bc_count: bcSkus.size,
      db_count: existingRows.length,
      added_count: added.length,
      removed_count: applyRemoval ? removed.length : 0,
      added: cap(added),
      removed: cap(removed),
      applied_removal: applyRemoval,
      note,
    })

    return NextResponse.json({
      synced,
      added: added.length,
      removed: applyRemoval ? removed.length : 0,
      removal_skipped: !applyRemoval,
      note,
    })
  } catch (err) {
    console.error('Product sync failed:', err)
    let msg = err instanceof Error ? err.message : String(err)
    // 如果錯誤內容包含 HTML（例如 Cloudflare 502 error page），萃取狀態資訊
    if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
      const codeMatch = msg.match(/Error code (\d+)/i) || msg.match(/\b(502|503|504|500)\b/)
      msg = codeMatch ? `上游服務暫時無回應（${codeMatch[1]}），請稍後再試` : '上游服務暫時無回應，請稍後再試'
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
