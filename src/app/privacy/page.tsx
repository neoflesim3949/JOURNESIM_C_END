import ArticleView from '@/components/article-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: '隱私權政策' }

export default function Page() {
  return <ArticleView slug="privacy" fallbackTitle="隱私權政策" />
}
