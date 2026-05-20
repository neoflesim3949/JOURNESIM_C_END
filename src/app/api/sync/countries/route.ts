import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 建立 countries 同步任務（單一 step 完成）
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('sync_jobs').insert({
    type: 'countries',
    status: 'running',
    step_current: 0,
    step_total: 1,
    step_label: '等待開始',
  }).select('id').single()

  if (error) return NextResponse.json({ error: `建立任務失敗：${error.message}` }, { status: 500 })

  return NextResponse.json({ job_id: data.id, step_total: 1 })
}
