import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 批量操作選項
// body: { account_id, ids: string[], action: 'delete' }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, ids, action } = body
  if (!account_id || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '缺少參數' }, { status: 400 })
  }
  const supabase = createAdminClient()

  if (action !== 'delete') return NextResponse.json({ error: '未知操作' }, { status: 400 })

  // 刪除前取得所屬商品 → 刪除後 bump 同商品其餘選項（刪除也算更新）
  const { data: rows } = await supabase.from('shopee_product_options_v2')
    .select('shopee_product_id').eq('account_id', account_id).in('id', ids)
  const productIds = [...new Set((rows || []).map(r => r.shopee_product_id).filter(Boolean))] as string[]

  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const { error } = await supabase.from('shopee_product_options_v2')
      .delete().eq('account_id', account_id).in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (let i = 0; i < productIds.length; i += 200) {
    await supabase.from('shopee_product_options_v2')
      .update({ updated_at: new Date().toISOString() })
      .eq('account_id', account_id).in('shopee_product_id', productIds.slice(i, i + 200))
  }

  return NextResponse.json({ ok: true, count: ids.length })
}
