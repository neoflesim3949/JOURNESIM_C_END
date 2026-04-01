import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('productId')
  const countryCode = searchParams.get('countryCode')

  const supabase = createAdminClient()

  // 單一商品 + 套餐
  if (productId) {
    const [productRes, dailyRes, fixedRes] = await Promise.all([
      supabase.from('products').select('*').eq('id', productId).eq('is_active', true).single(),
      supabase.from('daily_plans').select('*').eq('product_id', productId).eq('is_active', true).order('daily_capacity_mb'),
      supabase.from('fixed_plans').select('*').eq('product_id', productId).eq('is_active', true).order('price'),
    ])

    if (!productRes.data) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 })
    }

    return NextResponse.json({
      ...productRes.data,
      daily_plans: dailyRes.data || [],
      fixed_plans: fixedRes.data || [],
    })
  }

  // 依國家查詢商品列表
  if (countryCode) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .order('sort_order')

    return NextResponse.json(data || [])
  }

  return NextResponse.json({ error: '請提供 productId 或 countryCode' }, { status: 400 })
}
