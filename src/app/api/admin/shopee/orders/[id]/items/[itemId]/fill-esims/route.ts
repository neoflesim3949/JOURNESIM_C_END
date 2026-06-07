import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 為一個 eSIM 品項一次填入多張卡，存於「同一筆」的 esim_cards 陣列（不拆 row）
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

  const hasAny = cleaned.some((c: { lpa_code: string | null; qr_code_url: string | null; iccid: string | null }) => c.lpa_code || c.qr_code_url || c.iccid)
  // 全部 ICCID（同步寫回 iccid 陣列，供安裝頁查找、收據/用量查詢沿用）
  const allIccids = cleaned.map((c: { iccid: string | null }) => c.iccid).filter((x: string | null): x is string => !!x)

  // 單張 → 維持單一欄位即可（不需 esim_cards）
  if (cleaned.length === 1) {
    const c = cleaned[0]
    const { error } = await supabase.from('shopee_order_items').update({
      lpa_code: c.lpa_code,
      qr_code_url: c.qr_code_url,
      iccid: c.iccid ? [c.iccid] : null,
      esim_cards: null,
      status: hasAny && !item.bc_order_id ? 'bc_ordered' : item.status,
    }).eq('id', itemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode: 'update', count: 1 })
  }

  // 多張 → 存於同一筆的 esim_cards 陣列，不拆 row
  // lpa_code/qr_code_url 同步存第一張作向後相容；iccid 陣列存全部
  const first = cleaned[0]
  const { error } = await supabase.from('shopee_order_items').update({
    esim_cards: cleaned,
    lpa_code: first.lpa_code,
    qr_code_url: first.qr_code_url,
    iccid: allIccids.length ? allIccids : null,
    status: hasAny && !item.bc_order_id ? 'bc_ordered' : item.status,
  }).eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, mode: 'cards', count: cleaned.length })
}
