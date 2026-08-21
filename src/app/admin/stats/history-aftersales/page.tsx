'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Loader2, Search } from 'lucide-react'
import DateRange from '@/components/admin/DateRange'

const HMAP: Record<string, string> = {
  '日期': 'aftersale_date', '亿点订单号': 'bc_order_no', '售后单号': 'aftersale_no', '商品名称': 'product_name',
  '售后方式': 'aftersale_method', '售后原因': 'aftersale_reason', '问题卡号': 'problem_iccid',
  '退款金额': 'refund_amount', '受理状态': 'review_status', '退款状态': 'refund_status',
}

interface Row { [k: string]: string | number | null }

export default function HistoryAftersalesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [method, setMethod] = useState('')
  const [review, setReview] = useState('')
  const [refund, setRefund] = useState('')
  const [facets, setFacets] = useState<{ methods: string[]; reviews: string[]; refunds: string[] }>({ methods: [], reviews: [], refunds: [] })
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load(p = page) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), page_size: String(pageSize) })
    if (search) params.set('search', search)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (method) params.set('method', method)
    if (review) params.set('review', review)
    if (refund) params.set('refund', refund)
    const res = await fetch(`/api/admin/stats/history-aftersales?${params}`)
    if (res.ok) { const d = await res.json(); setRows(d.rows || []); setTotal(d.total || 0); setPage(d.page || p) }
    setLoading(false)
  }
  async function loadFacets() {
    const res = await fetch('/api/admin/stats/history-aftersales?facets=1')
    if (res.ok) setFacets(await res.json())
  }
  useEffect(() => { load(1); loadFacets() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function parseFile(file: File): Promise<Row[]> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    let wb: XLSX.WorkBook
    if (ext === 'csv') { wb = XLSX.read(await file.text(), { type: 'string' }) }
    else {
      const buf = await file.arrayBuffer()
      try { wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false }) }
      catch { const bytes = new Uint8Array(buf); let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); wb = XLSX.read(bin, { type: 'binary', cellDates: false }) }
    }
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) throw new Error('沒有工作表')
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    let hr = -1
    for (let r = 0; r < Math.min(grid.length, 10); r++) {
      const line = (grid[r] || []).map(x => String(x).trim())
      if (line.includes('售后单号') || line.includes('亿点订单号')) { hr = r; break }
    }
    if (hr < 0) throw new Error('找不到表頭列')
    const headers = (grid[hr] || []).map(x => String(x).trim())
    const objs: Row[] = []
    for (const r of grid.slice(hr + 1)) {
      if (!(r || []).some(c => String(c).trim() !== '')) continue
      const o: Row = {}
      headers.forEach((h, i) => { const f = HMAP[h]; if (f) o[f] = String((r as unknown[])[i] ?? '').trim() })
      if (o.aftersale_no || o.bc_order_no || o.problem_iccid) objs.push(o)
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
            const res = await fetch('/api/admin/stats/history-aftersales', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rows: objs.slice(i, i + 1000) }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || String(res.status))
            totalUpserted += d.upserted || 0
          }
          totalParsed += objs.length; okFiles++
        } catch (err) { errors.push(`${file.name}：${err instanceof Error ? err.message : String(err)}`) }
      }
      setMsg(`匯入完成：${okFiles}/${files.length} 檔成功、解析 ${totalParsed.toLocaleString()} 列、寫入 ${totalUpserted.toLocaleString()} 筆` + (errors.length ? `；失敗 ${errors.length} 檔：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '…' : ''}` : ''))
      load(1); loadFacets()
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function exportCsv() {
    const cols = ['aftersale_date', 'bc_order_no', 'aftersale_no', 'product_name', 'aftersale_method', 'aftersale_reason', 'problem_iccid', 'refund_amount', 'review_status', 'refund_status']
    const head = ['日期', '亿点订单号', '售后单号', '商品名称', '售后方式', '售后原因', '问题卡号', '退款金额', '受理状态', '退款状态'].join(',')
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n')
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'history-aftersales.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fmt = (v: unknown) => v == null || v === '' ? '—' : String(v)
  const money = (v: unknown) => { const n = Number(v); return v == null || v === '' || isNaN(n) ? '—' : n.toLocaleString() }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">歷史採購售後明細</h1>
          <p className="mt-1 text-sm text-gray-500">BC 售后列表 Excel 批量匯入（依 售後單號｜億點單號｜問題卡號 去重）· 共 {total.toLocaleString()} 筆</p>
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
            placeholder="搜尋 億點單號、售後單、卡號、商品" className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-72" />
        </div>
        <select value={method} onChange={e => setMethod(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部售後方式</option>{facets.methods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={review} onChange={e => setReview(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部受理狀態</option>{facets.reviews.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={refund} onChange={e => setRefund(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">全部退款狀態</option>{facets.refunds.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} label="日期" />
        <button onClick={() => load(1)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">查詢</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 載入中...</p> : (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="text-sm whitespace-nowrap w-full">
            <thead className="bg-gray-50 text-xs">
              <tr>
                {['日期', '億點單號', '售後單號', '商品', '售後方式', '售後原因', '問題卡號', '退款金額', '受理狀態', '退款狀態'].map(h => (
                  <th key={h} className="px-3 py-2 text-left border-b font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">無資料，請匯入 Excel</td></tr>
              ) : rows.map(r => (
                <tr key={String(r.id)} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500">{fmt(r.aftersale_date)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(r.bc_order_no)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(r.aftersale_no)}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={String(r.product_name ?? '')}>{fmt(r.product_name)}</td>
                  <td className="px-3 py-2">{fmt(r.aftersale_method)}</td>
                  <td className="px-3 py-2">{fmt(r.aftersale_reason)}</td>
                  <td className="px-3 py-2 font-mono text-xs max-w-xs truncate" title={String(r.problem_iccid ?? '')}>{fmt(r.problem_iccid)}</td>
                  <td className="px-3 py-2 text-right font-mono text-rose-600">{money(r.refund_amount)}</td>
                  <td className="px-3 py-2">{fmt(r.review_status)}</td>
                  <td className="px-3 py-2">{fmt(r.refund_status)}</td>
                </tr>
              ))}
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
