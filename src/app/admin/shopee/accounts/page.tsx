'use client'

import { useEffect, useState } from 'react'
import { Trash2, Plus, Eye, EyeOff } from 'lucide-react'

interface Account {
  id: string; name: string; description: string | null; excel_password: string | null; created_at: string
}

export default function ShopeeAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/shopee/accounts')
    if (res.ok) setAccounts(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!name.trim()) return
    await fetch('/api/admin/shopee/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
    })
    setName(''); setDesc('')
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此帳號？相關訂單不會被刪除。')) return
    await fetch('/api/admin/shopee/accounts', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">蝦皮帳號管理</h1>
      <p className="mt-1 text-sm text-gray-500">設定多組蝦皮帳號，匯入訂單時選擇對應帳號</p>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">新增帳號</h3>
        <div className="flex gap-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="帳號名稱（必填）"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="備註（選填）"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={handleAdd} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新增
          </button>
        </div>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : accounts.length === 0 ? (
        <p className="mt-8 text-center text-gray-400 py-12">尚無帳號，請新增</p>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">帳號名稱</th>
                <th className="text-left px-4 py-3 font-medium">備註</th>
                <th className="text-left px-4 py-3 font-medium">Excel 密碼</th>
                <th className="text-left px-4 py-3 font-medium">建立時間</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-gray-500">{a.description || '-'}</td>
                  <td className="px-4 py-3">
                    <ExcelPasswordCell accountId={a.id} value={a.excel_password} onSaved={load} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('zh-TW')}</td>
                  <td className="px-2 py-3">
                    <button onClick={() => handleDelete(a.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
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

function ExcelPasswordCell({ accountId, value, onSaved }: { accountId: string; value: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value || '')
  const [show, setShow] = useState(false)

  async function save() {
    await fetch('/api/admin/shopee/accounts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: accountId, excel_password: input }),
    })
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1">
        {value ? (
          <>
            <span className="text-xs font-mono">{show ? value : '••••••'}</span>
            <button onClick={() => setShow(v => !v)} className="text-gray-400 hover:text-gray-600">
              {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </>
        ) : <span className="text-xs text-gray-400">未設定</span>}
        <button onClick={() => { setInput(value || ''); setEditing(true) }} className="text-xs text-blue-500 hover:underline ml-1">
          {value ? '修改' : '設定'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input value={input} onChange={e => setInput(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        placeholder="輸入密碼" className="px-2 py-0.5 border border-blue-300 rounded text-xs w-24" />
      <button onClick={save} className="text-blue-500 text-xs">✓</button>
      <button onClick={() => setEditing(false)} className="text-gray-400 text-xs">✕</button>
    </div>
  )
}
