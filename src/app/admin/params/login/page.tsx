'use client'

import { useEffect, useState } from 'react'
import { Save, ExternalLink } from 'lucide-react'

export default function AdminLoginSettingsPage() {
  const [settings, setSettings] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edited, setEdited] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch('/api/admin/settings').then((r) => r.json()).then((data) => {
      const map = new Map<string, string>()
      for (const row of data) map.set(row.key, row.value)
      setSettings(map)
      setLoading(false)
    })
  }, [])

  function getValue(key: string) {
    return edited.has(key) ? edited.get(key)! : settings.get(key) || ''
  }

  function handleChange(key: string, value: string) {
    setEdited((prev) => new Map(prev).set(key, value))
  }

  async function handleSave() {
    if (edited.size === 0) return
    setSaving(true)
    const updates = Array.from(edited.entries()).map(([key, value]) => ({ key, value }))
    await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setEdited(new Map())
    const res = await fetch('/api/admin/settings')
    if (res.ok) {
      const data = await res.json()
      const map = new Map<string, string>()
      for (const row of data) map.set(row.key, row.value)
      setSettings(map)
    }
    setSaving(false)
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  const callbackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/line/callback`
    : ''

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">登入管理</h1>
          <p className="mt-1 text-sm text-gray-500">管理社群登入方式</p>
        </div>
        {edited.size > 0 && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? '儲存中...' : `儲存（${edited.size} 項）`}
          </button>
        )}
      </div>

      {/* ========== LINE 登入 ========== */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596a.626.626 0 01-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.175-.508.433-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
            </div>
            <div>
              <h2 className="font-semibold">LINE 登入</h2>
              <div className="text-xs text-gray-500">使用 LINE 帳號快速登入</div>
            </div>
          </div>
          <button
            onClick={() => handleChange('login_line', getValue('login_line') === 'true' ? 'false' : 'true')}
            className={`relative w-12 h-6 rounded-full transition-colors ${getValue('login_line') === 'true' ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${getValue('login_line') === 'true' ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 設定步驟 */}
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <h3 className="text-xs font-semibold text-blue-700">步驟 1：建立 LINE Login Channel</h3>
              <p className="mt-1 text-xs text-blue-600">前往 LINE Developers Console → 建立 Provider → 建立 LINE Login channel → App types 勾 Web app</p>
              <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                打開 LINE Developers Console <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="p-3 bg-blue-50 rounded-lg">
              <h3 className="text-xs font-semibold text-blue-700">步驟 2：設定 Callback URL</h3>
              <p className="mt-1 text-xs text-blue-600">在 LINE channel 的 LINE Login tab → Callback URL 加入：</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 px-2 py-1 bg-white border border-blue-200 rounded text-xs font-mono select-all truncate">
                  {callbackUrl}
                </code>
                <button onClick={() => navigator.clipboard.writeText(callbackUrl)}
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200 whitespace-nowrap">複製</button>
              </div>
            </div>

            <div className="p-3 bg-blue-50 rounded-lg">
              <h3 className="text-xs font-semibold text-blue-700">步驟 3：填入 Channel ID 和 Secret</h3>
              <p className="mt-1 text-xs text-blue-600">在 LINE channel 的 Basic settings 頁面找到</p>
            </div>
          </div>

          {/* Channel 設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Channel ID</label>
              <input
                value={getValue('line_channel_id')}
                onChange={(e) => handleChange('line_channel_id', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="1234567890"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Channel Secret</label>
              <input
                type="password"
                value={getValue('line_channel_secret')}
                onChange={(e) => handleChange('line_channel_secret', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="abcdef1234567890"
              />
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="text-sm font-medium">登入按鈕 Icon（選填）</label>
            <div className="mt-1 flex gap-2">
              {getValue('login_line_icon') ? (
                <div className="flex items-center gap-2 flex-1 p-1.5 border border-gray-300 rounded">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getValue('login_line_icon')} alt="" className="w-6 h-6 object-contain" />
                  <span className="text-xs text-gray-400 truncate flex-1">{getValue('login_line_icon').split('/').pop()}</span>
                  <button onClick={() => handleChange('login_line_icon', '')} className="text-xs text-red-400">移除</button>
                </div>
              ) : (
                <input value={getValue('login_line_icon')} onChange={(e) => handleChange('login_line_icon', e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="貼上圖片 URL" />
              )}
              <a href="/admin/media" target="_blank" className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs text-gray-600 rounded whitespace-nowrap">圖片庫</a>
            </div>
          </div>

          {/* 加好友設定 */}
          <div>
            <label className="text-sm font-medium">登入時加好友</label>
            <p className="text-xs text-gray-400 mt-0.5">需在 LINE Developers Console 將 LINE Login channel 連結到 LINE 官方帳號</p>
            <select
              value={getValue('line_bot_prompt') || 'normal'}
              onChange={(e) => handleChange('line_bot_prompt', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="normal">normal — 顯示加好友勾選框（預設勾選）</option>
              <option value="aggressive">aggressive — 強制顯示加好友提示</option>
              <option value="off">關閉 — 不顯示加好友</option>
            </select>
          </div>

          {/* 狀態 */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs font-medium text-gray-500 mb-2">設定狀態</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${getValue('login_line') === 'true' ? 'bg-green-500' : 'bg-gray-300'}`} />
                LINE 登入：{getValue('login_line') === 'true' ? '已啟用' : '未啟用'}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${getValue('line_channel_id') ? 'bg-green-500' : 'bg-red-400'}`} />
                Channel ID：{getValue('line_channel_id') ? '已設定' : '未設定'}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${getValue('line_channel_secret') ? 'bg-green-500' : 'bg-red-400'}`} />
                Channel Secret：{getValue('line_channel_secret') ? '已設定' : '未設定'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== Google 登入 ========== */}
      <SocialLoginBlock
        name="Google"
        color="bg-blue-500"
        icon={<svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
        settingsKey="login_google"
        providerNote="Supabase 內建支援，需在 Supabase Dashboard → Authentication → Providers → Google 設定"
        getValue={getValue}
        handleChange={handleChange}
      />

      {/* ========== Apple 登入 ========== */}
      <SocialLoginBlock
        name="Apple"
        color="bg-black"
        icon={<svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>}
        settingsKey="login_apple"
        providerNote="Supabase 內建支援，需在 Supabase Dashboard → Authentication → Providers → Apple 設定"
        getValue={getValue}
        handleChange={handleChange}
      />

      {/* ========== Facebook 登入 ========== */}
      <SocialLoginBlock
        name="Facebook"
        color="bg-blue-600"
        icon={<svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
        settingsKey="login_facebook"
        providerNote="Supabase 內建支援，需在 Supabase Dashboard → Authentication → Providers → Facebook 設定"
        getValue={getValue}
        handleChange={handleChange}
      />
    </div>
  )
}

function SocialLoginBlock({ name, color, icon, settingsKey, providerNote, getValue, handleChange }: {
  name: string
  color: string
  icon: React.ReactNode
  settingsKey: string
  providerNote: string
  getValue: (key: string) => string
  handleChange: (key: string, value: string) => void
}) {
  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
          <div>
            <h2 className="font-semibold">{name} 登入</h2>
            <div className="text-xs text-gray-500">使用 {name} 帳號登入</div>
          </div>
        </div>
        <button
          onClick={() => handleChange(settingsKey, getValue(settingsKey) === 'true' ? 'false' : 'true')}
          className={`relative w-12 h-6 rounded-full transition-colors ${getValue(settingsKey) === 'true' ? 'bg-blue-600' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${getValue(settingsKey) === 'true' ? 'left-6' : 'left-0.5'}`} />
        </button>
      </div>

      {getValue(settingsKey) === 'true' && (
        <div className="p-5 space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-600">
            {providerNote}
          </div>

          <div>
            <label className="text-sm font-medium">登入按鈕 Icon（選填）</label>
            <div className="mt-1 flex gap-2">
              {getValue(`${settingsKey}_icon`) ? (
                <div className="flex items-center gap-2 flex-1 p-1.5 border border-gray-300 rounded">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getValue(`${settingsKey}_icon`)} alt="" className="w-6 h-6 object-contain" />
                  <span className="text-xs text-gray-400 truncate flex-1">{getValue(`${settingsKey}_icon`).split('/').pop()}</span>
                  <button onClick={() => handleChange(`${settingsKey}_icon`, '')} className="text-xs text-red-400">移除</button>
                </div>
              ) : (
                <input value={getValue(`${settingsKey}_icon`)} onChange={(e) => handleChange(`${settingsKey}_icon`, e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="貼上圖片 URL" />
              )}
              <a href="/admin/media" target="_blank" className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs text-gray-600 rounded whitespace-nowrap">圖片庫</a>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${getValue(settingsKey) === 'true' ? 'bg-green-500' : 'bg-gray-300'}`} />
            狀態：已啟用
          </div>
        </div>
      )}
    </div>
  )
}
