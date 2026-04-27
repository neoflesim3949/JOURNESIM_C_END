import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 為一個 quantity>1 的 eSIM 品項一次填入多筆資料，自動拆成多 row
// body: { entries: [{ lpa_code?, qr_code_url?, iccid? }, ...] }
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  const { data: item } = await supabase.from('shopee_order_items').select('*').eq('id', itemId).single()
  if (!item || item.shopee_order_id !== id) return NextResponse.json({ error: '找不到品項' }, { status: 404 })

  const entries = Array.isArray(body.entries) ? body.entries : []
  if (entries.length === 0) return NextResponse.json({ error: '請提供 entries' }, { status: 400 })

  const cleaned = entries.map((e: { lpa_code?: string; qr_code_url?: string; iccid?: string }) => ({
    lpa_code: (e.lpa_code || '').trim() || null,
    qr_code_url: (e.qr_code_url || '').trim() || null,
    iccid: (e.iccid || '').trim() || null,
  }))

  // 至少有一筆要有任一內容
  if (!cleaned.some((c: { lpa_code: string | null; qr_code_url: string | null; iccid: string | null }) => c.lpa_code || c.qr_code_url || c.iccid)) {
    return NextResponse.json({ error: '請至少填寫一筆 eSIM 資料' }, { status: 400 })
  }

  // 單筆 + 原 quantity===1 → 直接更新
  if (cleaned.length === 1 && (item.quantity || 1) === 1) {
    const c = cleaned[0]
    const { error } = await supabase.from('shopee_order_items').update({
      lpa_code: c.lpa_code,
      qr_code_url: c.qr_code_url,
      iccid: c.iccid ? [c.iccid] : null,
      status: (c.lpa_code || c.qr_code_url || c.iccid) && !item.bc_order_id ? 'bc_ordered' : item.status,
    }).eq('id', itemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode: 'update', count: 1 })
  }

  // 多筆或 qty>1 → 拆分：先建新 rows，再刪原 row
  const rows = cleaned.map((c: { lpa_code: string | null; qr_code_url: string | null; iccid: string | null }) => ({
    shopee_order_id: item.shopee_order_id,
    shopee_product_name: item.shopee_product_name,
    shopee_product_id: item.shopee_product_id,
    shopee_variation_name: item.shopee_variation_name,
    shopee_variation_id: item.shopee_variation_id,
    shopee_sku_code: item.shopee_sku_code,
    original_price: item.original_price,
    sale_price: item.sale_price,
    quantity: 1,
    return_quantity: 0,
    matched_package_id: item.matched_package_id,
    matched_plan_id: item.matched_plan_id,
    matched_copies: item.matched_copies,
    bc_sku_id: item.bc_sku_id,
    cost_cny: item.cost_cny,
    cost_twd: item.cost_twd,
    is_manual: item.is_manual,
    delivery_type: 'esim',
    bc_order_id: item.bc_order_id,
    bc_sub_order_id: item.bc_sub_order_id,
    bc_channel_order_id: item.bc_channel_order_id,
    bc_channel_sub_order_id: item.bc_channel_sub_order_id,
    lpa_code: c.lpa_code,
    qr_code_url: c.qr_code_url,
    iccid: c.iccid ? [c.iccid] : null,
    status: c.lpa_code || c.qr_code_url || c.iccid ? 'bc_ordered' : 'matched',
  }))

  const { error: insertErr } = await supabase.from('shopee_order_items').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const { error: deleteErr } = await supabase.from('shopee_order_items').delete().eq('id', itemId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, mode: 'split', count: rows.length })
}
