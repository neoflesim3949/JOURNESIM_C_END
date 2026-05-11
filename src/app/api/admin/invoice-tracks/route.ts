import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 字軌列表 + 各組已用張數統計
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: tracks, error } = await supabase
    .from('invoice_tracks')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_start_month', { ascending: false })
    .order('track_prefix')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 統計每組字軌的實際開立、作廢、註銷數
  // 用 invoice_number 前綴比對
  const out = await Promise.all((tracks || []).map(async (t) => {
    const padded = `${t.track_prefix}`
    const { count: issuedCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `${padded}%`)
      .eq('status', 'issued')
    const { count: cancelledCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `${padded}%`)
      .eq('status', 'cancelled')
    const { count: voidedCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `${padded}%`)
      .eq('status', 'voided')
    const total = Number(t.end_number) - Number(t.start_number) + 1
    const used = Number(t.next_number) - Number(t.start_number)
    return {
      ...t,
      total_count: total,
      used_count: used,
      remaining_count: total - used,
      issued_count: issuedCount || 0,
      cancelled_count: cancelledCount || 0,
      voided_count: voidedCount || 0,
    }
  }))

  return NextResponse.json({ data: out })
}

// POST — 新增字軌
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const trackPrefix = String(body.track_prefix || '').trim().toUpperCase()
  const periodYear = Number(body.period_year)
  const periodStartMonth = Number(body.period_start_month)
  const startNum = Number(body.start_number)
  const endNum = Number(body.end_number)

  if (!/^[A-Z]{2}$/.test(trackPrefix)) return NextResponse.json({ error: '字軌須為兩個英文字母' }, { status: 400 })
  if (!Number.isInteger(periodYear) || periodYear < 100) return NextResponse.json({ error: '民國年錯誤' }, { status: 400 })
  if (![1, 3, 5, 7, 9, 11].includes(periodStartMonth)) return NextResponse.json({ error: '期別起月須為 1/3/5/7/9/11' }, { status: 400 })
  if (!Number.isInteger(startNum) || !Number.isInteger(endNum) || startNum > endNum) {
    return NextResponse.json({ error: '起號 / 迄號錯誤' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 若標 active，先把同條件的其他 active 取消
  if (body.is_active) {
    await supabase.from('invoice_tracks').update({ is_active: false })
      .eq('period_year', periodYear)
      .eq('period_start_month', periodStartMonth)
      .eq('intype', body.intype || null)
      .eq('tax_type', body.tax_type || null)
  }

  const { data, error } = await supabase.from('invoice_tracks').insert({
    track_prefix: trackPrefix,
    period_year: periodYear,
    period_start_month: periodStartMonth,
    period_end_month: periodStartMonth + 1,
    start_number: startNum,
    end_number: endNum,
    next_number: startNum,
    intype: body.intype || null,
    tax_type: body.tax_type || null,
    buyer_type: body.buyer_type || null,
    is_active: !!body.is_active,
    note: body.note || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, track: data })
}

// PATCH — 更新（含切換 active）
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()

  if (rest.is_active === true) {
    // 取得目標
    const { data: target } = await supabase.from('invoice_tracks').select('*').eq('id', id).single()
    if (target) {
      await supabase.from('invoice_tracks').update({ is_active: false })
        .eq('period_year', target.period_year)
        .eq('period_start_month', target.period_start_month)
        .eq('intype', target.intype)
        .eq('tax_type', target.tax_type)
    }
  }
  rest.updated_at = new Date().toISOString()
  const { error } = await supabase.from('invoice_tracks').update(rest).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — 刪字軌
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('invoice_tracks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
