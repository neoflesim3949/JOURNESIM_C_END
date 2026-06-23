import ArticleView from '@/components/article-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: '退換貨政策' }

export default function Page() {
  return <ArticleView slug="refund-policy" fallbackTitle="退換貨政策" />
}
