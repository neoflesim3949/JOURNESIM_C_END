import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

const ALL_SALES_METHODS = ['1', '2', '3', '4', '5', '6']

// POST — 建立 products 同步任務，回傳 job_id
// 實際工作由前端 polling /api/sync/products/step?job_id=... 推進
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // 讀取已知失效的 salesMethod，跳過不再撈
  const { data: skipRow } = await supabase.from('system_settings').select('value').eq('key', 'bc_skip_sales_methods').maybeSingle()
  const skipList = String(skipRow?.value || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  const validSMs = ALL_SALES_METHODS.filter(sm => !skipList.includes(sm))

  // step 1..N: 有效的 salesMethod；step N+1: 加速包
  const step_total = validSMs.length + 1
  const { data, error } = await supabase.from('sync_jobs').insert({
    type: 'products',
    status: 'running',
    step_current: 0,
    step_total,
    step_label: skipList.length > 0 ? `等待開始（已排除 SM ${skipList.join(',')}）` : '等待開始',
  }).select('id').single()

  if (error) return NextResponse.json({ error: `建立任務失敗：${error.message}` }, { status: 500 })

  return NextResponse.json({ job_id: data.id, step_total, valid_sales_methods: validSMs, skipped_sales_methods: skipList })
}
