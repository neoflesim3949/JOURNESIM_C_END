import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProducts, getProductPrices, getAccelerationProducts, type BCProduct, type BCProductPrice } from '@/lib/billionconnect'

export const maxDuration = 60

const BATCH_SIZE = 30
const ALL_SALES_METHODS = ['1', '2', '3', '4', '5', '6']

// 把一個 salesMethod 加入「不再撈」清單（system_settings.bc_skip_sales_methods，逗號分隔）
async function markSalesMethodInvalid(supabase: ReturnType<typeof createAdminClient>, sm: string) {
  const { data: row } = await supabase.from('system_settings').select('value').eq('key', 'bc_skip_sales_methods').maybeSingle()
  const current = String(row?.value || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  if (current.includes(sm)) return
  const updated = [...current, sm].sort().join(',')
  await supabase.from('system_settings').upsert({ key: 'bc_skip_sales_methods', value: updated, description: 'BC 同步要跳過的 salesMethod（自動偵測 1047 銷售策略不存在後加入）' }, { onConflict: 'key' })
  console.log(`[BC sync] 標記 salesMethod=${sm} 為無效，下次同步將跳過`)
}

// 重試 helper：BC 偶發 522/timeout 時自動重試
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// 兩次 BC call 之間的固定等待（避免觸發 BC 速率限制 [1999] 系统繁忙）
const BC_CALL_GAP_MS = 2000

async function withRetry<T>(fn: () => Promise<T>, label: string, fallback: T, maxAttempts = 4): Promise<T> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn() }
    catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      // [1999] 系统繁忙 也視為可重試，1047 不重試
      const isRetryable = /\b(522|502|503|504|1999|timeout|ECONNRESET|fetch failed)\b/i.test(msg) && !msg.includes('[1047]')
      console.warn(`[BC retry] ${label} attempt ${attempt}/${maxAttempts} failed: ${msg}`)
      if (attempt === maxAttempts || !isRetryable) break
      // backoff: 3s, 7s, 15s
      const wait = attempt === 1 ? 3000 : attempt === 2 ? 7000 : 15000
      await sleep(wait)
    }
  }
  console.error(`[BC retry] ${label} 最終失敗，使用 fallback`, lastErr)
  return fallback
}

