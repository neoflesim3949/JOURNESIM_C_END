import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mcc = searchParams.get('mcc')
  if (!mcc) return NextResponse.json([])

  const supabase = createAdminClient()

  // 取得關聯的套餐 IDs (修正橋接表名稱)
  const { data: links } = await supabase
    .from('country_packages')
    .select('package_id')
    .eq('mcc', mcc)

  const packageIds = [...new Set((links || []).map((l) => l.package_id))]
  if (packageIds.length === 0) return NextResponse.json([])

  // 取得套餐資訊 (使用正確的 packages 表)
  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, description, product_type, is_active')
    .in('id', packageIds)
    .eq('is_active', true)

  if (!packages || packages.length === 0) return NextResponse.json([])

  // 最低售價
  const { data: plans } = await supabase
    .from('package_plans').select('id, package_id').in('package_id', packageIds)
  const planIds = (plans || []).map((p) => p.id)
  const planToPkg = new Map((plans || []).map((p) => [p.id, p.package_id]))

  const lowestPrices = new Map<string, number>()
  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('package_plan_prices').select('package_plan_id, sell_price').in('package_plan_id', planIds).gt('sell_price', 0)
    for (const p of prices || []) {
      const pkgId = planToPkg.get(p.package_plan_id)
      if (!pkgId) continue
      const cur = lowestPrices.get(pkgId)
      if (!cur || p.sell_price < cur) lowestPrices.set(pkgId, p.sell_price)
    }
  }

  return NextResponse.json(packages.map((pkg) => ({
    id: pkg.id, name: pkg.name, description: pkg.description,
    product_type: pkg.product_type, lowest_price: lowestPrices.get(pkg.id) || null,
  })))
}
