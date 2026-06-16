import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET ?sku_id= — 取單一 BC 商品完整資料（給詳情彈窗用）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const skuId = (new URL(request.url).searchParams.get('sku_id') || '').trim()
  if (!skuId) return NextResponse.json({ error: '缺少 sku_id' }, { status: 400 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('bc_products').select('*').eq('sku_id', skuId).maybeSingle()
  if (!data) return NextResponse.json({ error: '找不到此 BC 商品' }, { status: 404 })
  return NextResponse.json({ product: data })
}
