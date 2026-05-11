'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

interface SmseLog {
  id: string
  api_type: string
  endpoint: string
  request_body: unknown
  response_body: unknown
  response_raw: string | null
  status: string
  smse_status_code: string | null
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

const API_TYPE_LABELS: Record<string, string> = {
  issue: '開立發票',
  allowance: '開立折讓單',
  modify: '作廢/註銷',
}

export default function SmseLogsPage() {
  const [logs, setLogs] = useState<SmseLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [distinctTypes, setDistinctTypes] = useState<string[]>([])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (filterType) params.set('api_type', filterType)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/smse-logs?${params}`)
    if (res.ok) {
      const d = await res.json()
      setLogs(d.data || [])
      setTotal(d.total || 0)
      if (Array.isArray(d.distinctTypes)) setDistinctTypes(d.distinctTypes)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">smse API Log</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆記錄</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 重新整理
        </button>
      </div>

      <div className="mt-4 flex gap-2 items-center flex-wrap">
        {(() => {
          const STATIC = ['issue', 'allowance', 'modify']
          const all = Array.from(new Set([...STATIC, ...distinctTypes])).sort()
          return (
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded text-xs">
              <option value="">全部類型</option>
              {all.map(t => <option key={t} value={t}>{t} {API_TYPE_LABELS[t] || ''}</option>)}
            </select>
          )
        })()}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs">
          <option value="">全部狀態</option>
          <option value="success">成功</option>
          <option value="error">失敗</option>
        </select>
        <button onClick={() => { setPage(1); load() }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">篩選</button>
        <button onClick={() => { setFilterType(''); setFilterStatus(''); setPage(1); setTimeout(load, 0) }}
          className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">清除</button>
        {filterType && (
          <button
            onClick={async () => {
              if (!confirm(`確定要刪除所有「${filterType}」類型的 log？`)) return
              const res = await fetch(`/api/admin/smse-logs?api_type=${filterType}`, { method: 'DELETE' })
              const d = await res.json()
              if (!res.ok) { alert(d.error || '刪除失敗'); return }
              alert(`已刪除 ${d.deleted} 筆`)
              setPage(1); load()
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700">
            刪除「{filterType}」
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading && <div className="text-center text-gray-500 py-8">載入中…</div>}
        {!loading && logs.length === 0 && <div className="text-center text-gray-400 py-8">沒有記錄</div>}
        {!loading && logs.map(log => {
          const isOpen = expanded.has(log.id)
          return (
            <div key={log.id} className="bg-white border border-gray-200 rounded-lg">
              <button onClick={() => toggleExpand(log.id)} className="w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-gray-50">
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <span className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString('zh-TW')}</span>
                <span className="font-mono text-xs font-semibold flex-shrink-0">{log.api_type}</span>
                <span className="text-xs text-gray-500 hidden sm:inline">{API_TYPE_LABELS[log.api_type] || ''}</span>
                <span className={`ml-auto px-2 py-0.5 text-xs rounded-full ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {log.status === 'success' ? '成功' : '失敗'}
                  {log.smse_status_code && ` (${log.smse_status_code})`}
                </span>
                {log.duration_ms != null && <span className="text-xs text-gray-400">{log.duration_ms}ms</span>}
              </button>
              {isOpen && (
                <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-gray-500 mb-1">Request</div>
                    <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap">{JSON.stringify(log.request_body, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Response</div>
                    <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap">{log.response_raw || JSON.stringify(log.response_body, null, 2)}</pre>
                  </div>
                  {log.error_message && (
                    <div className="md:col-span-2 text-red-600 text-xs">錯誤：{log.error_message}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">上一頁</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">下一頁</button>
        </div>
      )}
    </div>
  )
}