function buildRecord(p: BCProduct, prices: BCProductPrice['price'] | undefined, enData: { name: string; desc: string } | undefined) {
  const skuPrices = prices || []
  const costPrice = Array.isArray(skuPrices) ? skuPrices.find((t) => t.copies === '1')?.settlementPrice || null : null
  const countries = p.country?.map((c) => ({
    mcc: c.mcc, name: c.name, apn: c.apn,
    apnUsername: c.apnUsername, apnPassword: c.apnPassword,
    operatorInfo: c.operatorInfo,
  })) || null

  return {
    sku_id: p.skuId,
    name: p.name,
    type: p.type,
    sales_method: '5',
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
}

// POST { job_id } — 推進一個 step
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { job_id } = await request.json() as { job_id: string }
  if (!job_id) return NextResponse.json({ error: 'job_id 必填' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: job } = await supabase.from('sync_jobs').select('*').eq('id', job_id).single()
  if (!job) return NextResponse.json({ error: '任務不存在' }, { status: 404 })
  if (job.type !== 'products') return NextResponse.json({ error: '任務類型錯誤' }, { status: 400 })
  if (job.status !== 'running') return NextResponse.json({ error: `任務已結束 (status=${job.status})` }, { status: 400 })

  const nextStep = job.step_current + 1
  if (nextStep > job.step_total) {
    await supabase.from('sync_jobs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', job_id)
    return NextResponse.json({ done: true, step_current: job.step_current, step_total: job.step_total, synced_count: job.synced_count })
  }

  let products: BCProduct[] = []
  let prices: BCProductPrice[] = []
  let productsEn: BCProduct[] = []
  let stepLabel = ''

  // 讀取目前的 skip list，計算「這個 job 開始時」的有效 SM 順序
  const { data: skipRow } = await supabase.from('system_settings').select('value').eq('key', 'bc_skip_sales_methods').maybeSingle()
  const skipList = String(skipRow?.value || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  const validSMs = ALL_SALES_METHODS.filter(sm => !skipList.includes(sm))
  // step 1..validSMs.length: 對應 validSMs[step-1]；最後一步: 加速包

  try {
    if (nextStep <= validSMs.length) {
      const sm = validSMs[nextStep - 1]
      stepLabel = `銷售方式 ${sm}`
      await supabase.from('sync_jobs').update({ step_label: `${stepLabel} - 抓取中` }).eq('id', job_id)
      // 先打 F003（最便宜的探針），若 1047 即標記無效並跳過 F002
      try {
        prices = await getProductPrices(sm)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('[1047]')) {
          await markSalesMethodInvalid(supabase, sm)
          await supabase.from('sync_jobs').update({
            step_current: nextStep,
            step_label: `${stepLabel} - 無此銷售策略，已加入排除清單`,
            ...(nextStep === job.step_total ? { status: 'completed', finished_at: new Date().toISOString() } : {}),
          }).eq('id', job_id)
          return NextResponse.json({
            done: nextStep === job.step_total,
            step_current: nextStep,
            step_total: job.step_total,
            step_label: stepLabel,
            synced_count: job.synced_count,
            step_synced: 0,
            skipped: true,
          })
        }
        // 非 1047 → 走重試（可能是 522/1999 等）
        prices = await withRetry(() => getProductPrices(sm), `F003 sm=${sm}`, [])
      }
      // F003 ok → 拿 F002 cn/en（每次 BC call 間留 BC_CALL_GAP_MS 避免速率限制）
      await sleep(BC_CALL_GAP_MS)
      products = await withRetry(() => getProducts({ salesMethod: sm, language: '1', networkOperatorScope: '2' }), `F002 sm=${sm} 簡中`, [])
      await sleep(BC_CALL_GAP_MS)
      productsEn = await withRetry(() => getProducts({ salesMethod: sm, language: '2', networkOperatorScope: '2' }), `F002 sm=${sm} 英文`, [])
    } else {
      // 最後一步: 加速包
      stepLabel = '加速包'
      await supabase.from('sync_jobs').update({ step_label: `${stepLabel} - 抓取中` }).eq('id', job_id)
      products = await withRetry(() => getAccelerationProducts({ language: '1' }), 'F056 加速包 簡中', [])
      await sleep(BC_CALL_GAP_MS)
      productsEn = await withRetry(() => getAccelerationProducts({ language: '2' }), 'F056 加速包 英文', [])
    }

    const priceMap = new Map<string, BCProductPrice['price']>()
    for (const p of prices) priceMap.set(p.skuId, p.price)
    const enMap = new Map<string, { name: string; desc: string }>()
    for (const p of productsEn) enMap.set(p.skuId, { name: p.name, desc: p.desc })

    const records = products.map(p => buildRecord(p, priceMap.get(p.skuId), enMap.get(p.skuId)))

    // 分批 upsert
    let upserted = 0
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('bc_products').upsert(batch, { onConflict: 'sku_id' })
      if (error) throw new Error(`upsert 失敗：${error.message}${error.details ? ' / ' + error.details : ''}`)
      upserted += batch.length
    }

    const newSyncedCount = job.synced_count + upserted
    const isLastStep = nextStep === job.step_total
    await supabase.from('sync_jobs').update({
      step_current: nextStep,
      step_label: `${stepLabel} - 完成 (${upserted} 筆)`,
      synced_count: newSyncedCount,
      ...(isLastStep ? { status: 'completed', finished_at: new Date().toISOString() } : {}),
    }).eq('id', job_id)

    return NextResponse.json({
      done: isLastStep,
      step_current: nextStep,
      step_total: job.step_total,
      step_label: stepLabel,
      synced_count: newSyncedCount,
      step_synced: upserted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('sync_jobs').update({
      status: 'failed',
      error_message: `step ${nextStep} (${stepLabel}) - ${msg}`,
      finished_at: new Date().toISOString(),
    }).eq('id', job_id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
