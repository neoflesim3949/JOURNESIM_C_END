import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// PUT — 編輯 V2 選項主檔欄位
// 自設名稱：{ account_id, type:'product'|'variation', key=選項ID, display_name }（依選項ID）
// 主商品貨號：{ account_id, type:'main_sku', key=商品ID, display_name }（套用該商品所有選項）
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, type, key } = body
  const val = (body.display_name || '').trim() || null
  if (!account_id || !key) return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const supabase = createAdminClient()

  const now = new Date().toISOString()
  if (type === 'main_sku') {
    // 主商品貨號：手填，套用到該商品所有選項
    const { error } = await supabase.from('shopee_product_options_v2')
      .update({ main_sku_code: val, updated_at: now }).eq('account_id', account_id).eq('shopee_product_id', String(key))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type !== 'product' && type !== 'variation') return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const { error } = await supabase.from('shopee_product_options_v2')
    .update(type === 'product' ? { custom_product_name: val, updated_at: now } : { custom_variation_name: val, updated_at: now })
    .eq('account_id', account_id).eq('shopee_variation_id', String(key))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
