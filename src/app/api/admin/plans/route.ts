import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ESIM_TYPES, SIM_TYPES, ESIM_SIM_ALL_TYPES } from '@/lib/bc-enums'

export async function GET(request: Request) {
  
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'esim'
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const search = searchParams.get('search') || ''
  const planType = searchParams.get('planType') || ''
  const productType = searchParams.get('productType') || ''
  const salesMethod = searchParams.get('salesMethod') || ''
  const rechargeable = searchParams.get('rechargeable') || ''

  const supabase = createAdminClient()

  let query = supabase.from('bc_products').select('*', { count: 'exact' })

  // 類型過濾
  // rechargeable_product='1' → eSIM 複充商品（不管 type 是什麼）
  // 同一商品可能同時出現在 SIM 和 eSIM 列表
  if (type === 'sim') {
    query = query.in('type', SIM_TYPES)
  } else if (type === 'acceleration') {
    // 加速包：(type 不在 eSIM+SIM 或 type IS NULL) 且 非複充商品
    query = query.or(`type.is.null,type.not.in.(${ESIM_SIM_ALL_TYPES.join(',')})`)
    query = query.or('rechargeable_product.is.null,rechargeable_product.neq.1')
  } else {
    // eSIM：type 在 eSIM 列表 或 rechargeable_product='1'（不管 type）
    query = query.or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
  }

  // 篩選：套餐類型
  if (planType) {
    query = query.eq('plan_type', planType)
  }

  // 篩選：商品子類型
  if (productType) {
    query = query.eq('type', productType)
  }

  // 篩選：銷售方式
  if (salesMethod) {
    query = query.eq('sales_method', salesMethod)
  }

  // 篩選：複充
  if (rechargeable === '1') {
    query = query.eq('rechargeable_product', '1')
  } else if (rechargeable === '0') {
    query = query.or('rechargeable_product.is.null,rechargeable_product.neq.1')
  }

  // 搜尋
  if (search) {
    // 先查 bc_countries 看搜尋詞是否匹配任何國家（MCC碼、簡繁英名稱）
    const { data: matchedCountries } = await supabase.from('bc_countries')
      .select('mcc')
      .or(`mcc.ilike.${search},name.ilike.%${search}%,name_zh.ilike.%${search}%,name_en.ilike.%${search}%`)

    const matchedMccs = (matchedCountries || []).map((c) => c.mcc.toUpperCase())

    if (matchedMccs.length > 0) {
      // 用 MCC 在 country_data 中搜尋
      const matchingSkus: string[] = []
      let mccFrom = 0
      while (true) {
        const { data: batch } = await supabase.from('bc_products')
          .select('sku_id, country_data')
          .range(mccFrom, mccFrom + 999)
        if (!batch || batch.length === 0) break
        for (const p of batch) {
          const countries = p.country_data as { mcc: string }[] | null
          if (countries?.some((c) => matchedMccs.includes(c.mcc.toUpperCase()))) {
            matchingSkus.push(p.sku_id)
          }
        }
        if (batch.length < 1000) break
        mccFrom += 1000
      }
      if (matchingSkus.length > 0) {
        query = query.in('sku_id', matchingSkus)
      } else {
        // 國家匹配了但沒有商品，也搜名稱
        query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
      }
    } else {
      // 非國家搜尋，用名稱和 SKU
      query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
    }
  }

  // 分頁
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.order('name').range(from, to)

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  })
}
