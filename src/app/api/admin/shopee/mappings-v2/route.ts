import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeCostTwd, costCnyFromPrices } from '@/lib/shopee-pricing'
import { isBcChanged, snapshotFor } from '@/lib/bc-snapshot'
import { buildOptionIndex } from '@/lib/option-index'

// GET ?account_id= — 列表，即時算成本/計算售價/最終售價/毛利
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = new URL(request.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const supabase = createAdminClient()

  // 分頁撈全部（PostgREST 單次預設上限 1000 筆）
  const options: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_product_options_v2')
      .select('*').eq('account_id', accountId)
      .order('shopee_product_name').order('shopee_variation_name')
      .range(from, from + 999)
    if (!data || data.length === 0) break
    options.push(...data)
    if (data.length < 1000) break
  }

  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  // 對應到的 BC 商品（價格 + 名稱）
  const skuIds = [...new Set((options || []).map(o => o.bc_sku_id).filter(Boolean))] as string[]
  const { data: bcProducts } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, name, prices').in('sku_id', skuIds)
    : { data: [] }
  const bcMap = new Map((bcProducts || []).map(p => [p.sku_id, p]))

  // 套餐選項貨號 → 套餐售價（V2 售價以套餐為準，套餐改價這裡即時跟著變）
  const optIndex = await buildOptionIndex(supabase)
  const pkgPriceByCode = new Map(optIndex.map(it => [it.code, it.sell_price]))

  const snapInit: { id: string; price: number }[] = [] // 已對應但尚無前次售價快照的列，建立基準
  const orphanIds: string[] = [] // 沒有套餐選項貨號卻殘留 BC 對應（舊資料）→ 視為未對應並清除
  const result = (options || []).map(o => {
    // BC 一律由「套餐選項貨號」決定：沒貨號＝沒對應
    const hasCode = !!o.variation_sku_code
    if (!hasCode && o.bc_sku_id) orphanIds.push(o.id)
    const bc = (hasCode && o.bc_sku_id) ? bcMap.get(o.bc_sku_id) : null
    const costCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, o.copies) : 0
    const costTwd = computeCostTwd(costCny, cnyRate)
    // 套餐售價（依填入的選項貨號解析）
    const pkgPrice = o.variation_sku_code ? (pkgPriceByCode.get(o.variation_sku_code) ?? null) : null
    // 前次售價快照 vs 目前套餐售價（套餐改價後標示）
    let priceSnap = o.price_snapshot != null ? Number(o.price_snapshot) : null
    // 已對應但沒有快照（舊資料）→ 以目前套餐售價建立基準，往後改價才比得出來
    if (priceSnap == null && pkgPrice != null && o.variation_sku_code) { priceSnap = pkgPrice; snapInit.push({ id: o.id, price: pkgPrice }) }
    const priceChanged = pkgPrice != null && priceSnap != null && pkgPrice !== priceSnap
    // 售價：有對應＝套餐售價；未對應＝人工售價 > 原蝦皮價
    const finalPrice = pkgPrice != null
      ? pkgPrice
      : (o.manual_price != null ? Number(o.manual_price) : (o.original_price != null ? Number(o.original_price) : null))
    const margin = finalPrice && costTwd ? finalPrice - costTwd : null
    return {
      ...o,
      // 沒貨號 → 對應一律視為空
      bc_sku_id: hasCode ? o.bc_sku_id : null,
      copies: hasCode ? o.copies : null,
      variation_sku_auto: o.variation_sku_code || null,
      bc_name: bc?.name || null,
      cost_cny: costCny || null,
      cost_twd: costTwd || null,
      package_price: pkgPrice,
      price_snapshot: priceSnap,
      price_changed: priceChanged,
      final_price: finalPrice || null,
      margin,
      margin_pct: margin != null && finalPrice ? Math.round((margin / finalPrice) * 1000) / 10 : null,
      // BC 同步後品名/成本是否與對應當下不同
      bc_changed: hasCode ? isBcChanged(o.bc_sku_id, o.bc_name_snapshot, o.bc_cost_snapshot, bc?.name, costCny) : false,
    }
  })

  // 持久化前次售價基準（一次性，往後就有快照可比對）
  for (const s of snapInit) {
    await supabase.from('shopee_product_options_v2').update({ price_snapshot: s.price }).eq('id', s.id)
  }
  // 清除「沒貨號卻殘留 BC」的孤兒對應（一次性，使資料一致：匯出/出貨也才正確）
  for (let i = 0; i < orphanIds.length; i += 200) {
    await supabase.from('shopee_product_options_v2')
      .update({ bc_sku_id: null, copies: null, bc_name_snapshot: null, bc_cost_snapshot: null, price_snapshot: null })
      .in('id', orphanIds.slice(i, i + 200))
  }

  // 規格自訂排序
  const specOrders: { product_id: string; spec_type: string; spec_value: string; sort_index: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_spec_order')
      .select('product_id, spec_type, spec_value, sort_index').eq('account_id', accountId).range(from, from + 999)
    if (!data || data.length === 0) break
    specOrders.push(...data)
    if (data.length < 1000) break
  }

  return NextResponse.json({ options: result, spec_orders: specOrders })
}

// PATCH — 更新對應(bc_sku_id+copies)/選項貨號/上架/前次售價快照
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('bc_sku_id' in body) updates.bc_sku_id = body.bc_sku_id || null
  if ('copies' in body) updates.copies = body.copies || null
  if ('variation_sku_code' in body) updates.variation_sku_code = body.variation_sku_code || null
  if ('is_listed' in body) updates.is_listed = !!body.is_listed
  if ('price_snapshot' in body) {
    const v = body.price_snapshot
    updates.price_snapshot = v === null || v === '' ? null : Number(v)
  }
  if ('manual_price' in body) {
    const v = body.manual_price
    updates.manual_price = v === null || v === '' ? null : Number(v)
  }

  const supabase = createAdminClient()

  // 設定/重新確認對應 → 更新 BC 品名/成本快照（取消對應 → 清空）
  if ('bc_sku_id' in body) {
    if (body.bc_sku_id) {
      const { data: bc } = await supabase.from('bc_products').select('name, prices').eq('sku_id', body.bc_sku_id).maybeSingle()
      const snap = snapshotFor(bc || undefined, body.copies)
      updates.bc_name_snapshot = snap.bc_name_snapshot
      updates.bc_cost_snapshot = snap.bc_cost_snapshot
    } else {
      updates.bc_name_snapshot = null
      updates.bc_cost_snapshot = null
    }
  }

  const { error } = await supabase.from('shopee_product_options_v2').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= — 刪除選項
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()
  // 刪除前取得所屬商品 → 刪除後 bump 同商品其餘選項（刪除也算更新）
  const { data: row } = await supabase.from('shopee_product_options_v2').select('account_id, shopee_product_id').eq('id', id).maybeSingle()
  const { error } = await supabase.from('shopee_product_options_v2').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (row?.shopee_product_id) {
    await supabase.from('shopee_product_options_v2')
      .update({ updated_at: new Date().toISOString() })
      .eq('account_id', row.account_id).eq('shopee_product_id', row.shopee_product_id)
  }
  return NextResponse.json({ ok: true })
}
