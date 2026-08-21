'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react'
import DateRange from '@/components/admin/DateRange'

// Excel 中文表頭 → 欄位
const HMAP: Record<string, string> = {
  '序号': 'seq', '销售平台订单号': 'platform_order_no', '亿点订单号': 'bc_order_no',
  '销售渠道编号': 'channel_no', '销售渠道名称': 'channel_name', '操作员': 'operator',
  '订单创建时间': 'order_created_at', '订单类型': 'order_type', '商品编号': 'product_no', '商品名称': 'product_name',
  '份数': 'copies', '实际售价': 'actual_price', '应结算价': 'settle_price', '数量': 'quantity',
  '优惠金额': 'discount', '物流费用': 'shipping_fee', '手机号码': 'phone', '物流方式': 'shipping_method',
  '收货人姓名': 'recipient_name', '收货地址': 'recipient_address', '物流公司': 'logistics_company',
  '关联卡号码': 'related_iccid', '起始号段': 'iccid_start', '截止号段': 'iccid_end',
  '订单状态': 'order_status', '物流状态': 'logistics_status', '用户下单时间': 'user_ordered_at',
  '预计出行日期': 'expected_travel_date', '订单备注': 'note',
}

interface Row { [k: string]: string | number | null }

export default function HistoryOrdersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [channel, setChannel] = useState('')
  const [operator, setOperator] = useState('')
  const [facets, setFacets] = useState<{ channels: string[]; operators: string[] }>({ channels: [], operators: [] })
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lines, setLines] = useState<Record<string, Row[]>>({})

  async function toggleExpand(gk: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(gk) ? s.delete(gk) : s.add(gk); return s })
    if (!lines[gk]) {
      const res = await fetch(`/api/admin/stats/history-orders?group_key=${encodeURIComponent(gk)}`)
      if (res.ok) { const d = await res.json(); setLines(prev => ({ ...prev, [gk]: d.lines || [] })) }
    }
  }

  async function load(p = page) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), page_size: String(pageSize) })
    if (search) params.set('search', search)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (channel) params.set('channel', channel)
    if (operator) params.set('operator', operator)
    const res = await fetch(`/api/admin/stats/history-orders?${params}`)
    if (res.ok) { const d = await res.json(); setRows(d.rows || []); setTotal(d.total || 0); setPage(d.page || p) }
    setLoading(false)
  }
  async function loadFacets() {
    const res = await fetch('/api/admin/stats/history-orders?facets=1')
    if (res.ok) setFacets(await res.json())
  }
  useEffect(() => { load(1); loadFacets() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // 解析單一檔 → 回傳資料列（找不到表頭則丟錯）
  async function parseFile(file: File): Promise<Row[]> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    let wb: XLSX.WorkBook
    if (ext === 'csv') {
      wb = XLSX.read(await file.text(), { type: 'string' })
    } else {
      const buf = await file.arrayBuffer()
      try {
        wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false })
      } catch {
        // 回退：舊 .xls / HTML 偽裝的 xls，改用 binary 字串讀
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        wb = XLSX.read(bin, { type: 'binary', cellDates: false })
      }
    }
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) throw new Error('沒有工作表')
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    let hr = -1
    for (let r = 0; r < Math.min(grid.length, 10); r++) {
      const line = (grid[r] || []).map(x => String(x).trim())
      if (line.includes('销售平台订单号') || line.includes('序号')) { hr = r; break }
    }
    if (hr < 0) throw new Error('找不到表頭列')
    const headers = (grid[hr] || []).map(x => String(x).trim())
    const objs: Row[] = []
    for (const r of grid.slice(hr + 1)) {
      if (!(r || []).some(c => String(c).trim() !== '')) continue
      const o: Row = {}
      headers.forEach((h, i) => { const f = HMAP[h]; if (f) o[f] = String((r as unknown[])[i] ?? '').trim() })
      if (o.platform_order_no || o.bc_order_no || o.related_iccid) objs.push(o)
    }
    return objs
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setImporting(true); setMsg('')
    let totalParsed = 0, totalUpserted = 0, okFiles = 0
    const errors: string[] = []
    try {
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi]
        setMsg(`匯入中… (${fi + 1}/${files.length}) ${file.name}`)
        try {
          const objs = await parseFile(file)
          if (objs.length === 0) { errors.push(`${file.name}：無有效資料列`); continue }
          for (let i = 0; i < objs.length; i += 1000) {
            const res = await fetch('/api/admin/stats/history-orders', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rows: objs.slice(i, i + 1000) }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || String(res.status))
            totalUpserted += d.upserted || 0
          }
          totalParsed += objs.length; okFiles++
        } catch (err) {
          errors.push(`${file.name}：${err instanceof Error ? err.message : String(err)}`)
        }
      }
      setMsg(`匯入完成：${okFiles}/${files.length} 檔成功、解析 ${totalParsed.toLocaleString()} 列、寫入 ${totalUpserted.toLocaleString()} 筆` + (errors.length ? `；失敗 ${errors.length} 檔：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '…' : ''}` : ''))
      load(1); loadFacets()
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function exportCsv() {
    const cols = ['platform_order_no', 'bc_order_no', 'channel_name', 'operator', 'order_created_at', 'order_type', 'product_name', 'copies', 'card_count', 'actual_price', 'settle_price', 'quantity', 'discount', 'shipping_fee', 'phone', 'recipient_name', 'iccid_min', 'iccid_max', 'order_status', 'logistics_status', 'user_ordered_at', 'expected_travel_date', 'note']
    const head = ['销售平台订单号', '亿点订单号', '销售渠道名称', '操作员', '订单创建时间', '订单类型', '商品名称', '份数', '卡数', '实际售价', '应结算价', '数量', '优惠金额', '物流费用', '手机号码', '收货人姓名', '起始卡号', '截止卡号', '订单状态', '物流状态', '用户下单时间', '预计出行日期', '订单备注'].join(',')
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'history-orders.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fmt = (v: unknown) => v == null || v === '' ? '—' : String(v).slice(0, 19).replace('T', ' ')
  const money = (v: unknown) => { const n = Number(v); return v == null || v === '' || isNaN(n) ? '—' : n.toLocaleString() }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">歷史採購訂單明細</h1>
          <p className="mt-1 text-sm text-gray-500">BC 销售订单 Excel 批量匯入 · 底層逐卡儲存、顯示依訂單合併（點列展開看單卡）· 共 {total.toLocaleString()} 筆訂單</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {importing ? '匯入中...' : '匯入 Excel（可多選）'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleImport} className="hidden" />
          <button onClick={exportCsv} disabled={!rows.length}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> 匯出 CSV
          </button>
        </div>
      </div>

      {msg && <div className="mt-3 text-sm bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-3 py-2">{msg}</div>}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
            placeholder="搜尋 平台/億點單號、卡號、商品、收件人" className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-80" />
        </div>
        <select value={channel} onChange={e => setChannel(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部渠道</option>
          {facets.channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={operator} onChange={e => setOperator(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部操作員</option>
          {facets.operators.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="創建" />
        <button onClick={() => load(1)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-2 py-2 border-b w-8"></th>
                {['平台單號', '億點單號', '渠道', '操作員', '創建時間', '類型', '商品', '份數', '卡數', '卡號範圍', '實際售價', '應結算', '數量', '優惠', '物流費', '收件人', '訂單狀態', '物流狀態', '下單時間', '預計出行', '備註'].map(h => (
                  <th key={h} className="px-3 py-2 text-left border-b font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={22} className="px-3 py-10 text-center text-gray-400">無資料，請匯入 Excel</td></tr>
              ) : rows.map(r => {
                const gk = String(r.group_key)
                const open = expanded.has(gk)
                const cardCount = Number(r.card_count) || 0
                const multi = cardCount > 1
                const iccidText = multi ? `${fmt(r.iccid_min)} ~ ${fmt(r.iccid_max)}` : fmt(r.iccid_min)
                return (
                <Fragment key={gk}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(gk)}>
                  <td className="px-2 py-2 text-gray-400">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(r.platform_order_no)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(r.bc_order_no)}</td>
                  <td className="px-3 py-2">{fmt(r.channel_name)}</td>
                  <td className="px-3 py-2">{fmt(r.operator)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmt(r.order_created_at)}</td>
                  <td className="px-3 py-2">{fmt(r.order_type)}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={String(r.product_name ?? '')}>{fmt(r.product_name)}</td>
                  <td className="px-3 py-2">{fmt(r.copies)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{cardCount.toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-xs">{iccidText}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.actual_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.settle_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.quantity)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.discount)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.shipping_fee)}</td>
                  <td className="px-3 py-2">{fmt(r.recipient_name)}</td>
                  <td className="px-3 py-2">{fmt(r.order_status)}</td>
                  <td className="px-3 py-2">{fmt(r.logistics_status)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmt(r.user_ordered_at)}</td>
                  <td className="px-3 py-2 text-xs">{fmt(r.expected_travel_date)}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={String(r.note ?? '')}>{fmt(r.note)}</td>
                </tr>
                {open && (
                  <tr className="bg-gray-50/60">
                    <td></td>
                    <td colSpan={21} className="px-3 py-2">
                      {!lines[gk] ? <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 載入卡號…</span> : (
                        <div className="flex flex-wrap gap-1.5 max-w-full">
                          {lines[gk].map(l => (
                            <span key={String(l.id)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs font-mono" title={`狀態：${l.order_status ?? '—'} / 物流：${l.logistics_status ?? '—'}`}>
                              {String(l.related_iccid || l.iccid_start || '—')}
                            </span>
                          ))}
                          <span className="text-xs text-gray-400 ml-1">共 {lines[gk].length} 張</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <button onClick={() => load(1)} disabled={page <= 1} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">第一頁</button>
          <button onClick={() => load(page - 1)} disabled={page <= 1} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">上一頁</button>
          <span className="text-gray-500">第 {page} / {totalPages} 頁</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">下一頁</button>
          <button onClick={() => load(totalPages)} disabled={page >= totalPages} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">最後頁</button>
          <span className="ml-2 text-gray-500">跳至</span>
          <input type="number" min={1} max={totalPages} defaultValue={page} key={page}
            onKeyDown={e => { if (e.key === 'Enter') { const v = Math.min(totalPages, Math.max(1, Number((e.target as HTMLInputElement).value) || 1)); load(v) } }}
            className="w-16 px-2 py-1.5 border rounded-lg text-center" />
          <span className="text-gray-500">頁</span>
        </div>
      )}
    </div>
  )
}
