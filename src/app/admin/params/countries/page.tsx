'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Globe, AlertCircle, CheckCircle } from 'lucide-react'

interface BCCountry {
  id: string
  mcc: string
  name: string
  continent: string
  flag_url: string | null
  numeric_mcc: string[] | null
  created_at: string
}

export default function AdminCountriesPage() {
  const [countries, setCountries] = useState<BCCountry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [continentFilter, setContinentFilter] = useState('')
  const [mappingFilter, setMappingFilter] = useState<'' | 'mapped' | 'unmapped'>('')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/params/countries')
      if (res.ok) setCountries(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  const continents = [...new Set(countries.map((c) => c.continent).filter(Boolean))].sort()
  const mappedCount = countries.filter((c) => c.numeric_mcc && c.numeric_mcc.length > 0).length

  const filtered = countries.filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      const matchName = c.name.toLowerCase().includes(q)
      const matchIso = c.mcc.toLowerCase().includes(q)
      const matchNumeric = c.numeric_mcc?.some((m) => m.includes(q))
      if (!matchName && !matchIso && !matchNumeric) return false
    }
    if (continentFilter && c.continent !== continentFilter) return false
    if (mappingFilter === 'mapped' && (!c.numeric_mcc || c.numeric_mcc.length === 0)) return false
    if (mappingFilter === 'unmapped' && c.numeric_mcc && c.numeric_mcc.length > 0) return false
    return true
  })

  return (
    <div>
      <h1 className="text-2xl font-bold">國家 MCC 管理</h1>
      <p className="mt-1 text-sm text-gray-500">
        ISO 代碼 ↔ 數字 MCC 對照表（共 {countries.length} 筆，已映射 {mappedCount} 筆）
      </p>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="搜尋國家名稱、ISO 代碼或數字 MCC..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
        <select value={continentFilter} onChange={(e) => setContinentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部洲別</option>
          {continents.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={mappingFilter} onChange={(e) => setMappingFilter(e.target.value as typeof mappingFilter)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部狀態</option>
          <option value="mapped">已映射</option>
          <option value="unmapped">未映射</option>
        </select>
      </div>

      {/* Stats */}
      <div className="mt-4 flex gap-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-gray-600">已映射：{mappedCount}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          <span className="text-gray-600">未映射：{countries.length - mappedCount}</span>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">載入中...</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 text-center py-16">
          <Globe className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無資料，請先至「BC 同步」同步國家與商品</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-12"></th>
                  <th className="text-left px-4 py-3 font-medium w-20">ISO</th>
                  <th className="text-left px-4 py-3 font-medium">國家名稱</th>
                  <th className="text-left px-4 py-3 font-medium w-32">數字 MCC</th>
                  <th className="text-left px-4 py-3 font-medium w-16">狀態</th>
                  <th className="text-left px-4 py-3 font-medium w-20">洲別</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const hasMcc = c.numeric_mcc && c.numeric_mcc.length > 0
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        {c.flag_url ? (
                          <Image src={c.flag_url} alt={c.name} width={24} height={18} className="rounded shadow-sm" />
                        ) : (
                          <div className="w-6 h-4 bg-gray-100 rounded" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-600">{c.mcc}</td>
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5">
                        {hasMcc ? (
                          <div className="flex flex-wrap gap-1">
                            {c.numeric_mcc!.map((m) => (
                              <span key={m} className="px-1.5 py-0.5 text-xs font-mono rounded bg-gray-100 text-gray-700">{m}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {hasMcc ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-orange-400" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{c.continent}</td>
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

      {/* Help */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
        <p className="font-medium">如何建立映射？</p>
        <p className="mt-1 text-blue-600">到「BC 同步」頁面點「同步商品」，系統會自動從 BC 商品的覆蓋國家資料中提取數字 MCC，並用國家名稱匹配寫入映射。</p>
      </div>
    </div>
  )
}
