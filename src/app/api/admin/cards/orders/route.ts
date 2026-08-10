import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLogisticsCompanies, createSimOrder } from '@/lib/billionconnect'

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

interface SubOrderInput {
  device_sku_id: string
  plan_sku_id?: string
  plan_copies?: string
  number: string
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
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
