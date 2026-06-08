import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// PUT — 編輯自設名稱（寫進 V2 選項主檔；皆依「選項ID」更新，名稱跟選項走）
// body: { account_id, type: 'product' | 'variation', key=選項ID, display_name }（空＝清為 null）
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, type, key } = body
  const name = (body.display_name || '').trim() || null
  if (!account_id || !key || (type !== 'product' && type !== 'variation')) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 })
  }
  const supabase = createAdminClient()

  const { error } = await supabase.from('shopee_product_options_v2')
    .update(type === 'product' ? { custom_product_name: name } : { custom_variation_name: name })
    .eq('account_id', account_id).eq('shopee_variation_id', String(key))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
