'use client'

import { useEffect, useState } from 'react'
import { Search, Download, Loader2, RefreshCw, BarChart2, X } from 'lucide-react'

interface Row {
  iccid: string
  card_status: string | null
  plan_status: string | null
  plan_start_time: string | null
  plan_end_time: string | null
  countries: string[]
  country_label: string | null
  bc_order_id: string | null
  bc_sku_name: string | null
  copies: string | null
  total_days: number | null
  cost_twd: number | null
  order_number: string | null
  aftersale: boolean
  installed_at: string | null
}

const CARD_STATUS: Record<string, string> = { '0': '已開卡', '1': '使用中', '2': '已用盡', '3': '失效', '4': '續期', '5': '報廢' }
const PLAN_STATUS: Record<string, string> = { '0': '未使用', '1': '使用中', '2': '使用結束', '3': '已取消' }

export default function StatsDetailPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardStatus, setCardStatus] = useState('')
  const [planStatus, setPlanStatus] = useState('')
  const [aftersale, setAftersale] = useState('')
  const [installed, setInstalled] = useState('')
  const [needSync, setNeedSync] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [usageModal, setUsageModal] = useState<Row | null>(null)
  const pageSize = 50

  function params(extra?: Record<string, string>) {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...extra })
    if (search.trim()) p.set('search', search.trim())
    if (cardStatus) p.set('card_status', cardStatus)
    if (planStatus) p.set('plan_status', planStatus)
    if (aftersale) p.set('aftersale', aftersale)
    if (installed) p.set('installed', installed)
    return p
  }

  async function load(p = page) {
    setLoading(true)
    const pr = params({ page: String(p) })
    const res = await fetch(`/api/admin/stats/cards?${pr}`)
    if (res.ok) { const d = await res.json(); setRows(d.data || []); setTotal(d.total || 0); setNeedSync(!!d.needSync) }
    setLoading(false)
  }
  useEffect(() => { load(1); setPage(1) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  function doSearch() { setPage(1); load(1) }
  function exportCsv() { window.open(`/api/admin/stats/cards?${params({ action: 'export' })}`, '_blank') }

  async function syncPlans() {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/stats/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 300 }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '同步失敗'); return }
      alert(d.note || `同步完成：查詢 ${d.picked} 張卡，寫入 ${d.plans} 筆方案`)
      setPage(1); load(1)
    } finally { setSyncing(false) }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">統計明細列表</h1>
          <p className="mt-1 text-sm text-gray-500">每張卡（ICCID）一列 · 全平台彙整（卡狀態 / 套餐 / 訂單 / 成本 / 售後 / 安裝）</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncPlans} disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {syncing ? '同步中…' : '同步方案 (F012)'}
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
            <Download className="w-4 h-4" /> 匯出 CSV
          </button>
        </div>
      </div>

      {needSync && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          方案明細尚未同步。按右上「同步方案 (F012)」開始撈取（每次一批 300 張，多按幾次輪完；終態卡不重複撈）。
        </div>
      )}

      {/* 篩選 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-64 border border-gray-300 rounded-lg px-3 py-1.5">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="搜尋 ICCID…" className="flex-1 text-sm outline-none" />
        </div>
        <select value={cardStatus} onChange={e => setCardStatus(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部載體狀態</option>
          {Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={planStatus} onChange={e => setPlanStatus(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部套餐狀態</option>
          {Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={aftersale} onChange={e => setAftersale(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">售後：全部</option>
          <option value="1">已退卡</option>
          <option value="0">未退卡</option>
        </select>
        <select value={installed} onChange={e => setInstalled(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">安裝：全部</option>
          <option value="1">已安裝</option>
          <option value="0">未安裝</option>
        </select>
        <button onClick={doSearch} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">ICCID</th>
                <th className="px-3 py-2 text-left border-b">卡片狀態</th>
                <th className="px-3 py-2 text-left border-b">套餐狀態</th>
                <th className="px-3 py-2 text-left border-b">啟用時間</th>
                <th className="px-3 py-2 text-left border-b">到期時間</th>
                <th className="px-3 py-2 text-left border-b">國家</th>
                <th className="px-3 py-2 text-left border-b">BC 單號</th>
                <th className="px-3 py-2 text-left border-b">套餐 (BC)</th>
                <th className="px-3 py-2 text-left border-b">份數（天數）</th>
                <th className="px-3 py-2 text-right border-b">成本</th>
                <th className="px-3 py-2 text-left border-b">售後</th>
                <th className="px-3 py-2 text-left border-b">安裝</th>
                <th className="px-3 py-2 text-left border-b">詳情</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-10 text-center text-gray-400">無符合資料</td></tr>
              ) : rows.map(r => (
                <tr key={`${r.iccid}-${r.bc_order_id}-${r.bc_sku_name}`} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono">{r.iccid}</td>
                  <td className="px-3 py-2">{CARD_STATUS[r.card_status || ''] || r.card_status || '—'}</td>
                  <td className="px-3 py-2">{PLAN_STATUS[r.plan_status || ''] || r.plan_status || '—'}</td>
                  <td className="px-3 py-2">{r.plan_start_time ? String(r.plan_start_time).slice(0, 16) : '—'}</td>
                  <td className="px-3 py-2">{r.plan_end_time ? String(r.plan_end_time).slice(0, 16) : '—'}</td>
                  <td className="px-3 py-2" title={r.countries.join(' / ')}>{r.country_label || '—'}</td>
                  <td className="px-3 py-2 font-mono">{r.bc_order_id || '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={r.bc_sku_name || ''}>{r.bc_sku_name || '—'}</td>
                  <td className="px-3 py-2">{r.copies ? `${r.copies} 份${r.total_days != null ? `（${r.total_days} 天）` : ''}` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cost_twd != null ? `NT$ ${Math.round(r.cost_twd)}` : '—'}</td>
                  <td className="px-3 py-2">{r.aftersale ? <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px]">已退</span> : '—'}</td>
                  <td className="px-3 py-2">{r.installed_at ? <span className="text-emerald-700" title={new Date(r.installed_at).toLocaleString('zh-TW')}>✓ {String(r.installed_at).slice(0, 10)}</span> : '—'}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => setUsageModal(r)}
                      className="flex items-center gap-1 px-2 py-1 border border-blue-300 text-blue-600 rounded hover:bg-blue-50">
                      <BarChart2 className="w-3.5 h-3.5" /> 使用量
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-gray-500">共 {total.toLocaleString()} 張卡</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p) }} disabled={page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages || 1}</span>
              <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p) }} disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}

      {usageModal && <UsageMatrixModal row={usageModal} onClose={() => setUsageModal(null)} />}
    </div>
  )
}

// 使用量矩陣彈窗（F023 日流量）：列＝日期、欄＝地區、格＝用量
interface UsageResp {
  dates: string[]
  countries: { code: string; name: string }[]
  cells: Record<string, number>
  rowTotals: Record<string, number>
  colTotals: Record<string, number>
  total: number
  syncedAt: string | null
  fetchError: string | null
  note?: string | null
}
function fmtKB(kb: number) {
  if (!kb) return '—'
  if (kb >= 1024 * 1024) return (kb / 1024 / 1024).toFixed(2) + ' GB'
  if (kb >= 1024) return (kb / 1024).toFixed(2) + ' MB'
  return Math.round(kb) + ' KB'
}
function UsageMatrixModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [data, setData] = useState<UsageResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(refresh = false) {
    if (refresh) setRefreshing(true); else setLoading(true)
    const p = new URLSearchParams({ iccid: row.iccid })
    if (row.plan_start_time) p.set('begin', String(row.plan_start_time).slice(0, 10))
    if (row.plan_end_time) p.set('end', String(row.plan_end_time).slice(0, 10))
    if (refresh) p.set('refresh', '1')
    const res = await fetch(`/api/admin/stats/cards/usage?${p}`)
    if (res.ok) setData(await res.json())
    setLoading(false); setRefreshing(false)
  }
  useEffect(() => { load(false) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="font-semibold">使用量明細（F023 日流量）</h3>
            <p className="text-xs text-gray-500 font-mono">{row.iccid} · {row.bc_sku_name || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(true)} disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> 重新查詢
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中…</p>
          ) : !data || data.dates.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {data?.fetchError ? <span className="text-red-500">F023 查詢失敗：{data.fetchError}</span> : (data?.note || '此期間無流量紀錄')}
            </div>
          ) : (
            <>
              <div className="mb-2 text-xs text-gray-500">
                期間 {data.dates[0]} ~ {data.dates[data.dates.length - 1]} · 合計 <span className="font-semibold text-gray-800">{fmtKB(data.total)}</span>
                {data.syncedAt && <span className="ml-2 text-gray-400">同步：{new Date(data.syncedAt).toLocaleString('zh-TW')}</span>}
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="text-xs whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left border-b sticky left-0 bg-gray-50">日期＼地區</th>
                      {data.countries.map(c => <th key={c.code} className="px-3 py-2 text-right border-b" title={c.code}>{c.name}</th>)}
                      <th className="px-3 py-2 text-right border-b font-semibold">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dates.map(d => (
                      <tr key={d} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono sticky left-0 bg-white">{d}</td>
                        {data.countries.map(c => {
                          const v = data.cells[`${d}|${c.code}`] || 0
                          return <td key={c.code} className={`px-3 py-1.5 text-right font-mono ${v ? '' : 'text-gray-300'}`}>{v ? fmtKB(v) : '—'}</td>
                        })}
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmtKB(data.rowTotals[d] || 0)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-gray-50">小計</td>
                      {data.countries.map(c => <td key={c.code} className="px-3 py-2 text-right font-mono">{fmtKB(data.colTotals[c.code] || 0)}</td>)}
                      <td className="px-3 py-2 text-right font-mono">{fmtKB(data.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
