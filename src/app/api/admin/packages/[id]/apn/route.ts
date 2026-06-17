import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 點擊時才撈：從套餐內 BC 商品的 country_data，整理出 APN / 電信商
// 只看套餐設定的國家(MCC)；未設定國家則看全部
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: pkg } = await supabase.from('packages').select('countries').eq('id', id).maybeSingle()
  const mccFilter = Array.isArray(pkg?.countries) ? new Set((pkg!.countries as string[]).map(s => String(s).toUpperCase())) : null

  const { data: plans } = await supabase.from('package_plans').select('bc_sku_id').eq('package_id', id)
  const skuIds = [...new Set((plans || []).map(p => p.bc_sku_id).filter(Boolean))]

  const apnSet = new Set<string>(); const opSet = new Set<string>()
  for (let from = 0; from < skuIds.length; from += 300) {
    const { data } = await supabase.from('bc_products').select('country_data').in('sku_id', skuIds.slice(from, from + 300))
    for (const b of data || []) {
      for (const c of (b.country_data as { mcc?: string; apn?: string; operatorInfo?: unknown }[] | null) || []) {
        if (mccFilter && !mccFilter.has(String(c.mcc || '').toUpperCase())) continue
        if (c.apn) apnSet.add(c.apn)
        const oi = c.operatorInfo
        if (typeof oi === 'string' && oi.trim()) opSet.add(oi.trim())
        else if (Array.isArray(oi)) for (const o of oi as { operator?: string }[]) if (o?.operator) opSet.add(o.operator)
      }
    }
  }
  const apns = [...apnSet]; const operators = [...opSet]
  const synced_at = new Date().toISOString()
  // 存快照到套餐，之後直接讀不再重算
  await supabase.from('packages').update({ apns, operators, apn_synced_at: synced_at }).eq('id', id)
  return NextResponse.json({ apns, operators, synced_at })
}
