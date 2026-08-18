import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'

// RSP 動態轉址：rspN.flesim.com/gsma/* → rsp_domains 表對應的目標主機
// 查表失敗/查無對應時回退 BC 預設主機，確保 eSIM 下載永遠不斷
const RSP_FALLBACK_HOST = 'rsp.billionconnect.com'

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

  // 收到的 RSP 請求全紀錄（fire-and-forget，不拖慢轉址）
  const pathWithQuery = request.nextUrl.pathname + request.nextUrl.search
  event.waitUntil(
    fetch(`${supabaseUrl}/rest/v1/rsp_requests`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        subdomain,
        path: pathWithQuery.slice(0, 500),
        user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
        target_host: targetHost,
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
