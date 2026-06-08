import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// PUT — 編輯自設名稱（寫進 V2 選項主檔；商品名稱整個商品共用）
// body: { account_id, type: 'product' | 'variation', key, display_name }（display_name 空＝清為 null）
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, type, key } = body
  const name = (body.display_name || '').trim() || null
  if (!account_id || !key || (type !== 'product' && type !== 'variation')) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 })
  }
  const supabase = createAdminClient()

  const q = supabase.from('shopee_product_options_v2')
    .update(type === 'product' ? { custom_product_name: name } : { custom_variation_name: name })
    .eq('account_id', account_id)

  const { error } = type === 'product'
    ? await q.eq('shopee_product_id', String(key))        // 整個商品共用
    : await q.eq('shopee_variation_id', String(key))      // 該選項
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
