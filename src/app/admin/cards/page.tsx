'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Search, CreditCard, RefreshCw, X, Database, Calendar, Plus, Trash2, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'

interface CardRow {
  iccid: string; type: 'esim' | 'sim'; note: string | null; status: string
  // 來自 BC F010（DB 快取）
  card_type?: string | null; card_status?: string | null; expiration_date?: string | null
  postponed_month?: string | null; max_delay_month?: string | null; usage_count?: string | null
  bc_synced_at?: string | null
  // 來自 BC N002 / N003 webhook
  activation_start_time?: string | null
  activation_end_time?: string | null
}

function fmtDT(v: string | null | undefined): string {
  if (!v) return '-'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

// BC F010 狀態對應
const CARD_TYPE_LABEL: Record<string, string> = {
  '0': '單次卡', '1': '多次卡', '2': '硬卡', '3': 'MIFI 銷售', '4': 'MIFI 租賃', '5': 'eSIM',
}
const CARD_STATUS_LABEL: Record<string, string> = {
  '0': '已開卡', '1': '使用中', '2': '已用盡', '3': '失效', '4': '續期', '5': '報廢',
}
const CARD_STATUS_COLOR: Record<string, string> = {
  '0': 'bg-blue-50 text-blue-600',     // 已開卡
  '1': 'bg-green-50 text-green-600',   // 使用中
  '2': 'bg-gray-100 text-gray-500',    // 已用盡
  '3': 'bg-red-50 text-red-600',       // 失效
  '4': 'bg-amber-50 text-amber-600',   // 續期
  '5': 'bg-gray-200 text-gray-500',    // 報廢
}

interface ExpiryInfo {
  type: string; status: string; expirationDate: string
  postponedMonth: string; maxDelayMonth: string; usageCount: string
  supportUpgradeMultiCard?: string
}

interface UsagePlan {
  skuId: string; skuName: string; copies: string; planStatus: string
  planStartTime?: string; planEndTime?: string
  totalDays?: string; remainingDays?: string; totalTraffic?: string; remainingTraffic?: string
}

interface SkuDetail {
  sku_id: string; name: string; type: string | null; plan_type: string | null
  high_flow_size: string | null; limit_flow_speed: string | null; capacity: string | null
  hotspot_support: string | null; acceleration_support: string | null
  point_contact_type: string | null; time_zone: string | null
  desc: string | null; country_data: { 
    mcc: string; name: string; apn: string; 
    apnUsername?: string; apnPassword?: string;
    operatorInfo?: { operator: string; network: string; priority: string }[] 
  }[] | null
}

const PLAN_STATUS: Record<string, string> = {
  '0': '未使用', '1': '正在使用', '2': '使用結束', '3': '已取消',
}

interface TrafficItem {
  usedDate: string; country: string; usedAmountKB: number
}

export default function AdminCardsPage() {
  const [cards, setCards] = useState<CardRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [filterCardType, setFilterCardType] = useState('')
  const [filterCardStatus, setFilterCardStatus] = useState('')
  const [filterExpireFrom, setFilterExpireFrom] = useState('')
  const [filterExpireTo, setFilterExpireTo] = useState('')

  // 彈窗
  const [detailIccid, setDetailIccid] = useState<string | null>(null)
  const [detailType, setDetailType] = useState<'usage' | 'expiry' | 'traffic'>('expiry')
  const [expiry, setExpiry] = useState<ExpiryInfo | null>(null)
  const [usage, setUsage] = useState<{ subOrderList: UsagePlan[] } | null>(null)
  const [usageSkuDetails, setUsageSkuDetails] = useState<Record<string, SkuDetail>>({})
  const [countryDetail, setCountryDetail] = useState<SkuDetail['country_data'] | null>(null)
  const [traffic, setTraffic] = useState<TrafficItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [trafficBegin, setTrafficBegin] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [trafficEnd, setTrafficEnd] = useState(() => new Date().toISOString().slice(0, 10))

  // 手動新增 ICCID
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState<'single' | 'range'>('single')
  const [addType, setAddType] = useState<'sim' | 'esim'>('sim')
  const [addSingle, setAddSingle] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function syncBcAll() {
    if (!confirm('確定同步全部卡片的 BC 資料？卡片數量多會需要一些時間。')) return
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '同步失敗'); return }
      alert(`同步完成：查詢 ${data.total} 筆，更新 ${data.updated} 筆${data.errors?.length ? `\n\n錯誤：\n${data.errors.join('\n')}` : ''}`)
      load()
    } finally { setSyncing(false) }
  }

  async function syncBcOne(iccid: string) {
    const res = await fetch('/api/admin/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', iccids: [iccid] }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '同步失敗'); return }
    load()
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      // 根據副檔名選擇讀取方式，提高 .xls / .xlsx / .csv 相容性
      const ext = file.name.split('.').pop()?.toLowerCase()
      let wb: XLSX.WorkBook
      try {
        if (ext === 'csv') {
          const text = await file.text()
          wb = XLSX.read(text, { type: 'string' })
        } else {
          const buf = await file.arrayBuffer()
          wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false })
        }
      } catch (err) {
        alert('讀取檔案失敗，請確認是 .xlsx / .xls / .csv 格式：\n' + (err instanceof Error ? err.message : String(err)))
        return
      }
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) { alert('Excel 沒有工作表'); return }
      // 轉成二維陣列（所有值強制為字串，避免大數字被科學記號格式化）
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })

      // 找到含「載體編號 / ICCID」的欄位索引（忽略前後空白與大小寫，支援簡繁）
      const targetHeaders = ['載體編號', '载体编号', 'iccid', '卡號', '卡号', '卡片編號', '卡片编号']
      let iccidCol = -1
      let headerRow = -1
      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        for (let c = 0; c < (rows[r] || []).length; c++) {
          const v = String(rows[r][c] ?? '').trim().toLowerCase()
          if (targetHeaders.includes(v)) {
            iccidCol = c; headerRow = r; break
          }
        }
        if (iccidCol >= 0) break
      }

      // 數字判定：放寬為任意 8 位以上純數字
      const isIccid = (s: string) => /^\d{8,}$/.test(s)

      let iccids: string[] = []
      if (iccidCol >= 0) {
        iccids = rows.slice(headerRow + 1).map(r => String(r[iccidCol] ?? '').trim()).filter(isIccid)
      } else {
        iccids = rows.flat().map(v => String(v ?? '').trim()).filter(isIccid)
      }
      iccids = Array.from(new Set(iccids))

      if (iccids.length === 0) {
        alert(`找不到有效 ICCID\n\n解析到 ${rows.length} 列資料${iccidCol >= 0 ? `，找到欄位索引 ${iccidCol}` : '，但沒找到表頭欄位'}。\n請確認有「載體編號 / ICCID」欄，且內容為 8 位以上純數字。`)
        return
      }
      const type = confirm(`將匯入 ${iccids.length} 筆 ICCID。\n\n按「確定」匯入為 SIM，按「取消」改選 eSIM`) ? 'sim' : 'esim'
      const res = await fetch('/api/admin/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'bulk', iccids, type, note: `Excel 匯入：${file.name}` }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '匯入失敗'); return }
      alert(`匯入完成：${iccids.length} 筆${data.inserted != null ? `（實際寫入 ${data.inserted}）` : ''}`)
      load()
    } catch (err) {
      alert('讀取 Excel 失敗：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submitAdd() {
    setAddBusy(true)
    try {
      const payload = addMode === 'single'
        ? { mode: 'single', iccid: addSingle, type: addType, note: addNote }
        : { mode: 'range', start: addStart, end: addEnd, type: addType, note: addNote }
      const res = await fetch('/api/admin/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '新增失敗'); return }
      alert(`新增完成：處理 ${data.total} 筆${data.inserted != null ? `，實際寫入 ${data.inserted}` : ''}`)
      setShowAdd(false); setAddSingle(''); setAddStart(''); setAddEnd(''); setAddNote('')
      load()
    } finally { setAddBusy(false) }
  }

  async function removeCard(iccid: string) {
    if (!confirm(`確定刪除 ICCID ${iccid}？（僅能刪除手動新增項目）`)) return
    const res = await fetch(`/api/admin/cards?iccid=${encodeURIComponent(iccid)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { alert(data.error || '刪除失敗'); return }
    load()
  }

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ action: 'list', page: String(page), pageSize: String(pageSize) })
    if (search) params.set('search', search)
    if (filterCardType) params.set('card_type', filterCardType)
    if (filterCardStatus) params.set('card_status', filterCardStatus)
    if (filterExpireFrom) params.set('expire_from', filterExpireFrom)
    if (filterExpireTo) params.set('expire_to', filterExpireTo)
    const res = await fetch(`/api/admin/cards?${params}`)
    if (res.ok) {
      const data = await res.json()
      setCards(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page, pageSize])

  function handleSearch() { setPage(1); load() }

  const [detailSubOrderNumber, setDetailSubOrderNumber] = useState<string | null>(null)

  async function openDetail(iccid: string, type: 'expiry' | 'usage' | 'traffic', subOrderNumber?: string | null) {
    setDetailIccid(iccid)
    setDetailType(type)
    setDetailSubOrderNumber(subOrderNumber || null)
    setDetailLoading(true)
    setExpiry(null); setUsage(null); setTraffic([]); setUsageSkuDetails({})

    if (type === 'expiry') {
      const res = await fetch(`/api/admin/cards?action=expiry&iccid=${iccid}`).then((r) => r.json()).catch(() => ({}))
      setExpiry(res.expiry || null)
    } else if (type === 'usage') {
      const params = new URLSearchParams({ action: 'usage', iccid })
      if (subOrderNumber) params.set('channelOrderId', subOrderNumber)
      const res = await fetch(`/api/admin/cards?${params}`).then((r) => r.json()).catch(() => ({}))
      
      if (res.usage?.subOrderList) {
        setUsage(res.usage)
        const uniqueSkuIds = [...new Set(res.usage.subOrderList.map((p: any) => p.skuId))]
        const detailsMap: Record<string, SkuDetail> = {}
        await Promise.all(uniqueSkuIds.map(async (skuId) => {
          const skuRes = await fetch(`/api/admin/cards?action=sku&skuId=${skuId}`).then((r) => r.json()).catch(() => ({}))
          if (skuRes.sku) detailsMap[skuId as string] = skuRes.sku
        }))
        setUsageSkuDetails(detailsMap)
      } else {
        setUsage(null)
      }
    } else if (type === 'traffic') {
      await loadTraffic(iccid)
    }
    setDetailLoading(false)
  }

  async function loadTraffic(iccid: string) {
    setDetailLoading(true)
    const res = await fetch(`/api/admin/cards?action=traffic&iccid=${iccid}&beginDate=${trafficBegin}&endDate=${trafficEnd}`).then((r) => r.json()).catch(() => ({}))
    setTraffic(res.traffic || [])
    setDetailLoading(false)
  }

  function formatKB(kb: number): string {
    if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)}GB`
    if (kb >= 1024) return `${(kb / 1024).toFixed(2)}MB`
    return `${kb}KB`
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <h1 className="text-2xl font-bold">卡片管理</h1>
      <p className="mt-1 text-sm text-gray-500">ICCID 管理 · 套餐資訊查詢 · 共 {total} 張卡片</p>

      {/* 搜尋 */}
      <div className="mt-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋 ICCID、訂單號、套餐名稱..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">
          <Plus className="w-4 h-4" /> 新增卡片
        </button>
        <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" /> {importing ? '匯入中...' : '匯入 Excel'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" disabled={importing} />
        </label>
        <button onClick={syncBcAll} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? '同步中...' : '同步 BC 資料'}
        </button>
      </div>

      {/* 篩選 */}
      <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-gray-500">卡類型：</span>
        <select value={filterCardType} onChange={e => setFilterCardType(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs">
          <option value="">全部</option>
          {Object.entries(CARD_TYPE_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>

        <span className="text-xs text-gray-500 ml-2">狀態：</span>
        <select value={filterCardStatus} onChange={e => setFilterCardStatus(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs">
          <option value="">全部</option>
          {Object.entries(CARD_STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>

        <span className="text-xs text-gray-500 ml-2">有效期：</span>
        <input type="date" value={filterExpireFrom} onChange={e => setFilterExpireFrom(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
        <span className="text-xs text-gray-400">~</span>
        <input type="date" value={filterExpireTo} onChange={e => setFilterExpireTo(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs" />

        <button onClick={() => { setPage(1); load() }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">篩選</button>
        <button onClick={() => { setFilterCardType(''); setFilterCardStatus(''); setFilterExpireFrom(''); setFilterExpireTo(''); setPage(1); setTimeout(load, 0) }}
          className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">清除</button>
      </div>

      {/* 表格 */}
      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">ICCID</th>
                  <th className="text-left px-4 py-3 font-medium w-20">類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">卡類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">狀態</th>
                  <th className="text-right px-4 py-3 font-medium w-16">充值</th>
                  <th className="text-right px-4 py-3 font-medium w-20">延期(天)</th>
                  <th className="text-left px-4 py-3 font-medium w-36">啟用時間</th>
                  <th className="text-left px-4 py-3 font-medium w-36">到期時間</th>
                  <th className="text-left px-4 py-3 font-medium w-40">有效期截止</th>
                  <th className="text-left px-4 py-3 font-medium">備註</th>
                  <th className="text-center px-4 py-3 font-medium w-32">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cards.map((card, i) => (
                  <tr key={`${card.iccid}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{card.iccid}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${card.type === 'esim' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {card.type === 'esim' ? 'eSIM' : 'SIM'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{card.card_type ? (CARD_TYPE_LABEL[card.card_type] || card.card_type) : '-'}</td>
                    <td className="px-4 py-2 text-xs">
                      {card.card_status ? (
                        <span className={`px-1.5 py-0.5 rounded ${CARD_STATUS_COLOR[card.card_status] || 'bg-gray-100 text-gray-500'}`}>
                          {CARD_STATUS_LABEL[card.card_status] || card.card_status}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-right">{card.usage_count ?? '-'}</td>
                    <td className="px-4 py-2 text-xs text-right">{card.postponed_month ?? '-'}</td>
                    <td className="px-4 py-2 text-xs font-mono text-gray-600">{fmtDT(card.activation_start_time)}</td>
                    <td className="px-4 py-2 text-xs font-mono text-gray-600">{fmtDT(card.activation_end_time)}</td>
                    <td className="px-4 py-2 text-xs">
                      <div className="font-mono">{card.expiration_date || '-'}</div>
                      {card.bc_synced_at && <div className="text-[10px] text-gray-400">同步：{fmtDT(card.bc_synced_at)}</div>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 truncate max-w-[240px]">{card.note || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => syncBcOne(card.iccid)} title="同步 BC 資料"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDetail(card.iccid, 'expiry')} title="卡片有效期"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDetail(card.iccid, 'usage')} title="套餐詳情"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-green-600 hover:bg-green-50 rounded">
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDetail(card.iccid, 'traffic')} title="用量詳情"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded">
                          <Database className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeCard(card.iccid)} title="刪除"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分頁 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              每頁
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="px-2 py-1 border border-gray-300 rounded text-sm">
                {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              筆 · 共 {total} 筆
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}

      {/* 詳情彈窗 */}
      {detailIccid && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailIccid(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-bold">
                  {detailType === 'expiry' && '卡片有效期'}
                  {detailType === 'usage' && '套餐詳情'}
                  {detailType === 'traffic' && '用量詳情'}
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">ICCID: {detailIccid}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(['expiry', 'usage', 'traffic'] as const).map((t) => (
                    <button key={t} onClick={() => openDetail(detailIccid, t, detailSubOrderNumber)}
                      className={`px-3 py-1 text-xs font-medium ${detailType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {t === 'expiry' ? '有效期' : t === 'usage' ? '套餐' : '用量'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setDetailIccid(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-5">
              {detailLoading ? (
                <div className="text-center py-8"><RefreshCw className="mx-auto w-6 h-6 text-gray-400 animate-spin" /></div>
              ) : (
                <>
                  {/* 有效期 */}
                  {detailType === 'expiry' && (
                    expiry ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-gray-500">到期日：</span>{expiry.expirationDate}</div>
                        <div><span className="text-gray-500">狀態：</span>{expiry.status}</div>
                        <div><span className="text-gray-500">類型：</span>{expiry.type}</div>
                        <div><span className="text-gray-500">充值次數：</span>{expiry.usageCount}</div>
                        <div><span className="text-gray-500">已延期：</span>{expiry.postponedMonth} 月</div>
                        <div><span className="text-gray-500">最大可延期：</span>{expiry.maxDelayMonth} 月</div>
                        {expiry.supportUpgradeMultiCard && <div><span className="text-gray-500">多卡升級：</span>{expiry.supportUpgradeMultiCard === '1' ? '支持' : '不支持'}</div>}
                      </div>
                    ) : <p className="text-sm text-gray-500">查無資料</p>
                  )}

                  {/* 套餐詳情 */}
                  {detailType === 'usage' && (
                    usage?.subOrderList && usage.subOrderList.length > 0 ? (
                      <div className="space-y-4">
                        {usage.subOrderList.map((plan, i) => {
                          const sku = usageSkuDetails[plan.skuId]
                          return (
                            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                              {/* 基礎用量資訊 */}
                              <div className="p-4 bg-white text-sm">
                                <div className="font-medium text-blue-900">{plan.skuName}</div>
                                <div className="flex items-center gap-3 mt-1.5 mb-3 pb-3 border-b border-gray-100 text-xs">
                                  <div className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">ID: {plan.skuId}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-gray-500">狀態：</span>
                                    <span className={`font-medium ${plan.planStatus === '1' ? 'text-green-600' : plan.planStatus === '0' ? 'text-gray-600' : 'text-orange-600'}`}>
                                      {PLAN_STATUS[plan.planStatus] || plan.planStatus}
                                    </span>
                                  </div>
                                  <div><span className="text-gray-500">天數：</span>{plan.remainingDays || '-'} / {plan.totalDays || '-'}</div>
                                  {plan.planStartTime && <div><span className="text-gray-500">開始：</span><span className="font-mono">{plan.planStartTime}</span></div>}
                                  {plan.planEndTime && <div><span className="text-gray-500">結束：</span><span className="font-mono">{plan.planEndTime}</span></div>}
                                  {plan.totalTraffic && <div><span className="text-gray-500">流量：</span>{plan.remainingTraffic || '-'} / {plan.totalTraffic}</div>}
                                </div>
                              </div>

                              {/* SKU 詳細資訊 */}
                              {sku && (
                                <div className="p-4 bg-gray-50 text-xs border-t border-gray-200 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
                                    <div><span className="text-gray-500 mr-1.5">高速流量:</span><span className="font-medium">{sku.high_flow_size || '-'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">限速峰值:</span><span className="font-medium">{sku.limit_flow_speed || '-'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">套餐類型:</span><span className="font-medium">{sku.plan_type === 'daily' ? '日切型' : sku.plan_type === 'duration' ? '總量型' : sku.plan_type || '總量型'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">支持加速:</span><span className="font-medium">{sku.acceleration_support === '1' ? '支持全部' : '不支持'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">熱點分享:</span><span className="font-medium">{sku.hotspot_support === '1' ? '支持' : sku.hotspot_support === '0' ? '不支持' : '-'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">時區:</span><span className="font-medium">{sku.time_zone || '-'}</span></div>
                                  </div>

                                  {sku.country_data && sku.country_data.length > 0 && (
                                    <div className="pt-3 border-t border-gray-200 mt-3 flex items-center justify-between">
                                      <span className="text-gray-600 font-medium">覆蓋國家地區 & 運營商 ({sku.country_data.length})</span>
                                      <button 
                                        onClick={() => setCountryDetail(sku.country_data)} 
                                        className="text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded transition-colors"
                                      >
                                        查看詳情
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : <p className="text-sm text-gray-500">查無套餐資訊</p>
                  )}

                  {/* 用量詳情 */}
                  {detailType === 'traffic' && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <input type="date" value={trafficBegin} onChange={(e) => setTrafficBegin(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        <span className="text-xs text-gray-400">至</span>
                        <input type="date" value={trafficEnd} onChange={(e) => setTrafficEnd(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        <button onClick={() => loadTraffic(detailIccid)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">查詢</button>
                      </div>

                      {traffic.length > 0 ? (
                        <>
                          {/* 國家統計 */}
                          {(() => {
                            const map = new Map<string, number>(); let totalKB = 0
                            for (const t of traffic) { map.set(t.country, (map.get(t.country) || 0) + t.usedAmountKB); totalKB += t.usedAmountKB }
                            return (
                              <div className="p-3 bg-blue-50 rounded-lg mb-3">
                                <div className="flex flex-wrap gap-2">
                                  {Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([c, kb]) => (
                                    <div key={c} className="px-2 py-1 bg-white rounded border border-blue-200 text-xs">
                                      <div className="text-gray-500">{c}</div><div className="font-semibold text-blue-600">{formatKB(kb)}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 text-xs"><span className="text-gray-500">總用量：</span><span className="font-semibold">{formatKB(totalKB)}</span></div>
                              </div>
                            )
                          })()}
                          <table className="w-full text-xs">
                            <thead className="text-gray-500"><tr><th className="text-left py-1">日期</th><th className="text-left py-1">地區/國家</th><th className="text-right py-1">用量</th></tr></thead>
                            <tbody className="divide-y divide-gray-100">
                              {traffic.map((t, i) => (
                                <tr key={i}><td className="py-1.5 text-gray-400">{t.usedDate}</td><td className="py-1.5">{t.country}</td><td className="py-1.5 text-right font-medium">{formatKB(t.usedAmountKB)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : <p className="text-sm text-gray-500">此區間無流量記錄</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 新增卡片彈窗 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !addBusy && setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-lg">新增卡片</h2>
              <button onClick={() => !addBusy && setShowAdd(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* 模式切換 */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => setAddMode('single')} className={`flex-1 py-2 text-sm font-medium ${addMode === 'single' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>單個</button>
                <button onClick={() => setAddMode('range')} className={`flex-1 py-2 text-sm font-medium ${addMode === 'range' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>號段</button>
              </div>

              {/* 類型 */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">類型：</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" checked={addType === 'sim'} onChange={() => setAddType('sim')} /> SIM
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" checked={addType === 'esim'} onChange={() => setAddType('esim')} /> eSIM
                </label>
              </div>

              {/* 輸入區 */}
              {addMode === 'single' ? (
                <div>
                  <label className="text-xs text-gray-500">ICCID</label>
                  <input value={addSingle} onChange={e => setAddSingle(e.target.value)} placeholder="例：89886969012345678901"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">起始號段</label>
                    <input value={addStart} onChange={e => setAddStart(e.target.value)} placeholder="例：898869690000000001"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">結束號段</label>
                    <input value={addEnd} onChange={e => setAddEnd(e.target.value)} placeholder="例：898869690000000100"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
                  </div>
                  <div className="col-span-2 text-xs text-gray-400">前綴須相同，結尾數字會自動遞增（上限 5000 筆）</div>
                </div>
              )}

              {/* 備註 */}
              <div>
                <label className="text-xs text-gray-500">備註（選填）</label>
                <input value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="例：2026 第二批"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} disabled={addBusy}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={submitAdd} disabled={addBusy}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {addBusy ? '建立中⋯' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 國家/運營商詳情彈窗 */}
      {countryDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => setCountryDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
              <h3 className="font-bold text-lg text-gray-800">覆蓋國家地區 & 運營商</h3>
              <button onClick={() => setCountryDetail(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="overflow-y-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 text-xs shadow-sm shadow-gray-100/50">
                   <tr>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">國家 / 地區</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">運營商</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">優先級</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">網絡</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">APN</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">APN Username</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">APN Password</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {countryDetail.map((c, idx) => {
                     const opCount = Math.max(c.operatorInfo?.length || 1, 1);
                     const operators = c.operatorInfo && c.operatorInfo.length > 0 ? c.operatorInfo : [{ operator: '-', network: '-', priority: '-' }];

                     return (
                       <React.Fragment key={idx}>
                         {operators.map((op, opIdx) => {
                           const isFirst = opIdx === 0;
                           return (
                             <tr key={opIdx} className="hover:bg-gray-50/50 group">
                               {isFirst && <td className="px-4 py-3 font-medium text-gray-800 border-r border-gray-50 align-top bg-white" rowSpan={opCount}>{c.name}</td>}
                               <td className="px-4 py-3 text-gray-700">{op.operator}</td>
                               <td className="px-4 py-3 text-gray-500">{op.priority}</td>
                               <td className="px-4 py-3 text-gray-500">{op.network}</td>
                               {isFirst && (
                                 <>
                                   <td className="px-4 py-3 text-gray-600 font-mono border-l border-gray-50 align-top bg-white" rowSpan={opCount}>{c.apn || '-'}</td>
                                   <td className="px-4 py-3 text-gray-500 font-mono border-l border-gray-50 align-top bg-white" rowSpan={opCount}>{c.apnUsername || '-'}</td>
                                   <td className="px-4 py-3 text-gray-500 font-mono border-l border-gray-50 align-top bg-white" rowSpan={opCount}>{c.apnPassword || '-'}</td>
                                 </>
                               )}
                             </tr>
                           );
                         })}
                       </React.Fragment>
                     )
                   })}
                 </tbody>
               </table>
            </div>
            
            <div className="p-4 border-t border-gray-100 flex justify-end shrink-0 bg-gray-50/50">
              <button 
                onClick={() => setCountryDetail(null)} 
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 font-medium transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
