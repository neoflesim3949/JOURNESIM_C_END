import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// PUT — 編輯自設名稱（寫回 V1 id-mappings 表，標籤/收據共用）
// body: { type: 'product' | 'variation', key, display_name }（display_name 空＝清除）
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { type, key } = body
  const name = (body.display_name || '').trim()
  if (!key || (type !== 'product' && type !== 'variation')) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 })
  }
  const table = type === 'product' ? 'shopee_product_id_mappings' : 'shopee_variation_id_mappings'
  const col = type === 'product' ? 'shopee_product_id' : 'shopee_variation_id'
  const supabase = createAdminClient()

  if (!name) {
    const { error } = await supabase.from(table).delete().eq(col, String(key))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cleared: true })
  }

  const { error } = await supabase.from(table)
    .upsert({ [col]: String(key), display_name: name }, { onConflict: col })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
