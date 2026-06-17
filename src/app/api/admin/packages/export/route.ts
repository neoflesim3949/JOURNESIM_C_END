import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx-js-style'

// GET — 匯出所有套餐組成（每列＝套餐內一個 BC SKU）
// 欄位：套餐名稱/國家/電信商/APN/分類/標籤/類型/BC SKU/BC名稱 + 各 copies 售價
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: packages } = await supabase.from('packages')
    .select('id, name, category, tags, product_type, countries, apns, operators, sort_order').order('sort_order')
  const pkgs = packages || []

  const { data: plans } = await supabase.from('package_plans').select('id, package_id, bc_sku_id').order('sort_order').order('created_at')
  const skuIds = [...new Set((plans || []).map(p => p.bc_sku_id))]
  const { data: bc } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, name').in('sku_id', skuIds)
    : { data: [] }
  const nameMap = new Map((bc || []).map(b => [b.sku_id, b.name]))

  // 售價：package_plan_id → (copies → sell_price)
  const planIds = (plans || []).map(p => p.id)
  const priceByPlan = new Map<string, Map<string, number>>()
  const copiesSet = new Set<number>()
  for (let i = 0; i < planIds.length; i += 300) {
    const { data } = await supabase.from('package_plan_prices').select('package_plan_id, copies, sell_price').in('package_plan_id', planIds.slice(i, i + 300))
    for (const pp of data || []) {
      const m = priceByPlan.get(pp.package_plan_id) || new Map<string, number>()
      m.set(String(pp.copies), Number(pp.sell_price) || 0); priceByPlan.set(pp.package_plan_id, m)
      const n = Number(pp.copies); if (!isNaN(n)) copiesSet.add(n)
    }
  }
  const copiesCols = [...copiesSet].sort((a, b) => a - b).map(String)

  // 每套餐的 plan 列表
  const plansByPkg = new Map<string, { id: string; sku: string }[]>()
  for (const p of plans || []) {
    const arr = plansByPkg.get(p.package_id) || []
    arr.push({ id: p.id, sku: p.bc_sku_id }); plansByPkg.set(p.package_id, arr)
  }

  // 國家 MCC → 中文名
  const allMccs = [...new Set(pkgs.flatMap(p => Array.isArray(p.countries) ? (p.countries as string[]) : []))]
  const { data: cRows } = allMccs.length
    ? await supabase.from('bc_countries').select('mcc, name, name_zh').in('mcc', allMccs)
    : { data: [] }
  const cMap = new Map((cRows || []).map(c => [c.mcc, c.name_zh || c.name]))

  // 每個套餐一個組別索引（用來上色）
  const rows: Record<string, string | number>[] = []
  const rowGroup: number[] = [] // 與 rows 對齊，記錄每列屬於第幾個套餐
  let gi = 0
  for (const pkg of pkgs) {
    const meta = {
      '套餐名稱': pkg.name,
      '國家': Array.isArray(pkg.countries) ? (pkg.countries as string[]).map(m => `${cMap.get(m) || m}（${m}）`).join('、') : '',
      '電信商': Array.isArray(pkg.operators) ? (pkg.operators as string[]).join('、') : '',
      'APN': Array.isArray(pkg.apns) ? (pkg.apns as string[]).join('、') : '',
      '分類': pkg.category || '',
      '標籤': Array.isArray(pkg.tags) ? (pkg.tags as string[]).join(', ') : '',
      '類型': pkg.product_type,
    }
    const list = plansByPkg.get(pkg.id) || []
    if (list.length === 0) {
      rows.push({ ...meta, 'BC SKU': '', 'BC名稱': '' }); rowGroup.push(gi)
    } else {
      for (const pl of list) {
        const prices = priceByPlan.get(pl.id)
        const row: Record<string, string | number> = { ...meta, 'BC SKU': pl.sku, 'BC名稱': nameMap.get(pl.sku) || '' }
        for (const c of copiesCols) { const v = prices?.get(c); if (v) row[c] = v }
        rows.push(row); rowGroup.push(gi)
      }
    }
    gi++
  }

  const header = ['套餐名稱', '國家', '電信商', 'APN', '分類', '標籤', '類型', 'BC SKU', 'BC名稱', ...copiesCols]
  const ws = XLSX.utils.json_to_sheet(rows, { header })

  // 一組一色（交替柔色），標頭灰底粗體
  const palette = ['FFFFFF', 'FFF3E0', 'E3F2FD', 'E8F5E9', 'F3E5F5', 'FFFDE7', 'FCE4EC']
  const headerStyle = { fill: { patternType: 'solid', fgColor: { rgb: '000000' } }, font: { bold: true, color: { rgb: 'FFFFFF' } } }
  for (let c = 0; c < header.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[ref]) ws[ref].s = headerStyle
  }
  for (let i = 0; i < rows.length; i++) {
    const color = palette[rowGroup[i] % palette.length]
    if (color === 'FFFFFF') continue
    for (let c = 0; c < header.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c })
      if (!ws[ref]) ws[ref] = { t: 's', v: '' }
      ws[ref].s = { fill: { patternType: 'solid', fgColor: { rgb: color } } }
    }
  }

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
