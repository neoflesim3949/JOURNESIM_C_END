import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 取得所有商品ID和規格ID對應（含蝦皮商品名稱 from order items）
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const [{ data: products }, { data: variations }] = await Promise.all([
    supabase.from('shopee_product_id_mappings').select('*').order('created_at', { ascending: false }),
    supabase.from('shopee_variation_id_mappings').select('*').order('created_at', { ascending: false }),
  ])

  // 從 shopee_order_items 撈蝦皮商品名稱
  const skuCodes = (products || []).map(p => p.shopee_product_id).filter(Boolean)
  const varIds = (variations || []).map(v => v.shopee_variation_id).filter(Boolean)

  let skuNameMap: Record<string, { product_name: string; variation_name: string }> = {}
  let varNameMap: Record<string, { product_name: string; variation_name: string }> = {}

  if (skuCodes.length > 0) {
    const { data: items } = await supabase.from('shopee_order_items')
      .select('shopee_sku_code, shopee_product_name, shopee_variation_name')
      .in('shopee_sku_code', skuCodes)
    for (const item of items || []) {
      if (item.shopee_sku_code && !skuNameMap[item.shopee_sku_code]) {
        skuNameMap[item.shopee_sku_code] = {
          product_name: item.shopee_product_name || '',
          variation_name: item.shopee_variation_name || '',
        }
      }
    }
  }

  if (varIds.length > 0) {
    const { data: items } = await supabase.from('shopee_order_items')
      .select('shopee_variation_id, shopee_product_name, shopee_variation_name')
      .in('shopee_variation_id', varIds)
    for (const item of items || []) {
      if (item.shopee_variation_id && !varNameMap[item.shopee_variation_id]) {
        varNameMap[item.shopee_variation_id] = {
          product_name: item.shopee_product_name || '',
          variation_name: item.shopee_variation_name || '',
        }
      }
    }
  }

  return NextResponse.json({
    products: products || [],
    variations: variations || [],
    skuNames: skuNameMap,
    varNames: varNameMap,
  })
}

// POST — 新增/更新對應
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  if (body.type === 'product') {
    await supabase.from('shopee_product_id_mappings').upsert({
      shopee_product_id: body.shopee_id,
      display_name: body.display_name,
    }, { onConflict: 'shopee_product_id' })
  } else if (body.type === 'variation') {
    await supabase.from('shopee_variation_id_mappings').upsert({
      shopee_variation_id: body.shopee_id,
      display_name: body.display_name,
    }, { onConflict: 'shopee_variation_id' })
  }

  return NextResponse.json({ ok: true })
}

// DELETE — 刪除對應
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { type, id } = await request.json()
  const supabase = createAdminClient()

  if (type === 'product') {
    await supabase.from('shopee_product_id_mappings').delete().eq('id', id)
  } else if (type === 'variation') {
    await supabase.from('shopee_variation_id_mappings').delete().eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
