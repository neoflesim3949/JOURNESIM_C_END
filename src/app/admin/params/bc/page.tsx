'use client'

import { useEffect, useState } from 'react'
import { Save, Eye, EyeOff, Plug, Loader2, CheckCircle2, XCircle, Shield, Plus, Trash2 } from 'lucide-react'

interface Profile { id: string; name: string; url: string; appKey: string; appSecret: string }

export default function BcParamsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState('')
  const [env, setEnv] = useState<{ url: string; app_key: string; has_secret: boolean } | null>(null)
  const [showSecret, setShowSecret] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [testMode, setTestMode] = useState(false)

  async function load() {
    setLoading(true)
    const [res, sres] = await Promise.all([fetch('/api/admin/params/bc'), fetch('/api/admin/settings')])
    if (res.ok) { const d = await res.json(); setProfiles(d.profiles || []); setActiveId(d.active_id || (d.profiles?.[0]?.id ?? '')); setEnv(d.env) }
    if (sres.ok) { const s = await sres.json(); setTestMode((s.find((x: { key: string; value: string }) => x.key === 'test_mode')?.value) === 'true') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function newId() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) }
  function addProfile() {
    const id = newId()
    setProfiles(p => [...p, { id, name: `渠道 ${p.length + 1}`, url: env?.url || '', appKey: '', appSecret: '' }])
    if (!activeId) setActiveId(id)
  }
  function updateProfile(id: string, field: keyof Profile, value: string) {
    setProfiles(p => p.map(x => x.id === id ? { ...x, [field]: value } : x))
  }
  function removeProfile(id: string) {
    setProfiles(p => p.filter(x => x.id !== id))
    if (activeId === id) setActiveId(profiles.find(x => x.id !== id)?.id || '')
  }
  function toggleSecret(id: string) { setShowSecret(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function save() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/params/bc', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles, active_id: activeId }),
    })
    const d = await res.json()
    setMsg(res.ok ? { ok: true, text: '已儲存' } : { ok: false, text: d.error || '儲存失敗' })
    setSaving(false)
    if (res.ok) load()
  }

  async function runTest() {
    setTesting(true); setTest(null)
    // 先存目前設定再測作用中渠道
    await fetch('/api/admin/params/bc', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profiles, active_id: activeId }) })
    const res = await fetch('/api/admin/params/bc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active_id: activeId }) })
    const d = await res.json()
    if (d.ok) setTest({ ok: true, text: `連線成功 · 銷售餘額 ${d.balance?.saleBalance ?? d.balance?.availableBalance ?? d.balance?.accountBalance ?? '?'}` })
    else setTest({ ok: false, text: `連線失敗：${d.error || '未知錯誤'}` })
    setTesting(false)
  }

  async function toggleTestMode() {
    const next = !testMode
    setTestMode(next)
    await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: [{ key: 'test_mode', value: next ? 'true' : 'false' }] }) })
  }

  if (loading) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p>

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">BC 參數設定</h1>
      <p className="mt-1 text-sm text-gray-500">可預先建立多組渠道，下拉切換「使用中」；沒建任何渠道時用環境變數。改動後所有 BC 呼叫與回呼驗章都會用作用中渠道。</p>

      {/* 測試模式 */}
      <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-orange-500" />
            <div>
              <div className="font-medium">測試模式</div>
              <div className="text-xs text-gray-500">開啟時不會呼叫 BillionConnect API 建立真實訂單</div>
            </div>
          </div>
          <button onClick={toggleTestMode}
            className={`relative w-12 h-6 rounded-full transition-colors ${testMode ? 'bg-orange-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${testMode ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* 使用中渠道切換 */}
      <div className="mt-4 bg-white p-5 rounded-xl border border-gray-200">
        <label className="text-sm font-medium text-gray-700">使用中渠道</label>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <select value={activeId} onChange={e => setActiveId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-52">
            {profiles.length === 0 ? <option value="">（無，使用環境變數）</option>
              : profiles.map(p => <option key={p.id} value={p.id}>{p.name}（{p.appKey || '未填 KEY'}）</option>)}
          </select>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 儲存
          </button>
          <button onClick={runTest} disabled={testing || !profiles.length}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} 測試作用中渠道（F014）
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span>}
        </div>
        {test && (
          <div className={`mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${test.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {test.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {test.text}
          </div>
        )}
        {env && (
          <p className="mt-3 text-xs text-gray-400">環境變數預設：URL {env.url || '(未設)'} · KEY {env.app_key || '(未設)'} · SECRET {env.has_secret ? '已設' : '(未設)'}（沒建渠道時沿用）</p>
        )}
      </div>

      {/* 渠道清單 */}
      <div className="mt-4 space-y-3">
        {profiles.map(p => (
          <div key={p.id} className={`bg-white border rounded-xl p-5 space-y-3 ${p.id === activeId ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between gap-2">
              <input value={p.name} onChange={e => updateProfile(p.id, 'name', e.target.value)} placeholder="渠道名稱"
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium flex-1" />
              {p.id === activeId && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">使用中</span>}
              <button onClick={() => removeProfile(p.id)} className="p-2 text-gray-400 hover:text-rose-600" title="刪除渠道"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-xs text-gray-500">API 網址（BILLIONCONNECT_URL）</label>
              <input value={p.url} onChange={e => updateProfile(p.id, 'url', e.target.value)} placeholder="https://..."
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-500">渠道 ID / APP_KEY（x-channel-id）</label>
              <input value={p.appKey} onChange={e => updateProfile(p.id, 'appKey', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-500">簽章密鑰 / APP_SECRET</label>
              <div className="mt-1 relative">
                <input type={showSecret.has(p.id) ? 'text' : 'password'} value={p.appSecret} onChange={e => updateProfile(p.id, 'appSecret', e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm font-mono" />
                <button type="button" onClick={() => toggleSecret(p.id)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showSecret.has(p.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addProfile} className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-sm rounded-lg text-gray-600 hover:bg-gray-50 w-full justify-center">
          <Plus className="w-4 h-4" /> 新增渠道
        </button>
        <p className="text-xs text-amber-600">⚠ 密鑰存進資料庫，僅後台管理員可見。改完記得按「儲存」。</p>
      </div>
    </div>
  )
}
