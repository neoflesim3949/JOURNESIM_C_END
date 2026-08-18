import { NextResponse } from 'next/server'
import { resolveCname } from 'node:dns/promises'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// RSP 管理（rsp_domains / rsp_requests）
// GET                → 子網域清單＋各自請求統計＋最近請求
// GET ?action=check&subdomain=rspN → CNAME + 端對端轉址檢測
// POST / PATCH / DELETE → 維護子網域對應

const SUB_RE = /^rsp\d*$/
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)

  // ─── 檢測：DNS CNAME ＋ 實際打一次 /gsma 驗證 302 到目標 ───
  if (searchParams.get('action') === 'check') {
    const sub = (searchParams.get('subdomain') || '').trim()
    if (!SUB_RE.test(sub)) return NextResponse.json({ error: '子網域格式錯誤' }, { status: 400 })
    const host = `${sub}.flesim.com`

    // 1) DNS CNAME
    let cnameOk = false, cnameValue = ''
    try {
      const records = await resolveCname(host)
      cnameValue = (records || []).join(', ')
      cnameOk = records.some(r => r.includes('vercel-dns'))
    } catch (e) {
      cnameValue = e instanceof Error ? e.message : String(e)
    }

    // 2) 端對端：打 /gsma/__check 應回 302 且 Location 指向目標主機（驗 DNS+Vercel+middleware+對應一次到位）
    let redirectOk = false, location = '', e2eError = ''
    try {
      const res = await fetch(`https://${host}/gsma/__check`, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
      location = res.headers.get('location') || ''
      redirectOk = res.status === 302 && !!location
    } catch (e) {
      e2eError = e instanceof Error ? e.message : String(e)
    }

    return NextResponse.json({
      host,
      cname: { ok: cnameOk, value: cnameValue },
      redirect: { ok: redirectOk, location, error: e2eError || undefined },
      ok: cnameOk && redirectOk,
    })
  }

  // ─── 清單＋統計 ───
  const supabase = createAdminClient()
  const { data: domains } = await supabase.from('rsp_domains').select('*').order('subdomain')
  const stats: Record<string, { count: number; last: string | null }> = {}
  for (const d of domains || []) {
    const { count } = await supabase.from('rsp_requests')
      .select('id', { count: 'exact', head: true }).eq('subdomain', d.subdomain)
    const { data: last } = await supabase.from('rsp_requests')
      .select('created_at').eq('subdomain', d.subdomain)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    stats[d.subdomain] = { count: count || 0, last: last?.created_at || null }
  }
  const { data: recent } = await supabase.from('rsp_requests')
    .select('subdomain, path, method, body, user_agent, target_host, iccid, created_at')
    .order('created_at', { ascending: false }).limit(50)

  return NextResponse.json({ domains: domains || [], stats, recent: recent || [] })
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const sub = String(body.subdomain || '').trim().toLowerCase()
  const target = String(body.target_host || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!SUB_RE.test(sub)) return NextResponse.json({ error: '子網域限 rsp 或 rsp+數字（如 rsp1、rsp2）' }, { status: 400 })
  if (!HOST_RE.test(target)) return NextResponse.json({ error: '目標主機格式錯誤（只填主機名，如 rsp.billionconnect.com）' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('rsp_domains').insert({
    subdomain: sub, target_host: target, note: String(body.note || '').trim() || null,
  }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `子網域「${sub}」已存在` }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, domain: data })
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.target_host !== undefined) {
    const t = String(body.target_host).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!HOST_RE.test(t)) return NextResponse.json({ error: '目標主機格式錯誤' }, { status: 400 })
    updates.target_host = t
  }
  if (body.note !== undefined) updates.note = String(body.note).trim() || null
  if (body.is_active !== undefined) updates.is_active = !!body.is_active
  const supabase = createAdminClient()
  const { error } = await supabase.from('rsp_domains').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('rsp_domains').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
