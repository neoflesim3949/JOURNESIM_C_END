import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 建立 products 同步任務，回傳 job_id
// 實際工作由前端 polling /api/sync/products/step?job_id=... 推進
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  // step 1-6: salesMethod 1-6；step 7: 加速包
  const step_total = 7
  const { data, error } = await supabase.from('sync_jobs').insert({
    type: 'products',
    status: 'running',
    step_current: 0,
    step_total,
    step_label: '等待開始',
  }).select('id').single()

  if (error) return NextResponse.json({ error: `建立任務失敗：${error.message}` }, { status: 500 })

  return NextResponse.json({ job_id: data.id, step_total })
}
