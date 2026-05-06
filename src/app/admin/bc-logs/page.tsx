'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ChevronDown, ChevronRight, PlayCircle } from 'lucide-react'

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
  F001: '取得國家列表', F002: '取得商品', F003: '取得價格',
  F006: 'SIM下單', F007: '充值下單', F008: '取消訂單',
  F010: '查卡有效期', F011: '查訂單資訊', F012: '查套餐使用',
  F013: '驗證ICCID', F014: '查餘額', F017: '售後申請',
  F020: '查售後資訊', F023: '日流量查詢', F040: 'eSIM下單',
  F042: 'eSIM服務狀態', F046: '套餐使用v2', F052: '充值商品',
  F054: '實名認證狀態', F056: '加速包商品',
  N001: 'SIM出貨通知', N002: '數據啟用通知', N003: '數據到期通知',
  N004: '售後審核通知', N005: '退款通知', N006: '商品資訊修改通知',
  N009: 'eSIM QR碼通知', N010: 'eSIM郵件發送通知', N012: 'eSIM狀態變更通知',
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
  const [distinctTypes, setDistinctTypes] = useState<string[]>([])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (filterType) params.set('trade_type', filterType)
    if (filterDirection) params.set('direction', filterDirection)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/bc-logs?${params}`)
    if (res.ok) {
      const d = await res.json()
      setLogs(d.data || [])
      setTotal(d.total || 0)
      if (Array.isArray(d.distinctTypes)) setDistinctTypes(d.distinctTypes)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function replayLog(logId: string) {
    if (!confirm('重新解析這筆 webhook？將依目前邏輯更新相關資料。')) return
    const res = await fetch(`/api/admin/bc-logs/${logId}/replay`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '重放失敗'); return }
    const s = data.summary
    alert(`重放完成\n類型：${s.tradeType}\n匹配：${s.matched} 筆\n更新：${s.updated} 筆${s.note ? `\n備註：${s.note}` : ''}`)
    load()
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

      <div className="mt-4 flex gap-2 items-center flex-wrap">
        {(() => {
          const STATIC_F = ['F001','F002','F003','F006','F007','F008','F010','F011','F012','F013','F014','F017','F020','F023','F040','F042','F046','F052','F054','F056']
          const STATIC_N = ['N001','N002','N003','N004','N005','N006','N009','N010','N012','N013']
          const fTypes = Array.from(new Set([...STATIC_F, ...distinctTypes.filter(t => t.startsWith('F'))])).sort()
          const nTypes = Array.from(new Set([...STATIC_N, ...distinctTypes.filter(t => t.startsWith('N'))])).sort()
          const otherTypes = distinctTypes.filter(t => !t.startsWith('F') && !t.startsWith('N'))
          return (
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded text-xs">
              <option value="">全部類型</option>
              <optgroup label="發送">
                {fTypes.map(t => <option key={t} value={t}>{t} {TRADE_TYPE_LABELS[t] || ''}</option>)}
              </optgroup>
              <optgroup label="接收 (Webhook)">
                {nTypes.map(t => <option key={t} value={t}>{t} {TRADE_TYPE_LABELS[t] || ''}</option>)}
              </optgroup>
              {otherTypes.length > 0 && (
                <optgroup label="其他">
                  {otherTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              )}
            </select>
          )
        })()}
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
        {filterType && (
          <button
            onClick={async () => {
              if (!confirm(`確定要刪除所有「${filterType}」類型的 log？此操作無法復原。`)) return
              const res = await fetch(`/api/admin/bc-logs?trade_type=${filterType}`, { method: 'DELETE' })
              const d = await res.json()
              if (!res.ok) { alert(d.error || '刪除失敗'); return }
              alert(`已刪除 ${d.deleted} 筆 ${d.tradeType} log`)
              setPage(1); load()
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700">
            刪除「{filterType}」類型
          </button>
        )}
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : logs.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">尚無 API 記錄</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {logs.map(log => {
            const expanded = expandedIds.has(log.id)
            return (
              <div key={log.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(log.id)}>
                  <span className="text-gray-400 flex-shrink-0">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString('zh-TW')}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full flex-shrink-0 ${log.direction === 'outgoing' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {log.direction === 'outgoing' ? '發送' : '接收'}
                  </span>
                  <span className="font-mono text-xs font-semibold flex-shrink-0">{log.trade_type}</span>
                  <span className="text-xs text-gray-500 hidden sm:inline">{TRADE_TYPE_LABELS[log.trade_type] || '-'}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {log.status === 'success' ? '成功' : '失敗'}
                  </span>
                  {log.duration_ms != null && <span className="text-[10px] text-gray-400 flex-shrink-0">{log.duration_ms}ms</span>}
                  {log.error_message && <span className="text-[10px] text-red-500 truncate">{log.error_message}</span>}
                </div>
                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    {log.direction === 'incoming' && (
                      <div className="mb-3 flex justify-end">
                        <button onClick={() => replayLog(log.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs rounded hover:bg-amber-700">
                          <PlayCircle className="w-3.5 h-3.5" /> 重新解析
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-1">Request</h4>
                        <pre className="text-[11px] bg-white border border-gray-200 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap font-mono">
                          {log.request_body ? JSON.stringify(log.request_body, null, 2) : '-'}
                        </pre>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-1">Response</h4>
                        <pre className="text-[11px] bg-white border border-gray-200 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap font-mono">
                          {log.response_body ? JSON.stringify(log.response_body, null, 2) : '-'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-between px-4 py-3">
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
