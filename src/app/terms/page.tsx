import ArticleView from '@/components/article-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: '服務條款' }

export default function Page() {
  return <ArticleView slug="terms" fallbackTitle="服務條款" />
}
