import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelAfterSale, createRechargeOrder } from '@/lib/billionconnect'

// GET — 售後訂單列表（bc_aftersales）＋區間合計
// query: from / to（售後日期）、page / pageSize
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(200, Number(searchParams.get('pageSize')) || 50)
  const supabase = createAdminClient()

  let q = supabase.from('bc_aftersales')
    .select('id, after_sale_id, channel_order_id, channel_sub_order_id, shopee_order_id, iccids, card_count, reason, refund_cny, refund_twd, status, source, created_at, shopee_orders(shopee_order_number)', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to + 'T23:59:59')
  const { data, count, error } = await q.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 區間合計（不分頁；已取消不計）
  let sq = supabase.from('bc_aftersales').select('card_count, refund_cny, refund_twd')
    .or('status.is.null,status.not.in.(cancelled,reordered)')
  if (from) sq = sq.gte('created_at', from)
  if (to) sq = sq.lte('created_at', to + 'T23:59:59')
  const { data: sumRows } = await sq.limit(10000)
  let cards = 0, cny = 0, twd = 0
  for (const r of sumRows || []) {
    cards += r.card_count || 0
    cny += Number(r.refund_cny) || 0
    twd += Number(r.refund_twd) || 0
  }

  return NextResponse.json({
    data: (data || []).map(r => ({
      ...r,
      shopee_order_number: (r.shopee_orders as unknown as { shopee_order_number?: string } | null)?.shopee_order_number || null,
      shopee_orders: undefined,
    })),
    total: count || 0,
    summary: { count: (sumRows || []).length, card_count: cards, refund_cny: Math.round(cny * 100) / 100, refund_twd: Math.round(twd) },
  })
}

// POST { action: 'cancel', id } — 取消售後（F018，僅限 BC 尚未審核的售後單）
// 成功後標記 bc_aftersales.status = cancelled；套餐即恢復，無需重新下單
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'cancel') return NextResponse.json({ error: '未知 action' }, { status: 400 })
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少售後紀錄 id' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: row } = await supabase.from('bc_aftersales')
    .select('id, after_sale_id, status, channel_order_id, iccids').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: '找不到售後紀錄' }, { status: 404 })
  if (row.status === 'cancelled' || row.status === 'reordered') return NextResponse.json({ error: '此售後單已取消/已重新下單' }, { status: 400 })
  if (!row.after_sale_id) return NextResponse.json({ error: '此紀錄沒有 BC 售後單號' }, { status: 400 })

  // 1) 先試 F018 取消（未審核 → 直接復原套餐，最省）
  try {
    await cancelAfterSale(row.after_sale_id)
    await supabase.from('bc_aftersales').update({ status: 'cancelled' }).eq('id', id)
    return NextResponse.json({ ok: true, mode: 'cancelled' })
  } catch (e) {
    const cancelErr = e instanceof Error ? e.message : String(e)
    // 2) 已審核無法取消 → 自動重新下單：F007 充值原套餐回同一批 ICCID
    const iccids: string[] = Array.isArray(row.iccids) ? (row.iccids as string[]) : []
    if (iccids.length === 0) {
      return NextResponse.json({ error: `F018 取消失敗：${cancelErr}；且紀錄沒有 ICCID 無法重新下單` }, { status: 500 })
    }
    const { data: items } = await supabase.from('shopee_order_items')
      .select('bc_sku_id, matched_copies, iccid')
      .eq('bc_channel_order_id', row.channel_order_id)
    // 依卡找回原品項的 BC SKU / 份數，相同 SKU+份數合併成一個子單
    const groups = new Map<string, { skuId: string; copies: string; iccid: string[] }>()
    const unmatched: string[] = []
    for (const ic of iccids) {
      const item = (items || []).find(it => Array.isArray(it.iccid) && (it.iccid as string[]).includes(ic))
      if (!item?.bc_sku_id) { unmatched.push(ic); continue }
      const copies = String(item.matched_copies || '1')
      const key = `${item.bc_sku_id}|${copies}`
      if (!groups.has(key)) groups.set(key, { skuId: item.bc_sku_id, copies, iccid: [] })
      groups.get(key)!.iccid.push(ic)
    }
    if (unmatched.length > 0) {
      return NextResponse.json({ error: `F018 取消失敗：${cancelErr}；重新下單也失敗：找不到對應 BC SKU 的卡 ${unmatched.join(', ')}` }, { status: 500 })
    }
    const ts = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/\D/g, '').slice(2, 14)
    const channelOrderId = `FLRC${ts}${Math.floor(Math.random() * 900 + 100)}`
    try {
      const r = await createRechargeOrder({
        channelOrderId,
        subOrderList: [...groups.values()].map((g, i) => ({
          channelSubOrderId: `${channelOrderId}S${i + 1}`,
          iccid: g.iccid,
          skuId: g.skuId,
          copies: g.copies,
        })),
      })
      await supabase.from('bc_aftersales').update({ status: 'reordered' }).eq('id', id)
      return NextResponse.json({ ok: true, mode: 'reordered', order_id: r.orderId, channel_order_id: channelOrderId })
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2)
      return NextResponse.json({ error: `F018 取消失敗：${cancelErr}；F007 重新下單也失敗：${msg2}` }, { status: 500 })
    }
  }
}
