import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry, getPlanUsage } from '@/lib/billionconnect'

// GET — 查詢品項裡每張 ICCID 的卡有效期 (F010) + 套餐使用 (F012)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params
  const supabase = createAdminClient()

  const { data: item } = await supabase.from('shopee_order_items')
    .select('id, shopee_order_id, iccid, bc_channel_order_id')
    .eq('id', itemId).single()
  if (!item || item.shopee_order_id !== id) {
    return NextResponse.json({ error: '找不到品項' }, { status: 404 })
  }

  const iccids = Array.isArray(item.iccid) ? (item.iccid as string[]).filter(Boolean) : []
  if (iccids.length === 0) return NextResponse.json({ error: '此品項沒有 ICCID' }, { status: 400 })

  // F010 一次查所有卡有效期（陣列）
  let cardExpiry: unknown[] = []
  let cardErr: string | null = null
  try {
    const r = await getCardExpiry(iccids)
    cardExpiry = r || []
  } catch (err) {
    cardErr = err instanceof Error ? err.message : String(err)
  }

  // F012 每張 ICCID 各查一次
  const planResults = await Promise.all(iccids.map(async (ic) => {
    try {
      const r = await getPlanUsage({ iccid: ic, channelOrderId: item.bc_channel_order_id || undefined })
      return { iccid: ic, ok: true, data: r }
    } catch (err) {
      return { iccid: ic, ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }))

  return NextResponse.json({
    iccids,
    cardExpiry,
    cardError: cardErr,
    planUsage: planResults,
  })
}
