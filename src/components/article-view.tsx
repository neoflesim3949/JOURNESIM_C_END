import { getArticle } from '@/lib/articles'

// 前台文章頁（隱私權/服務條款/退換貨/反詐騙共用）
export default async function ArticleView({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  const article = await getArticle(slug)
  const title = article?.title || fallbackTitle
  const content = article?.content?.trim() || ''

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold">{title}</h1>
      {article?.updated_at && (
        <p className="mt-2 text-sm text-muted-foreground">
          最後更新：{new Date(article.updated_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
        </p>
      )}
      {content ? (
        <div className="prose prose-sm sm:prose max-w-none mt-8" dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <p className="mt-8 text-muted-foreground">內容尚未設定。</p>
      )}
    </div>
  )
}
