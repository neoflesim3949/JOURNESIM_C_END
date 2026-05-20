import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCountries } from '@/lib/billionconnect'
import { translateCountryName, translateCountryNameEn, translateContinent, translateContinentEn } from '@/lib/country-translations'

export const maxDuration = 60

const BATCH_SIZE = 30

async function withRetry<T>(fn: () => Promise<T>, label: string, fallback: T, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn() }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isRetryable = /\b(522|502|503|504|1999|timeout|ECONNRESET|fetch failed)\b/i.test(msg) || /non-JSON|An error occurred|sorry|temporarily unavailable/i.test(msg)
      console.warn(`[BC retry] ${label} attempt ${attempt}/${maxAttempts} failed: ${msg}`)
      if (attempt === maxAttempts || !isRetryable) break
      await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 5000))
    }
  }
  return fallback
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { job_id } = await request.json() as { job_id: string }
  if (!job_id) return NextResponse.json({ error: 'job_id 必填' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: job } = await supabase.from('sync_jobs').select('*').eq('id', job_id).single()
  if (!job) return NextResponse.json({ error: '任務不存在' }, { status: 404 })
  if (job.type !== 'countries') return NextResponse.json({ error: '任務類型錯誤' }, { status: 400 })
  if (job.status !== 'running') return NextResponse.json({ error: `任務已結束 (status=${job.status})` }, { status: 400 })

  try {
    await supabase.from('sync_jobs').update({ step_label: '抓取國家清單' }).eq('id', job_id)
    const countries = await withRetry(() => getCountries('5'), 'F001 國家', [])
    if (countries.length === 0) throw new Error('F001 沒有回傳任何國家')

    const records = countries.map((c) => ({
      mcc: c.mcc,
      name: c.name,
      name_zh: translateCountryName(c.name),
      name_en: translateCountryNameEn(c.name),
      continent: c.continent,
      continent_zh: translateContinent(c.continent),
      continent_en: translateContinentEn(c.continent),
      flag_url: c.url || null,
    }))

    let synced = 0
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('bc_countries').upsert(batch, { onConflict: 'mcc' })
      if (error) throw new Error(`upsert 失敗：${error.message}${error.details ? ' / ' + error.details : ''}`)
      synced += batch.length
    }

    await supabase.from('sync_jobs').update({
      step_current: 1,
      step_label: `完成 (${synced} 筆)`,
      synced_count: synced,
      status: 'completed',
      finished_at: new Date().toISOString(),
    }).eq('id', job_id)

    return NextResponse.json({ done: true, step_current: 1, step_total: 1, synced_count: synced })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('sync_jobs').update({
      status: 'failed',
      error_message: msg,
      finished_at: new Date().toISOString(),
    }).eq('id', job_id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
