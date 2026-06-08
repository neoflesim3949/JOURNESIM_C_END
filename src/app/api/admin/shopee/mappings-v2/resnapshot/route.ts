import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchBcMap, snapshotFor } from '@/lib/bc-snapshot'

// POST — 確認 BC 變更：把指定選項的 BC 品名/成本快照更新成現況（清除紅色警示）
// body: { account_id, ids: string[] }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { account_id, ids } = body
  if (!account_id || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 })
  }
  const supabase = createAdminClient()

  const { data: opts } = await supabase.from('shopee_product_options_v2')
    .select('id, bc_sku_id, copies').eq('account_id', account_id).in('id', ids).not('bc_sku_id', 'is', null)
  const list = opts || []
  if (list.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const bcMap = await fetchBcMap(supabase, list.map(o => o.bc_sku_id))
  let count = 0
  for (let i = 0; i < list.length; i += 25) {
    const chunk = list.slice(i, i + 25)
    const results = await Promise.all(chunk.map(async o => {
      const { error } = await supabase.from('shopee_product_options_v2')
        .update({ ...snapshotFor(bcMap.get(o.bc_sku_id), o.copies), updated_at: new Date().toISOString() })
        .eq('id', o.id)
      return error ? 0 : 1
    }))
    count += results.filter(Boolean).length
  }
  return NextResponse.json({ ok: true, count })
}
