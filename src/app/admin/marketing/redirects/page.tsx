'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Loader2, ExternalLink } from 'lucide-react'

interface RedirectLink {
  id: string
  slug: string
  target_url: string
  title: string | null
  is_active: boolean
  clicks: number
  last_clicked_at: string | null
  created_at: string
}

export default function RedirectsPage() {
  const [links, setLinks] = useState<RedirectLink[]>([])
  const [loading, setLoading] = useState(true)
  // 新增表單
  const [newSlug, setNewSlug] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin.replace('localhost:3000', 'www.flesim.com').replace('http://', 'https://') : 'https://www.flesim.com'
  const shortUrl = (slug: string) => `${origin}/r/${slug}`

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/redirects')
    if (res.ok) { const d = await res.json(); setLinks(d.links || []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    if (!newTarget.trim()) { alert('請輸入目標網址'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/redirects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug.trim() || undefined, target_url: newTarget.trim(), title: newTitle.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '新增失敗'); return }
      setNewSlug(''); setNewTarget(''); setNewTitle('')
      load()
    } finally { setCreating(false) }
  }

  async function patch(id: string, updates: Record<string, unknown>) {
    const res = await fetch('/api/admin/redirects', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    const d = await res.json()
    if (!res.ok) { alert(d.error || '更新失敗'); return }
    load()
  }

  async function remove(link: RedirectLink) {
    if (!confirm(`確定刪除短網址 /r/${link.slug}？\n已印出的 QR/連結將全部失效，此操作無法復原。`)) return
    const res = await fetch(`/api/admin/redirects?id=${link.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) { alert(d.error || '刪除失敗'); return }
    load()
  }

  function copy(slug: string) {
    navigator.clipboard.writeText(shortUrl(slug)).then(() => {
      setCopied(slug)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">轉址短網址</h1>
      <p className="mt-1 text-sm text-gray-500">/r/短代碼 → 目標網址（302，可隨時改目的地不用重印），含點擊統計</p>

      {/* 新增 */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">短代碼（留空自動產生）</label>
            <input value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="例：jp2026" spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          </div>
          <div className="md:col-span-5">
            <label className="block text-xs text-gray-500 mb-1">目標網址 *</label>
            <input value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder="https://…" spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-gray-500 mb-1">備註</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="用途說明（選填）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button onClick={create} disabled={creating}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} 建立
            </button>
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? <p className="mt-6 text-sm text-gray-500">載入中...</p> : links.length === 0 ? (
        <div className="mt-6 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">尚無短網址</p>
        </div>
      ) : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">短網址</th>
                <th className="px-3 py-2 text-left border-b">目標網址</th>
                <th className="px-3 py-2 text-left border-b">備註</th>
                <th className="px-3 py-2 text-right border-b">點擊</th>
                <th className="px-3 py-2 text-left border-b">最後點擊</th>
                <th className="px-3 py-2 text-left border-b">啟用</th>
                <th className="px-3 py-2 border-b"></th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.id} className={`border-b hover:bg-gray-50 ${!l.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-600">/r/{l.slug}</span>
                      <button onClick={() => copy(l.slug)} title="複製完整短網址"
                        className="text-gray-400 hover:text-gray-700">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copied === l.slug && <span className="text-green-600 text-[10px]">已複製</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <div className="flex items-center gap-1.5">
                      <input defaultValue={l.target_url} spellCheck={false}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== l.target_url) patch(l.id, { target_url: v }) }}
                        className="flex-1 px-2 py-1 border border-transparent hover:border-gray-300 focus:border-blue-400 rounded font-mono text-[11px] outline-none truncate" />
                      <a href={l.target_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600 flex-shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input defaultValue={l.title || ''}
                      onBlur={e => { const v = e.target.value.trim(); if (v !== (l.title || '')) patch(l.id, { title: v }) }}
                      placeholder="—"
                      className="w-full px-2 py-1 border border-transparent hover:border-gray-300 focus:border-blue-400 rounded outline-none" />
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{l.clicks.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.last_clicked_at ? new Date(l.last_clicked_at).toLocaleString('zh-TW') : '—'}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => patch(l.id, { is_active: !l.is_active })}
                      className={`px-2 py-0.5 rounded-full text-[10px] ${l.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                      {l.is_active ? '啟用中' : '已停用'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(l)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
