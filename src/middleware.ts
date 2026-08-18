import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'

// RSP 動態轉址：rspN.flesim.com/gsma/* → rsp_domains 表對應的目標主機
// 查表失敗/查無對應時回退 BC 預設主機，確保 eSIM 下載永遠不斷
const RSP_FALLBACK_HOST = 'rsp.billionconnect.com'

// 從 handleNotification body 解出 ICCID：
// body 是 JSON，內含 base64 的 DER（profileInstallationResult），ICCID 的 DER 標籤為 0x5A、長度 0x0A（10 bytes BCD、半位元組對調）
// 掃描所有 base64 欄位找 5A 0A 標籤並驗證解碼後以 89（電信 ICCID 前綴）開頭
function extractIccidFromBody(bodyText: string): string | null {
  try {
    const json = JSON.parse(bodyText)
    const b64s: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string' && v.length > 20 && /^[A-Za-z0-9+/=]+$/.test(v)) b64s.push(v)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(json)
    for (const b64 of b64s) {
      let bin: string
      try { bin = atob(b64) } catch { continue }
      for (let i = 0; i + 12 <= bin.length; i++) {
        if (bin.charCodeAt(i) !== 0x5a || bin.charCodeAt(i + 1) !== 0x0a) continue
        // 10 bytes BCD 半位元組對調 → 20 位數字
        let digits = ''
        for (let j = 0; j < 10; j++) {
          const b = bin.charCodeAt(i + 2 + j)
          digits += (b & 0x0f).toString(16) + ((b >> 4) & 0x0f).toString(16)
        }
        digits = digits.replace(/f+$/i, '')  // 奇數長度的 F 填充
        if (/^89\d{16,18}$/.test(digits)) return digits
      }
    }
  } catch { /* 非 JSON 或解析失敗 */ }
  return null
}

async function handleRspRedirect(request: NextRequest, event: NextFetchEvent, subdomain: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  let targetHost = RSP_FALLBACK_HOST
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rsp_domains?subdomain=eq.${subdomain}&select=target_host,is_active`,
      { headers },
    )
    const rows = await res.json()
    if (Array.isArray(rows) && rows[0]?.is_active && rows[0].target_host) targetHost = rows[0].target_host
  } catch { /* 回退預設 */ }

  // 每個動作完整紀錄：讀出 body 存檔（302 不轉送 body、LPA 會對目標重發，讀掉不影響轉址）
  // handleNotification（安裝結果回報）另從 body 解出本次安裝的 ICCID
  const pathWithQuery = request.nextUrl.pathname + request.nextUrl.search
  let bodyText: string | null = null
  let iccid: string | null = null
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      bodyText = await request.text()
      if (request.nextUrl.pathname.includes('handleNotification')) iccid = extractIccidFromBody(bodyText)
    } catch { /* 讀不到就留空 */ }
  }

  // 收到的 RSP 請求全紀錄（fire-and-forget，不拖慢轉址）
  event.waitUntil(
    fetch(`${supabaseUrl}/rest/v1/rsp_requests`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        subdomain,
        path: pathWithQuery.slice(0, 500),
        method: request.method,
        body: bodyText ? bodyText.slice(0, 8000) : null,
        user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
        target_host: targetHost,
        iccid,
      }),
    }).catch(() => {}),
  )

  return NextResponse.redirect(new URL(pathWithQuery, `https://${targetHost}`), 302)
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // /gsma/*（SM-DP+ 協定路徑）：只在 rspN.flesim.com 主機上動態轉址
  if (request.nextUrl.pathname.startsWith('/gsma')) {
    const host = (request.headers.get('host') || '').toLowerCase()
    const m = host.match(/^(rsp\d*)\.flesim\.com$/)
    if (m) return handleRspRedirect(request, event, m[1])
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// 需要登入的頁面 + RSP 協定路徑（動態轉址）
export const config = {
  matcher: ['/account/:path*', '/orders/:path*', '/gsma', '/gsma/:path*'],
}
