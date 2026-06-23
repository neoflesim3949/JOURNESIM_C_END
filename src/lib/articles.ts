import { createAdminClient } from '@/lib/supabase/admin'

export interface SiteArticle {
  slug: string
  title: string
  content: string
  updated_at?: string | null
}

// 取單篇文章（前台頁面用）
export async function getArticle(slug: string): Promise<SiteArticle | null> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('site_articles').select('slug, title, content, updated_at').eq('slug', slug).maybeSingle()
    return data || null
  } catch {
    return null
  }
}
