import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 此蝦皮訂單的售後訂單（bc_aftersales；F017 成功後生成）
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase.from('bc_aftersales')
    .select('id, after_sale_id, channel_order_id, channel_sub_order_id, iccids, card_count, reason, refund_cny, refund_twd, status, created_at')
    .eq('shopee_order_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ records: [], error: error.message })

  const records = (data || []).map(r => ({
    id: r.id,
    created_at: r.created_at,
    channel_order_id: r.channel_order_id,
    channel_sub_order_id: r.channel_sub_order_id,
    reason: r.reason || '',
    iccids: Array.isArray(r.iccids) ? r.iccids as string[] : [],
    card_count: r.card_count || 0,
    after_sale_id: r.after_sale_id,
    refund_cny: r.refund_cny != null ? Number(r.refund_cny) : null,
    refund_twd: r.refund_twd != null ? Number(r.refund_twd) : null,
    status: r.status,
    ok: r.status !== 'failed',
    error: null,
  }))
  return NextResponse.json({ records })
}
