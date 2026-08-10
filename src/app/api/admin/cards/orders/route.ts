import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLogisticsCompanies, createSimOrder, getOrderInfo } from '@/lib/billionconnect'
import { refreshCardExpiry } from '@/lib/card-expiry-sync'

// 同步卡號會對每張卡打 F010（500 張 = 10 批），給足執行時間
export const maxDuration = 300

// 卡片訂單（後台手動下實體卡）
// GET  ?action=logistics          → F005 物流公司清單
// GET  ?action=skus&skus=a,b      → 選中商品明細（名稱/類型/份數價格，供下單畫面用）
// GET  ?action=history            → 近期 F006 下單紀錄（bc_api_logs）
// POST { sub_orders, express, ... } → F006 創建卡訂單

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || ''

  if (action === 'logistics') {
    try {
      const list = await getLogisticsCompanies()
      return NextResponse.json({ companies: list || [] })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  if (action === 'shipinfo') {
    // 常用收貨資訊（存 system_settings，全後台共用）
    const supabase = createAdminClient()
    const { data } = await supabase.from('system_settings')
      .select('value').eq('key', 'card_order_ship_info').maybeSingle()
    let info: Record<string, string> = {}
    try { info = JSON.parse(data?.value || '{}') } catch { /* 壞資料回空 */ }
    return NextResponse.json({ info })
  }

  if (action === 'cards') {
    // 實體卡商品：卡類型（單次/多次/硬卡/卡+套餐組合），上架中
    const CARD_TYPES = ['210', '211', '212', '311', '3101', '3102', '3103', '3104']
    const supabase = createAdminClient()
    const { data } = await supabase.from('bc_products')
      .select('sku_id, name, type, days, prices, cost_price')
      .in('type', CARD_TYPES)
      .or('is_active.is.null,is_active.eq.true')
      .order('name')
    return NextResponse.json({ items: data || [] })
  }

  if (action === 'skus') {
    const skus = (searchParams.get('skus') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (skus.length === 0) return NextResponse.json({ items: [] })
    const supabase = createAdminClient()
    const { data } = await supabase.from('bc_products')
      .select('sku_id, name, type, days, prices, cost_price')
      .in('sku_id', skus)
    return NextResponse.json({ items: data || [] })
  }

  if (action === 'history') {
    const supabase = createAdminClient()
    const { data } = await supabase.from('bc_api_logs')
      .select('id, status, error_message, request_body, response_body, created_at')
      .eq('trade_type', 'F006').eq('direction', 'outgoing')
      .order('created_at', { ascending: false }).limit(20)
    return NextResponse.json({ items: data || [] })
  }

  return NextResponse.json({ error: '未知 action' }, { status: 400 })
}

// PUT — 儲存常用收貨資訊
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const info = (body.info || {}) as Record<string, string>
  const supabase = createAdminClient()
  const { error } = await supabase.from('system_settings').upsert({
    key: 'card_order_ship_info',
    value: JSON.stringify(info),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

interface SubOrderInput {
  device_sku_id: string
  plan_sku_id?: string
  plan_copies?: string
  number: string
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))

  // ─── 同步卡號：F011 查訂單 → ICCID 寫入 manual_iccids（卡片管理）───
  if (body.action === 'sync_iccids') {
    const orderId = String(body.order_id || '').trim()
    const channelOrderId = String(body.channel_order_id || '').trim()
    if (!orderId && !channelOrderId) return NextResponse.json({ error: '缺少訂單號' }, { status: 400 })
    try {
      // BC F011 用 orderId 查會回 1016 Multiple main orders exist（BC 端行為），一律優先用渠道單號查
      const info = await getOrderInfo(channelOrderId ? { channelOrderId } : { orderId })
      const iccids: string[] = []
      for (const sub of info?.subOrderList || []) {
        const arr = Array.isArray(sub.iccid) ? sub.iccid : (sub.iccid ? [sub.iccid] : [])
        for (const ic of arr) if (ic) iccids.push(String(ic))
      }
      if (iccids.length === 0) {
        return NextResponse.json({ ok: true, iccids: [], inserted: 0, note: 'BC 尚未配卡（出貨後才有卡號），稍後再同步' })
      }
      const supabase = createAdminClient()
      const rows = iccids.map(ic => ({ iccid: ic, type: 'sim', note: `卡片訂單 ${channelOrderId || info?.channelOrderId || orderId}` }))
      const { error, count } = await supabase.from('manual_iccids')
        .upsert(rows, { onConflict: 'iccid', ignoreDuplicates: true, count: 'exact' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // 順便同步狀態＋效期（F010，每批 50 張）
      let statusSynced = 0
      for (let i = 0; i < iccids.length; i += 50) {
        statusSynced += await refreshCardExpiry(supabase, iccids.slice(i, i + 50))
      }
      return NextResponse.json({ ok: true, iccids, inserted: count ?? 0, status_synced: statusSynced })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  const subOrders = (body.sub_orders || []) as SubOrderInput[]
  if (!Array.isArray(subOrders) || subOrders.length === 0) {
    return NextResponse.json({ error: '請至少加入一項商品' }, { status: 400 })
  }
  for (const s of subOrders) {
    if (!s.device_sku_id || !s.number || Number(s.number) < 1) {
      return NextResponse.json({ error: '商品 SKU 與數量必填' }, { status: 400 })
    }
  }
  const express = body.express as Record<string, string> | undefined
  if (!express?.userName || !express?.userPhone || !express?.address) {
    return NextResponse.json({ error: '收件人姓名、電話、地址必填' }, { status: 400 })
  }

  // 渠道單號：FLCARD + 年月日時分秒 + 3 碼亂數（避免同秒重複）
  const ts = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/\D/g, '').slice(2, 14)
  const channelOrderId = `FLCARD${ts}${Math.floor(Math.random() * 900 + 100)}`

  const payload = {
    channelOrderId,
    express: {
      userName: express.userName,
      userPhone: express.userPhone,
      ...(express.logisticsCompany ? { logisticsCompany: express.logisticsCompany } : {}),
      ...(express.feeMethod ? { feeMethod: express.feeMethod } : {}),
      ...(express.province ? { province: express.province } : {}),
      ...(express.city ? { city: express.city } : {}),
      ...(express.district ? { district: express.district } : {}),
      address: express.address,
      ...(express.expressFee ? { expressFee: express.expressFee } : {}),
    },
    ...(body.total_amount ? { totalAmount: String(body.total_amount) } : {}),
    ...(body.comment ? { comment: String(body.comment) } : {}),
    ...(body.estimated_use_time ? { estimatedUseTime: String(body.estimated_use_time) } : {}),
    subOrderList: subOrders.map((s, i) => ({
      channelSubOrderId: `${channelOrderId}S${i + 1}`,
      deviceSkuId: s.device_sku_id,
      planSkuId: s.plan_sku_id || '',
      planSkuCopies: s.plan_copies || '1',
      number: String(s.number),
    })),
  }

  try {
    const result = await createSimOrder(payload)
    return NextResponse.json({ ok: true, channel_order_id: channelOrderId, result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
