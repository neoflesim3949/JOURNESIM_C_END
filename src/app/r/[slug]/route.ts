import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 公開短網址轉址：/r/{slug} → target_url（302，可隨時改目的地）
// 點擊統計 fire-and-forget，不拖慢跳轉
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createAdminClient()
  const { data: link } = await supabase.from('redirect_links')
    .select('id, target_url, is_active').eq('slug', slug).maybeSingle()

  if (!link || !link.is_active || !link.target_url) {
    return NextResponse.redirect(new URL('/', request.url), 302)  // 無效短碼 → 回首頁
  }

  // 統計：原子累加 + 輕量點擊紀錄（不 await，避免拖慢跳轉）
  void supabase.rpc('increment_redirect_clicks', { p_link_id: link.id }).then(() => {})
  void supabase.from('redirect_clicks').insert({
    link_id: link.id,
    referer: request.headers.get('referer'),
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
  }).then(() => {})

  return NextResponse.redirect(link.target_url, 302)
}
