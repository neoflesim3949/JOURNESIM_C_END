'use client'

import { useEffect, useState } from 'react'
import { Save, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import HtmlEditor from '@/components/admin/html-editor'

interface Article {
  slug: string
  title: string
  content: string
  updated_at?: string | null
}

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  // 編輯緩衝：slug → { title, content }
  const [edits, setEdits] = useState<Record<string, { title: string; content: string }>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/articles')
    if (res.ok) {
      const data: Article[] = await res.json()
      setArticles(data)
      setEdits(Object.fromEntries(data.map(a => [a.slug, { title: a.title, content: a.content }])))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function setEdit(slug: string, field: 'title' | 'content', value: string) {
    setEdits(prev => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }))
  }

  async function save(slug: string) {
    setSavingSlug(slug)
    const e = edits[slug]
    const res = await fetch('/api/admin/articles', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title: e.title, content: e.content }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '儲存失敗') }
    await load()
    setSavingSlug(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">文章管理</h1>
      <p className="text-sm text-gray-500 mt-1">編輯網站政策頁內容（隱私權政策 / 服務條款 / 退換貨政策 / 反詐騙宣導）。內容支援換行，前台會原樣呈現。</p>

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">載入中...</p>
      ) : (
        <div className="mt-6 space-y-3">
          {articles.map(a => {
            const open = openSlug === a.slug
            const e = edits[a.slug] || { title: a.title, content: a.content }
            return (
              <div key={a.slug} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setOpenSlug(open ? null : a.slug)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="font-medium">{a.title}</span>
                    <span className="text-xs text-gray-400 font-mono">/{a.slug}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.updated_at && <span className="text-xs text-gray-400">更新：{new Date(a.updated_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>}
                    <a href={`/${a.slug}`} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">前台檢視 <ExternalLink className="w-3 h-3" /></a>
                  </div>
                </button>
                {open && (
                  <div className="px-5 pb-5 border-t border-gray-100 space-y-3">
                    <div className="mt-3">
                      <label className="text-xs text-gray-500">標題</label>
                      <input value={e.title} onChange={ev => setEdit(a.slug, 'title', ev.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">內容</label>
                      <div className="mt-1">
                        <HtmlEditor key={a.slug} value={e.content} onChange={html => setEdit(a.slug, 'content', html)} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => save(a.slug)} disabled={savingSlug === a.slug}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        <Save className="w-4 h-4" /> {savingSlug === a.slug ? '儲存中...' : '儲存'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
