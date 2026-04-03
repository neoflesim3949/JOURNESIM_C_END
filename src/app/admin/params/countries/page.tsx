'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Globe, Pencil, Save, X } from 'lucide-react'

interface BCCountry {
  id: string; mcc: string; name: string
  name_zh: string | null; name_en: string | null
  continent: string; continent_zh: string | null; continent_en: string | null
  flag_url: string | null
}

export default function AdminCountriesPage() {
  const [countries, setCountries] = useState<BCCountry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name_zh: '', name_en: '', continent_zh: '', continent_en: '' })

  async function load() {
    const res = await fetch('/api/admin/params/countries')
    if (res.ok) setCountries(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const continents = [...new Set(countries.map((c) => c.continent_zh || c.continent).filter(Boolean))].sort()

  const filtered = countries.filter((c) => {
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
      name_zh: c.name_zh || '',
      name_en: c.name_en || '',
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
      <p className="mt-1 text-sm text-gray-500">共 {countries.length} 個國家</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input type="text" placeholder="搜尋 MCC、國家名稱（簡/繁/英）..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={continentFilter} onChange={(e) => setContinentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部洲別</option>
          {continents.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? <p className="mt-4 text-sm text-gray-500">載入中...</p> : filtered.length === 0 ? (
        <div className="mt-8 text-center py-16">
          <Globe className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無資料，請先至「BC 同步」同步國家</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-3 font-medium w-10"></th>
                  <th className="text-left px-3 py-3 font-medium w-14">MCC</th>
                  <th className="text-left px-3 py-3 font-medium">名稱（簡中）</th>
                  <th className="text-left px-3 py-3 font-medium">名稱（繁中）</th>
                  <th className="text-left px-3 py-3 font-medium">名稱（英文）</th>
                  <th className="text-left px-3 py-3 font-medium w-20">洲別（簡）</th>
                  <th className="text-left px-3 py-3 font-medium w-20">洲別（繁）</th>
                  <th className="text-left px-3 py-3 font-medium w-24">洲別（英）</th>
                  <th className="text-center px-3 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const isEditing = editingId === c.id
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        {c.flag_url ? <Image src={c.flag_url} alt={c.name} width={24} height={18} className="rounded shadow-sm" /> : <div className="w-6 h-4 bg-gray-100 rounded" />}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-blue-600">{c.mcc}</td>
                      <td className="px-3 py-2 text-gray-500">{c.name}</td>
                      {isEditing ? (
                        <>
                          <td className="px-3 py-1"><input value={editForm.name_zh} onChange={(e) => setEditForm({ ...editForm, name_zh: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                          <td className="px-3 py-1"><input value={editForm.name_en} onChange={(e) => setEditForm({ ...editForm, name_en: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                          <td className="px-3 py-2 text-xs text-gray-400">{c.continent}</td>
                          <td className="px-3 py-1"><input value={editForm.continent_zh} onChange={(e) => setEditForm({ ...editForm, continent_zh: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                          <td className="px-3 py-1"><input value={editForm.continent_en} onChange={(e) => setEditForm({ ...editForm, continent_en: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => saveEdit(c.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Save className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-medium">{c.name_zh || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-gray-600">{c.name_en || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{c.continent}</td>
                          <td className="px-3 py-2 text-xs">{c.continent_zh || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{c.continent_en || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => startEdit(c)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
            顯示 {filtered.length} / {countries.length} 筆
          </div>
        </div>
      )}
    </div>
  )
}
