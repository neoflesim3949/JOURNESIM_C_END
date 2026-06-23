import ArticleView from '@/components/article-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: '反詐騙宣導' }

export default function Page() {
  return <ArticleView slug="anti-fraud" fallbackTitle="反詐騙宣導" />
}
