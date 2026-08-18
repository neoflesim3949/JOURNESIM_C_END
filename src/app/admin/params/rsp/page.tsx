'use client'

import { Fragment, useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, ShieldCheck, RefreshCw } from 'lucide-react'

interface RspDomain {
  id: string
  subdomain: string
  target_host: string
  is_active: boolean
  note: string | null
  created_at: string
}
interface RspRequest { subdomain: string; path: string; method: string | null; body: string | null; user_agent: string | null; target_host: string | null; iccid: string | null; created_at: string }

// ES9+ 動作中文對照（路徑最後一段）
const RSP_ACTION_LABEL: Record<string, string> = {
  initiateAuthentication: '① 發起認證',
  authenticateClient: '② 驗證手機',
  getBoundProfilePackage: '③ 下載 Profile',
  handleNotification: '④ 安裝結果回報',
  cancelSession: '取消流程',
  __check: '後台檢測',
}
function rspAction(path: string): string {
  const seg = path.split('?')[0].split('/').filter(Boolean).pop() || ''
  return RSP_ACTION_LABEL[seg] || seg || '—'
}
interface CheckResult { host: string; cname: { ok: boolean; value: string }; redirect: { ok: boolean; location: string; error?: string }; ok: boolean }

export default function RspAdminPage() {
  const [domains, setDomains] = useState<RspDomain[]>([])
  const [stats, setStats] = useState<Record<string, { count: number; last: string | null }>>({})
  const [recent, setRecent] = useState<RspRequest[]>([])
  const [loading, setLoading] = useState(true)
  // 新增
  const [newSub, setNewSub] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newNote, setNewNote] = useState('')
  const [creating, setCreating] = useState(false)
  // 檢測
  const [checking, setChecking] = useState<string | null>(null)
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({})
  // 請求展開（看 body）
  const [expandedReq, setExpandedReq] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/rsp')
    if (res.ok) {
      const d = await res.json()
      setDomains(d.domains || []); setStats(d.stats || {}); setRecent(d.recent || [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    if (!newSub.trim() || !newTarget.trim()) { alert('請填子網域與目標主機'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/rsp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: newSub.trim(), target_host: newTarget.trim(), note: newNote.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '新增失敗'); return }
      setNewSub(''); setNewTarget(''); setNewNote('')
      alert(`已建立 ${d.domain.subdomain}.flesim.com → ${d.domain.target_host}\n\n記得完成兩步設定後按「檢測」驗證：\n1. Vercel 專案 Domains 加 ${d.domain.subdomain}.flesim.com（Connect to Production）\n2. DNS 加 CNAME ${d.domain.subdomain} → cname.vercel-dns.com`)
      load()
    } finally { setCreating(false) }
  }

  async function patch(id: string, updates: Record<string, unknown>) {
    const res = await fetch('/api/admin/rsp', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    const d = await res.json()
    if (!res.ok) { alert(d.error || '更新失敗'); return }
    load()
  }

  async function remove(d0: RspDomain) {
    if (!confirm(`確定刪除 ${d0.subdomain}.flesim.com 的對應？\n已發出去、使用此位址的 eSIM 安裝碼會無法下載（會回退預設 BC 主機）。`)) return
    const res = await fetch(`/api/admin/rsp?id=${d0.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) { alert(d.error || '刪除失敗'); return }
    load()
  }

  async function check(sub: string) {
    setChecking(sub)
    try {
      const res = await fetch(`/api/admin/rsp?action=check&subdomain=${sub}`)
      const d = await res.json()
      if (!res.ok) { alert(d.error || '檢測失敗'); return }
      setCheckResults(prev => ({ ...prev, [sub]: d }))
    } finally { setChecking(null) }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">RSP 管理</h1>
      <p className="mt-1 text-sm text-gray-500">
        eSIM 安裝碼品牌網域：rspN.flesim.com 的 SM-DP+ 協定請求（/gsma/*）動態轉到對應目標主機；所有收到的請求都會記錄
      </p>

      {/* 新增 */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">子網域（rsp / rsp1 / rsp2…）</label>
            <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="rsp1" spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-gray-500 mb-1">目標 RSP 主機 *</label>
            <input value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder="rsp.billionconnect.com" spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-gray-500 mb-1">備註</label>
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="供應商/用途（選填）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button onClick={create} disabled={creating}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} 建立
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          新子網域建立後需手動完成：① Vercel 專案 Domains 加 {'{子網域}'}.flesim.com（Connect to Production）② DNS 加 CNAME {'{子網域}'} → cname.vercel-dns.com，完成後按「檢測」驗證
        </p>
      </div>

      {/* 清單 */}
      {loading ? <p className="mt-6 text-sm text-gray-500">載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">品牌位址</th>
                <th className="px-3 py-2 text-left border-b">目標 RSP 主機</th>
                <th className="px-3 py-2 text-left border-b">備註</th>
                <th className="px-3 py-2 text-right border-b">請求數</th>
                <th className="px-3 py-2 text-left border-b">最後請求</th>
                <th className="px-3 py-2 text-left border-b">啟用</th>
                <th className="px-3 py-2 text-left border-b">檢測</th>
                <th className="px-3 py-2 border-b"></th>
              </tr>
            </thead>
            <tbody>
              {domains.map(d => {
                const st = stats[d.subdomain]
                const cr = checkResults[d.subdomain]
                return (
                  <tr key={d.id} className={`border-b hover:bg-gray-50 align-top ${!d.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{d.subdomain}.flesim.com</td>
                    <td className="px-3 py-2">
                      <input defaultValue={d.target_host} spellCheck={false}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.target_host) patch(d.id, { target_host: v }) }}
                        className="w-full px-2 py-1 border border-transparent hover:border-gray-300 focus:border-blue-400 rounded font-mono outline-none" />
                    </td>
                    <td className="px-3 py-2">
                      <input defaultValue={d.note || ''} placeholder="—"
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (d.note || '')) patch(d.id, { note: v }) }}
                        className="w-full px-2 py-1 border border-transparent hover:border-gray-300 focus:border-blue-400 rounded outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{(st?.count ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{st?.last ? new Date(st.last).toLocaleString('zh-TW') : '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => patch(d.id, { is_active: !d.is_active })}
                        className={`px-2 py-0.5 rounded-full text-[10px] ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                        {d.is_active ? '啟用中' : '已停用'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => check(d.subdomain)} disabled={checking === d.subdomain}
                        className="flex items-center gap-1 px-2 py-1 border border-blue-300 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap">
                        <ShieldCheck className="w-3.5 h-3.5" /> {checking === d.subdomain ? '檢測中…' : '檢測'}
                      </button>
                      {cr && (
                        <div className="mt-1.5 space-y-0.5 text-[10px]">
                          <div className={cr.cname.ok ? 'text-green-600' : 'text-red-500'} title={cr.cname.value}>
                            {cr.cname.ok ? '✓ CNAME 已指向 Vercel' : `✗ CNAME 未設定/錯誤（${cr.cname.value.slice(0, 60)}）`}
                          </div>
                          <div className={cr.redirect.ok ? 'text-green-600' : 'text-red-500'} title={cr.redirect.location || cr.redirect.error || ''}>
                            {cr.redirect.ok ? `✓ 轉址正常 → ${cr.redirect.location.replace('https://', '').split('/')[0]}` : `✗ 轉址失敗（${(cr.redirect.error || '無 302 回應').slice(0, 60)}）`}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(d)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 最近請求 */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">最近 RSP 請求（50 筆）</h2>
          <button onClick={load} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> 重新整理
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">尚無紀錄（手機安裝 eSIM 時的協定請求會出現在這裡）</p>
        ) : (
          <table className="mt-3 w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left border-b">時間</th>
                <th className="px-2 py-1.5 text-left border-b">動作</th>
                <th className="px-2 py-1.5 text-left border-b">子網域</th>
                <th className="px-2 py-1.5 text-left border-b">路徑</th>
                <th className="px-2 py-1.5 text-left border-b">ICCID（安裝回報）</th>
                <th className="px-2 py-1.5 text-left border-b">轉往</th>
                <th className="px-2 py-1.5 text-left border-b">UA</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => {
                const expanded = expandedReq.has(i)
                return (
                  <Fragment key={i}>
                    <tr className="border-b cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedReq(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.created_at).toLocaleString('zh-TW')}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-medium">{rspAction(r.path)}</td>
                      <td className="px-2 py-1.5 font-mono">{r.subdomain}</td>
                      <td className="px-2 py-1.5 font-mono max-w-xs truncate" title={r.path}>{r.method ? `${r.method} ` : ''}{r.path}</td>
                      <td className="px-2 py-1.5 font-mono">{r.iccid ? <span className="text-emerald-700 font-semibold">{r.iccid}</span> : '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{r.target_host || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-500 max-w-[200px] truncate" title={r.user_agent || ''}>{r.user_agent || '—'}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-b bg-gray-50">
                        <td colSpan={7} className="px-3 py-2">
                          <div className="text-[10px] text-gray-500 mb-1">Request Body{r.body && r.body.length >= 8000 ? '（已截斷至 8000 字元）' : ''}</div>
                          <pre className="text-[10px] bg-white border border-gray-200 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all font-mono">
                            {r.body ? (() => { try { return JSON.stringify(JSON.parse(r.body), null, 2) } catch { return r.body } })() : '（無 body：GET 請求或未記錄）'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
