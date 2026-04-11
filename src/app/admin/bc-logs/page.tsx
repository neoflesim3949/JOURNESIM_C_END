'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

interface BcLog {
  id: string
  trade_type: string
  direction: string
  request_body: any
  response_body: any
  status: string
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

const TRADE_TYPE_LABELS: Record<string, string> = {
  F001: '取得國家列表',
  F002: '取得商品',
  F003: '取得價格',
  F006: 'SIM下單',
  F007: '充值下單',
  F008: '取消訂單',
  F010: '查卡有效期',
  F011: '查訂單資訊',
  F012: '查套餐使用',
  F013: '驗證ICCID',
  F014: '查餘額',
  F017: '售後申請',
  F020: '查售後資訊',
  F023: '日流量查詢',
  F040: 'eSIM下單',
  F042: 'eSIM服務狀態',
  F046: '套餐使用v2',
  F052: '充值商品',
  F054: '實名認證狀態',
  F056: '加速包商品',
  N001: 'SIM出貨通知',
  N002: '數據啟用通知',
  N003: '數據到期通知',
  N009: 'eSIM QR碼通知',
  N013: '充值結果通知',
}

export default function BcLogsPage() {
  const [logs, setLogs] = useState<BcLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterDirection, setFilterDirection] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (filterType) params.set('trade_type', filterType)
    if (filterDirection) params.set('direction', filterDirection)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/bc-logs?${params}`)
    if (res.ok) { const d = await res.json(); setLogs(d.data || []); setTotal(d.total || 0) }
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BC API Log</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆記錄</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 重新整理
        </button>
      </div>

      <div className="mt-4 flex gap-2 items-center">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs">
          <option value="">全部類型</option>
          <optgroup label="發送">
            {['F001','F002','F003','F006','F007','F008','F010','F011','F012','F013','F014','F017','F020','F023','F040','F042','F046','F052','F054','F056'].map(t =>
              <option key={t} value={t}>{t} {TRADE_TYPE_LABELS[t] || ''}</option>
            )}
          </optgroup>
          <optgroup label="接收 (Webhook)">
            {['N001','N002','N003','N009','N013'].map(t =>
              <option key={t} value={t}>{t} {TRADE_TYPE_LABELS[t] || ''}</option>
            )}
          </optgroup>
        </select>
        <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs">
          <option value="">全部方向</option>
          <option value="outgoing">發送</option>
          <option value="incoming">接收</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs">
          <option value="">全部狀態</option>
          <option value="success">成功</option>
          <option value="error">失敗</option>
        </select>
        <button onClick={() => { setPage(1); load() }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">篩選</button>
        <button onClick={() => { setFilterType(''); setFilterDirection(''); setFilterStatus(''); setPage(1); setTimeout(load, 0) }}
          className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">清除</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : logs.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">尚無 API 記錄</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 font-medium">時間</th>
                <th className="text-left px-4 py-3 font-medium">方向</th>
                <th className="text-left px-4 py-3 font-medium">類型</th>
                <th className="text-left px-4 py-3 font-medium">說明</th>
                <th className="text-left px-4 py-3 font-medium">狀態</th>
                <th className="text-left px-4 py-3 font-medium">耗時</th>
                <th className="text-left px-4 py-3 font-medium">錯誤</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => {
                const expanded = expandedIds.has(log.id)
                return (
                  <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                    <td className="pl-3 py-2 text-gray-400">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString('zh-TW')}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${log.direction === 'outgoing' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {log.direction === 'outgoing' ? '發送' : '接收'}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs font-medium">{log.trade_type}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{TRADE_TYPE_LABELS[log.trade_type] || '-'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status === 'success' ? '成功' : '失敗'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{log.duration_ms != null ? `${log.duration_ms}ms` : '-'}</td>
                    <td className="px-4 py-2 text-xs text-red-500 max-w-[200px] truncate">{log.error_message || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* 展開的詳情 */}
          {logs.map(log => expandedIds.has(log.id) && (
            <div key={`detail-${log.id}`} className="border-t border-gray-200 bg-gray-50 px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">Request</h4>
                  <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap">
                    {log.request_body ? JSON.stringify(log.request_body, null, 2) : '-'}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">Response</h4>
                  <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap">
                    {log.response_body ? JSON.stringify(log.response_body, null, 2) : '-'}
                  </pre>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">共 {total} 筆</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
