import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 批量操作選項
// body: { account_id, ids: string[], action: 'set_price' | 'delete', price?: number|null }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, ids, action } = body
  if (!account_id || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '缺少參數' }, { status: 400 })
  }
  const supabase = createAdminClient()

  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    if (action === 'delete') {
      const { error } = await supabase.from('shopee_product_options_v2')
        .delete().eq('account_id', account_id).in('id', chunk)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (action === 'set_price') {
      const price = body.price === null || body.price === '' ? null : Number(body.price)
      const { error } = await supabase.from('shopee_product_options_v2')
        .update({ price_override: price, updated_at: new Date().toISOString() })
        .eq('account_id', account_id).in('id', chunk)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true, count: ids.length })
}
