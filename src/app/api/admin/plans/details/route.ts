import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { getProducts } from '@/lib/billionconnect'

// GET — 即時呼叫 F002 取得單一 SKU 的詳細資訊（含 country_data 內的 APN / operator / IP）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const skuId = searchParams.get('sku_id') || ''
  const salesMethod = searchParams.get('sales_method') || ''
  const language = searchParams.get('language') || '1'

  if (!skuId || !salesMethod) {
    return NextResponse.json({ error: '需要 sku_id 與 sales_method' }, { status: 400 })
  }

  try {
    const products = await getProducts({ salesMethod, skuId, language, networkOperatorScope: '2' })
    const product = (products || []).find(p => p.skuId === skuId) || products?.[0]
    if (!product) return NextResponse.json({ error: '查無此商品' }, { status: 404 })

    return NextResponse.json({
      skuId: product.skuId,
      name: product.name,
      countries: product.country || [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `F002 失敗：${msg}` }, { status: 500 })
  }
}
