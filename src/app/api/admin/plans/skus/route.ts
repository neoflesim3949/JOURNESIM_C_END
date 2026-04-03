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

  const supabase = createAdminClient()

  // 分批拉取所有 SKU（繞過 Supabase 1000 筆限制）
  const allSkus: { sku_id: string; name: string }[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    let query = supabase
      .from('bc_products')
      .select('sku_id, name')

    if (type === 'sim') {
      query = query.in('type', SIM_TYPES)
    } else if (type === 'acceleration') {
      query = query.or(`type.is.null,type.not.in.(${ESIM_SIM_ALL_TYPES.join(',')})`)
      query = query.or('rechargeable_product.is.null,rechargeable_product.neq.1')
    } else {
      query = query.or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
    }

    query = query.order('sku_id').range(from, from + batchSize - 1)
    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break

    allSkus.push(...data)
    if (data.length < batchSize) break
    from += batchSize
  }

  return NextResponse.json({ skus: allSkus })
}
