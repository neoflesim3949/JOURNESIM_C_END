'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Globe, Pencil, Save, X, Network } from 'lucide-react'

interface BCCountry {
  id: string; mcc: string; name: string
  name_zh: string | null; name_en: string | null
  continent: string | null; continent_zh: string | null; continent_en: string | null
  flag_url: string | null; scope: string
}

type TabType = 'sync' | 'manual'
const CONTINENTS = ['亞洲', '歐洲', '美洲', '非洲', '大洋洲', '全球']
const CONTINENTS_ORIGINAL = ['Asia', 'Europe', 'America', 'Africa', 'Oceania', 'Global']

export default function AdminCountriesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('sync')
  const [countries, setCountries] = useState<BCCountry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [editForm, setEditForm] = useState({ 
    mcc: '', name: '', name_zh: '', name_en: '', 
    continent: '', continent_zh: '', continent_en: '' 
  })

  async function load() {
    const res = await fetch('/api/admin/params/countries')
    if (res.ok) setCountries(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const currentList = countries.filter((c) => activeTab === 'sync' ? c.scope === 'local' : c.scope !== 'local')
  
  const continents = [...new Set(currentList.map((c) => c.continent_zh || c.continent).filter(Boolean))].sort()

  const filtered = currentList.filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      const match = [c.mcc, c.name, c.name_zh, c.name_en, c.continent, c.continent_zh, c.continent_en]
        .filter(Boolean).some((v) => v!.toLowerCase().includes(q))
      if (!match) return false
    }
    if (continentFilter) {
      const cZh = c.continent_zh || c.continent
      if (cZh !== continentFilter) return false
    }
    return true
  })

  function startEdit(c: BCCountry) {
    setEditForm({
      mcc: c.mcc || '',
      name: c.name || '',
      name_zh: c.name_zh || '',
      name_en: c.name_en || '',
      continent: c.continent || '',
      continent_zh: c.continent_zh || '',
      continent_en: c.continent_en || '',
    })
    setEditingId(c.id)
  }

  async function saveEdit(id: string) {
    await fetch('/api/admin/params/countries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    setEditingId(null)
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">國家 MCC 管理</h1>
      <p className="mt-1 text-sm text-gray-500">共 {countries.length} 個分類</p>

      {/* Tabs */}
      <div className="mt-6 flex rounded-lg overflow-hidden border border-gray-200 w-fit cursor-pointer">
        <div onClick={() => { setActiveTab('sync'); setEditingId(null) }}
          className={`px-6 py-2.5 text-sm font-medium transition-colors ${activeTab === 'sync' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50' }`}>
          BC 同步 (自動)
        </div>
        <div onClick={() => { setActiveTab('manual'); setEditingId(null) }}
          className={`px-6 py-2.5 text-sm font-medium transition-colors ${activeTab === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50' }`}>
          自訂區域/全球 (手動)
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input type="text" placeholder={`搜尋${activeTab === 'sync' ? '國家' : '分類'}名稱、MCC...`}
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={continentFilter} onChange={(e) => setContinentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部洲別</option>
          {continents.map((c) => <option key={c} value={c ?? ''}>{c}</option>)}
        </select>
      </div>

      {loading ? <p className="mt-4 text-sm text-gray-500">載入中...</p> : filtered.length === 0 ? (
        <div className="mt-8 text-center py-16">
          {activeTab === 'sync' ? (
            <Globe className="mx-auto w-12 h-12 text-gray-300" />
          ) : (
            <Network className="mx-auto w-12 h-12 text-gray-300" />
          )}
          <p className="mt-4 text-gray-500">尚無{activeTab === 'sync' ? '同步資料' : '自訂區域/全球分類'}</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-3 font-medium w-10"></th>
                  <th className="text-left px-3 py-3 font-medium w-48">MCC (唯一碼)</th>
                  <th className="text-left px-3 py-3 font-medium">原始名稱 / 簡中</th>
                  <th className="text-left px-3 py-3 font-medium">名稱（繁中）</th>
                  <th className="text-left px-3 py-3 font-medium">名稱（英文）</th>
                  <th className="text-left px-3 py-3 font-medium w-24">洲別（原）</th>
                  <th className="text-left px-3 py-3 font-medium w-24">洲別（繁）</th>
                  <th className="text-left px-3 py-3 font-medium w-32">洲別（英）</th>
                  <th className="text-center px-3 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const isEditing = editingId === c.id
                  const isManual = activeTab === 'manual'

                  return (
                    <tr key={c.id} className={`transition-colors ${isEditing ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2">
                        {c.flag_url ? <Image src={c.flag_url} alt={c.name} width={24} height={18} className="rounded shadow-sm" /> : <div className="w-6 h-4 bg-gray-100 rounded border border-gray-200" />}
                      </td>
                      
                      {/* MCC */}
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-blue-600">
                        {isEditing && isManual ? (
                           <input value={editForm.mcc} onChange={(e) => setEditForm({ ...editForm, mcc: e.target.value })} className="w-full px-2 py-1 border border-blue-300 rounded text-xs outline-none" />
                        ) : c.mcc}
                      </td>

                      {/* Name (Original) / Simplified */}
                      <td className="px-3 py-2 text-gray-600 font-medium">
                        {isEditing && isManual ? (
                           <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-2 py-1 border border-blue-300 rounded text-sm outline-none" placeholder="原始名稱" />
                        ) : c.name}
                      </td>

                      {/* Name (Traditional) */}
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input value={editForm.name_zh} onChange={(e) => setEditForm({ ...editForm, name_zh: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm outline-none" />
                        ) : c.name_zh || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Name (English) */}
                      <td className="px-3 py-2 text-gray-600">
                        {isEditing ? (
                          <input value={editForm.name_en} onChange={(e) => setEditForm({ ...editForm, name_en: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm outline-none" />
                        ) : c.name_en || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Continent (Original) */}
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {isEditing && isManual ? (
                           <select value={editForm.continent} onChange={(e) => setEditForm({ ...editForm, continent: e.target.value })} className="w-full px-2 py-1 border border-blue-300 rounded text-xs outline-none">
                             <option value="">-- 未設定 --</option>
                             {CONTINENTS_ORIGINAL.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                        ) : c.continent || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Continent (Traditional) */}
                      <td className="px-3 py-2 text-xs">
                        {isEditing ? (
                           <select value={editForm.continent_zh} onChange={(e) => setEditForm({ ...editForm, continent_zh: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-xs outline-none">
                             <option value="">-- 未設定 --</option>
                             {CONTINENTS.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                        ) : c.continent_zh || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Continent (English) */}
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {isEditing ? (
                          <input value={editForm.continent_en} onChange={(e) => setEditForm({ ...editForm, continent_en: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-xs outline-none" />
                        ) : c.continent_en || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button onClick={() => saveEdit(c.id)} className="p-1.5 text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm"><Save className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(c)} className="p-1.5 text-gray-400 border border-transparent hover:border-gray-200 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-gray-50 text-xs text-gray-500 border-t border-gray-200 flex justify-between">
            <span>顯示 {filtered.length} / {currentList.length} 筆</span>
            <span>{activeTab === 'manual' ? '手動分類允許完整編輯 MCC 與原始名稱' : '同步資料僅允許修改翻譯欄位'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
