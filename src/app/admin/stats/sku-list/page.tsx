'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, AlertTriangle } from 'lucide-react'

interface Row {
  sku_id: string; sku_name: string; plans: number; cards: number
  plan_type_label: string | null; in_bc: boolean; is_unlimited: boolean; tagged: boolean; name_hint_unlimited: boolean
}

export default function SkuListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState({ total_skus: 0, missing_in_bc: 0, unlimited_count: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (only) p.set('only', only)
    const res = await fetch(`/api/admin/stats/sku-list?${p}`)
    if (res.ok) { const d = await res.json(); setRows(d.rows || []); setSummary({ total_skus: d.total_skus || 0, missing_in_bc: d.missing_in_bc || 0, unlimited_count: d.unlimited_count || 0 }) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [only])

  async function toggle(r: Row, val: boolean) {
    setSaving(r.sku_id)
    setRows(prev => prev.map(x => x.sku_id === r.sku_id ? { ...x, is_unlimited: val, tagged: true } : x))
    await fetch('/api/admin/stats/sku-list', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_id: r.sku_id, sku_name: r.sku_name, is_unlimited: val }),
    })
    setSaving(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">方案列表</h1>
          <p className="mt-1 text-sm text-gray-500">方案統計明細列表用到的所有 SKU · 標註「吃到飽」供日均量分群 · 檢核有無沒對到 BC 商品的 SKU</p>
        </div>
      </div>

      <div className="mt-4 flex gap-4 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">使用的 SKU 種類</div><div className="mt-1 text-2xl font-bold">{summary.total_skus.toLocaleString()}</div></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">已標吃到飽</div><div className="mt-1 text-2xl font-bold text-emerald-600">{summary.unlimited_count.toLocaleString()}</div></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-xs text-gray-500">沒對到 BC 商品</div><div className={`mt-1 text-2xl font-bold ${summary.missing_in_bc ? 'text-rose-600' : ''}`}>{summary.missing_in_bc.toLocaleString()}</div></div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="搜尋 SKU 名稱 / ID" className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-72" />
        </div>
        <select value={only} onChange={e => setOnly(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部</option>
          <option value="missing">只看沒對到 BC</option>
          <option value="unlimited">只看吃到飽</option>
          <option value="untagged">只看未標註</option>
        </select>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left border-b w-10">#</th>
                <th className="px-3 py-2 text-left border-b">SKU 名稱</th>
                <th className="px-3 py-2 text-left border-b">SKU ID</th>
                <th className="px-3 py-2 text-left border-b">類型</th>
                <th className="px-3 py-2 text-right border-b">方案數</th>
                <th className="px-3 py-2 text-right border-b">卡數</th>
                <th className="px-3 py-2 text-center border-b">BC 對照</th>
                <th className="px-3 py-2 text-center border-b">吃到飽</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">無資料（先到方案統計明細列表同步方案）</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sku_id} className={`border-b hover:bg-gray-50 ${!r.in_bc ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 max-w-md truncate" title={r.sku_name}>{r.sku_name}
                    {r.name_hint_unlimited && !r.is_unlimited && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">名稱疑似吃到飽</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.sku_id}</td>
                  <td className="px-3 py-2">{r.plan_type_label ? <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.plan_type_label === '單日型' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{r.plan_type_label}</span> : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{r.plans.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cards.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    {r.in_bc ? <span className="text-emerald-600 text-xs">✓</span> : <span className="inline-flex items-center gap-1 text-rose-600 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> 缺</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={r.is_unlimited} disabled={saving === r.sku_id} onChange={e => toggle(r, e.target.checked)} />
                    </label>
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
