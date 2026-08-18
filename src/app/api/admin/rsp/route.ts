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

// ── ES9+ body 解碼對照：Base64 → DER，抽出可讀關鍵欄位（不是解密，是解編碼）──
function bcdSwap(buf: Buffer): string {
  let s = ''
  for (const b of buf) s += (b & 0x0f).toString(16) + ((b >> 4) & 0x0f).toString(16)
  return s.replace(/f+$/i, '')
}
function derIccid(buf: Buffer): string | null {
  for (let i = 0; i + 12 <= buf.length; i++) {
    if (buf[i] === 0x5a && buf[i + 1] === 0x0a) {
      const v = bcdSwap(buf.subarray(i + 2, i + 12))
      if (/^89\d{16,18}$/.test(v)) return v
    }
  }
  return null
}
function derStrings(buf: Buffer, min = 5): string[] {
  const out: string[] = []; let cur = ''
  for (const b of buf) {
    if (b >= 0x20 && b <= 0x7e) cur += String.fromCharCode(b)
    else { if (cur.length >= min) out.push(cur); cur = '' }
  }
  if (cur.length >= min) out.push(cur)
  return [...new Set(out)]
}
// 回傳 [{ label, value }]，供後台右欄對照顯示
function decodeRspBody(path: string, body: string | null): { label: string; value: string }[] {
  const action = path.split('?')[0].split('/').filter(Boolean).pop() || ''
  const out: { label: string; value: string }[] = []
  if (!body) {
    if (action === '__check') out.push({ label: '說明', value: '後台檢測請求（非手機安裝）' })
    return out
  }
  let json: Record<string, unknown>
  try { json = JSON.parse(body) } catch { return out }

  const b64ToBuf = (v: unknown): Buffer | null => {
    if (typeof v !== 'string' || !/^[A-Za-z0-9+/=]{20,}$/.test(v) || v.length % 4 !== 0) return null
    try { return Buffer.from(v, 'base64') } catch { return null }
  }
  // 各動作挑重點欄位
  if (action === 'initiateAuthentication') {
    if (typeof json.smdpAddress === 'string') out.push({ label: 'SM-DP+ 位址', value: json.smdpAddress })
    if (b64ToBuf(json.euiccChallenge)) out.push({ label: '手機挑戰碼', value: '16 bytes 隨機（防重放）' })
  } else if (action === 'authenticateClient') {
    const buf = b64ToBuf(json.authenticateServerResponse)
    if (buf) {
      const strs = derStrings(buf)
      const addr = strs.find(s => /flesim|billionconnect|rsp/i.test(s))
      if (addr) out.push({ label: 'SM-DP+ 位址', value: addr })
      const eum = strs.find(s => /Giesecke|Thales|Gemalto|IDEMIA|G\+D|Sm@rtSIM|EUM|SIM/i.test(s))
      if (eum) out.push({ label: 'eUICC 廠商/型號', value: eum })
      const prod = strs.find(s => /^[A-Z]{2}-[A-Z]{2}-/.test(s))
      if (prod) out.push({ label: '產品識別碼', value: prod })
    }
  } else if (action === 'getBoundProfilePackage') {
    out.push({ label: 'Profile 內容', value: '🔒 加密（僅手機晶片可解，中途不可見）' })
  } else if (action === 'handleNotification') {
    const buf = b64ToBuf(json.pendingNotification)
    if (buf) {
      const ic = derIccid(buf)
      if (ic) out.push({ label: '安裝卡號 ICCID', value: ic })
      const addr = derStrings(buf).find(s => /flesim|billionconnect|rsp/i.test(s))
      if (addr) out.push({ label: '回報對象', value: addr })
    }
  }
  return out
}

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

  // 附上每筆的「可讀對照」（Base64/DER 解析出的關鍵欄位）
  const withDecoded = (recent || []).map(r => ({ ...r, decoded: decodeRspBody(r.path, r.body) }))

  return NextResponse.json({ domains: domains || [], stats, recent: withDecoded })
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
