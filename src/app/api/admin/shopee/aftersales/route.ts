import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // 區間合計（不分頁）
  let sq = supabase.from('bc_aftersales').select('card_count, refund_cny, refund_twd')
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
