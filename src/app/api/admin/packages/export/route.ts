import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

// GET — 匯出所有套餐組成（每列＝套餐內一個 BC SKU），欄位與匯入格式一致可回傳
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: packages } = await supabase.from('packages')
    .select('id, name, category, tags, product_type, sort_order').order('sort_order')
  const pkgs = packages || []

  const { data: plans } = await supabase.from('package_plans').select('package_id, bc_sku_id')
  const skuIds = [...new Set((plans || []).map(p => p.bc_sku_id))]
  const { data: bc } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, name').in('sku_id', skuIds)
    : { data: [] }
  const nameMap = new Map((bc || []).map(b => [b.sku_id, b.name]))
  const plansByPkg = new Map<string, string[]>()
  for (const p of plans || []) {
    const arr = plansByPkg.get(p.package_id) || []
    arr.push(p.bc_sku_id); plansByPkg.set(p.package_id, arr)
  }

  const rows: Record<string, string>[] = []
  for (const pkg of pkgs) {
    const tags = Array.isArray(pkg.tags) ? (pkg.tags as string[]).join(', ') : ''
    const skus = plansByPkg.get(pkg.id) || []
    if (skus.length === 0) {
      rows.push({ '套餐名稱': pkg.name, '分類': pkg.category || '', '標籤': tags, '類型': pkg.product_type, 'BC SKU': '', 'BC名稱': '' })
    } else {
      for (const sku of skus) {
        rows.push({ '套餐名稱': pkg.name, '分類': pkg.category || '', '標籤': tags, '類型': pkg.product_type, 'BC SKU': sku, 'BC名稱': nameMap.get(sku) || '' })
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows, { header: ['套餐名稱', '分類', '標籤', '類型', 'BC SKU', 'BC名稱'] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '套餐')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="packages_${rows.length}.xlsx"`,
    },
  })
}
