'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUrlState, useUrlStateBatch } from '@/lib/use-url-state'
import { Upload, Search, Package, ChevronRight, Settings, Printer, X, Edit3, Plus, Send } from 'lucide-react'
import { BcMatchModal } from '@/components/admin/bc-match-modal'
import * as XLSX from 'xlsx'

// ── Code 128B 一維條碼 SVG 生成 ──────────────────────────
function generateCode128SVG(text: string, height = 30, barWidth = 1.5): string {
  const P = '212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232'.split(',')
  const STOP = '2331112'
  const START_B = 104
  const vals = Array.from(text).map(c => c.charCodeAt(0) - 32)
  let checksum = START_B
  vals.forEach((v, i) => { checksum += v * (i + 1) })
  checksum = checksum % 103
  const codes = [P[START_B], ...vals.map(v => P[v]), P[checksum], STOP]
  const quietZone = 10 * barWidth
  let x = quietZone
  const bars: string[] = []
  for (const code of codes) {
    for (let i = 0; i < code.length; i++) {
      const w = Number(code[i]) * barWidth
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`)
      x += w
    }
  }
  const totalWidth = x + quietZone
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" style="background:white">${bars.join('')}</svg>`
}

interface ShopeeSettlement {
  wallet_amount: number | null; original_price: number | null; seller_coupon: number | null
  ams_fee: number | null; transaction_fee: number | null; other_service_fee: number | null
  processing_fee: number | null
}

interface ShopeeOrder {
  id: string; shopee_order_number: string; order_status: string | null
  return_status: string | null
  buyer_account: string | null; order_date: string | null
  buyer_total_payment: number | null; recipient_name: string | null
  product_total: number | null; seller_coupon: number | null
  transaction_fee: number | null; other_service_fee: number | null
  payment_processing_fee: number | null; created_at: string
  shopee_account_id: string | null; shopee_tracking_code: string | null
  internal_status: string; shopee_order_items: { id: string; status: string; cost_twd: number | null; quantity: number; sale_price: number | null; original_price: number | null }[]
  shopee_settlements: ShopeeSettlement[]
}

function getFinanceStatus(order: ShopeeOrder): { label: string; color: string } {
  const settlements = order.shopee_settlements || []
  if (settlements.length === 0) return { label: '未匯入', color: 'bg-gray-100 text-gray-500' }
  const s = settlements[0]
  // 商品原價與訂單明細一致（結算單原價有值才用，否則退回明細活動價合計）
  const originalPrice = getOriginalPrice(order)
  // 結算單沒帶折扣時（手動單常見），退回用訂單上的賣家優惠券
  const sellerCoupon = Math.abs(s.seller_coupon ?? order.seller_coupon ?? 0)
  const platformFees = Math.abs(s.ams_fee ?? 0) +
    Math.abs(s.transaction_fee ?? 0) + Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
  const walletAmount = s.wallet_amount ?? 0
  const expected = originalPrice - sellerCoupon - platformFees
  if (Math.abs(expected - walletAmount) > 1) return { label: '金流異常', color: 'bg-red-100 text-red-700' }
  return { label: '已匯入', color: 'bg-green-100 text-green-700' }
}

// 商品原價（與訂單明細「利潤結算」一致）：有金流用結算單原價，否則用明細活動價合計
function getOriginalPrice(order: ShopeeOrder): number {
  const s = order.shopee_settlements?.[0]
  const itemsTotal = (order.shopee_order_items || []).reduce((sum, i) => sum + ((i.sale_price ?? i.original_price ?? 0) * i.quantity), 0)
  return s?.original_price ?? (itemsTotal > 0 ? itemsTotal : order.product_total ?? 0)
}

function getNetProfitRate(order: ShopeeOrder): { rate: number | null; estimated: boolean } {
  const s = order.shopee_settlements?.[0]
  const originalPrice = getOriginalPrice(order)
  if (originalPrice <= 0) return { rate: null, estimated: false }
  const sellerCoupon = Math.abs(s?.seller_coupon ?? order.seller_coupon ?? 0)
  const amsFee = Math.abs(s?.ams_fee ?? 0)
  const txFee = Math.abs(s?.transaction_fee ?? order.transaction_fee ?? 0)
  const otherFee = Math.abs(s?.other_service_fee ?? order.other_service_fee ?? 0)
  const processingFee = Math.abs(s?.processing_fee ?? order.payment_processing_fee ?? 0)
  const platformFees = amsFee + txFee + otherFee + processingFee
  const walletAmount = s?.wallet_amount ?? null
  const totalCost = (order.shopee_order_items || []).reduce((sum, i) => sum + ((i.cost_twd ?? 0) * i.quantity), 0)
  if (totalCost <= 0) return { rate: null, estimated: false }
  const displayAmount = walletAmount ?? (originalPrice - sellerCoupon - platformFees)
  const netProfit = displayAmount - totalCost
  return { rate: (netProfit / originalPrice) * 100, estimated: walletAmount === null }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '處理中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
}

// 已完成：所有商品都已「送出 BC 訂單」(bc_ordered) 或完成
function orderIsCompleted(o: ShopeeOrder): boolean {
  const its = o.shopee_order_items || []
  return its.length > 0 && its.every(i => ['bc_ordered', 'completed'].includes(i.status))
}
// 已回填：所有商品號碼都已填、但尚未全部送出（可批次送 BC）
function orderIsBackfilled(o: ShopeeOrder): boolean {
  if (orderIsCompleted(o)) return false
  const its = o.shopee_order_items || []
  return its.length > 0 && its.every(i => ['iccid_filled', 'bc_ordered', 'completed'].includes(i.status))
}
export default function ShopeeOrdersPage() {
  const [orders, setOrders] = useState<ShopeeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // URL 狀態（進入明細後返回會保留分頁／篩選／排序）
  const [search] = useUrlState('search', '')
  const [searchInput, setSearchInput] = useState(search)
  const [page, setPage] = useUrlState('page', 1)
  const [pageSize] = useUrlState('page_size', 20)
  const [filterOrderDateFrom] = useUrlState('order_date_from', '')
  const [filterOrderDateTo] = useUrlState('order_date_to', '')
  const [filterCreatedFrom] = useUrlState('created_from', '')
  const [filterCreatedTo] = useUrlState('created_to', '')
  const [filterReturnStatus] = useUrlState('return_status', '')
  const [filterFinanceStatus] = useUrlState('finance_status', '')
  const [filterStatus] = useUrlState('status', '')
  const [filterShopeeStatus] = useUrlState('order_status', '')
  const [sortBy] = useUrlState('sort_by', 'order_date')
  const [sortDirRaw] = useUrlState('sort_dir', 'desc')
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc'
  const setUrl = useUrlStateBatch()
  const [importing, setImporting] = useState(false)
  const [importingSettlement, setImportingSettlement] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const settlementFileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [showManualOrder, setShowManualOrder] = useState(false)
  const [manualOrderNumber, setManualOrderNumber] = useState('')
  const [manualBuyer, setManualBuyer] = useState('')
  const [manualAccountId, setManualAccountId] = useState('')
  const [creating, setCreating] = useState(false)
  const [showLabelSettings, setShowLabelSettings] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')
  const [labelSettings, setLabelSettings] = useState<{ line1: number; line2: number; line3: number; orientation: 'landscape' | 'portrait' }>({ line1: 12, line2: 12, line3: 10, orientation: 'landscape' })
  // 寄件單預設寄件人（存 localStorage shopee_sender_info）
  const [senderInfo, setSenderInfo] = useState({ name: '', tax_id: '', phone: '', zip_city: '', address: '', contents: '文件', undeliverable: '退回寄件人' })
  // 蝦皮狀態選項（來自後端 distinct）
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  // 帳號
  const [accounts, setAccounts] = useState<{ id: string; name: string; excel_password: string | null }[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [filterAccount] = useUrlState('account_id', '')
  // 勾選 & 批次列印
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchPrintModal, setBatchPrintModal] = useState<'detail' | 'product' | null>(null)
  const [batchPrintData, setBatchPrintData] = useState<{ order: any; items: any[] }[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  // 批量編輯
  const [batchEditModal, setBatchEditModal] = useState(false)
  const [batchEditData, setBatchEditData] = useState<{ order: any; items: any[] }[]>([])
  const [batchEditLoading, setBatchEditLoading] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  // 從 localStorage 載入設定 + 載入帳號
  useEffect(() => {
    const saved = localStorage.getItem('shopee_label_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // 舊資料沒有 orientation → 補預設 landscape
        if (!parsed.orientation) parsed.orientation = 'landscape'
        setLabelSettings(parsed)
      } catch {}
    }
    const savedExpiry = localStorage.getItem('shopee_expiry_date')
    if (savedExpiry) setExpiryDate(savedExpiry)
    const savedSender = localStorage.getItem('shopee_sender_info')
    if (savedSender) { try { setSenderInfo(prev => ({ ...prev, ...JSON.parse(savedSender) })) } catch {} }
    fetch('/api/admin/shopee/accounts').then(r => r.json()).then(d => setAccounts(d || []))
  }, [])

  function saveExpiryDate(date: string) {
    setExpiryDate(date)
    localStorage.setItem('shopee_expiry_date', date)
  }

  function saveLabelSettings(s: { line1: number; line2: number; line3: number; orientation: 'landscape' | 'portrait' }) {
    setLabelSettings(s)
    localStorage.setItem('shopee_label_settings', JSON.stringify(s))
    setShowLabelSettings(false)
  }

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort_by: sortBy, sort_dir: sortDir })
    if (search) params.set('search', search)
    if (filterReturnStatus) params.set('return_status', filterReturnStatus)
    if (filterOrderDateFrom) params.set('order_date_from', filterOrderDateFrom)
    if (filterOrderDateTo) params.set('order_date_to', filterOrderDateTo)
    if (filterCreatedFrom) params.set('created_from', filterCreatedFrom)
    if (filterCreatedTo) params.set('created_to', filterCreatedTo)
    if (filterAccount) params.set('account_id', filterAccount)
    if (filterShopeeStatus) params.set('order_status', filterShopeeStatus)
    if (filterStatus) params.set('system_status', filterStatus)
    if (filterFinanceStatus) params.set('finance_status', filterFinanceStatus)
    const res = await fetch(`/api/admin/shopee/orders?${params}`)
    if (res.ok) { const d = await res.json(); setOrders(d.data || []); setTotal(d.total || 0); if (d.status_options) setStatusOptions(d.status_options) }
    setLoading(false)
  }

  function toggleSort(col: string) {
    if (sortBy === col) setUrl({ sort_dir: sortDir === 'asc' ? 'desc' : 'asc' })
    else setUrl({ sort_by: col, sort_dir: 'desc' })
  }

  const accountMap = new Map(accounts.map(a => [a.id, a.name]))
  // 系統狀態 & 金流狀態改為伺服器端篩選（分頁會填滿、跨頁正確）
  const displayOrders = orders

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, pageSize, sortBy, sortDir, search, filterReturnStatus, filterOrderDateFrom, filterOrderDateTo, filterCreatedFrom, filterCreatedTo, filterAccount, filterShopeeStatus, filterStatus, filterFinanceStatus])

  // 月份快捷：本期=本月、上期=上月（offset 0/-1）。回傳該月 1 號~月底
  function monthRange(offset: number) {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { from: fmt(from), to: fmt(to) }
  }

  // 解析 Excel（server 端解密密碼保護）
  async function parseExcel(file: File, manualPassword?: string): Promise<Record<string, string>[]> {
    const acctPw = accounts.find(a => a.id === selectedAccount)?.excel_password
    const password = manualPassword || acctPw || ''
    const form = new FormData()
    form.append('file', file)
    if (password) form.append('password', password)
    const res = await fetch('/api/admin/shopee/parse-excel', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) {
      if (data.error === 'encrypted' || data.error === 'wrong_password') {
        const pw = prompt(data.error === 'wrong_password' ? '密碼錯誤，請重新輸入：' : '此 Excel 檔案有密碼保護，請輸入密碼：')
        if (!pw) throw new Error('取消')
        return parseExcel(file, pw)
      }
      throw new Error(data.error || '解析失敗')
    }
    return data.rows
  }

  async function createManualOrder() {
    if (!manualOrderNumber.trim()) { alert('請輸入訂單編號'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/shopee/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopee_order_number: manualOrderNumber.trim(),
          buyer_account: manualBuyer.trim() || null,
          shopee_account_id: manualAccountId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '建立失敗'); return }
      router.push(`/admin/shopee/orders/${data.order.id}`)
    } finally { setCreating(false) }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportResult(null)
    try {
      const rows = await parseExcel(file)
      const res = await fetch('/api/admin/shopee/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, account_id: selectedAccount || undefined }),
      })
      const data = await res.json()
      setImportResult(`匯入完成：新增 ${data.created} 筆、更新 ${data.updated} 筆、商品 ${data.items} 項`)
      load()
    } catch (err) {
      if ((err as Error).message !== '取消') setImportResult(`匯入失敗：${(err as Error).message}`)
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSettlementImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingSettlement(true); setImportResult(null)
    try {
      const rows = await parseExcel(file)
      const res = await fetch('/api/admin/shopee/import-settlement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, account_id: selectedAccount || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setImportResult(`金流匯入完成：新增 ${data.created} 筆、更新 ${data.updated} 筆`)
      } else {
        setImportResult(`金流匯入失敗：${data.error}`)
      }
    } catch (err) {
      if ((err as Error).message !== '取消') setImportResult(`匯入失敗：${(err as Error).message}`)
    }
    setImportingSettlement(false)
    if (settlementFileRef.current) settlementFileRef.current.value = ''
  }

  // 批次列印
  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSelectAll() {
    if (selectedIds.size === displayOrders.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(displayOrders.map(o => o.id)))
  }
  // 批次送出 BC 訂單（對勾選的每筆送單；沒可下單品項的自動略過）
  async function batchSubmitBc() {
    if (selectedIds.size === 0) { alert('請先勾選訂單'); return }
    // 只允許全部都是「已回填」才送；夾到已完成/待處理就整批擋下
    const sel = displayOrders.filter(o => selectedIds.has(o.id))
    if (sel.some(o => !orderIsBackfilled(o))) { alert('你有無法下單的訂單，請重新勾選批次'); return }
    if (!confirm(`對勾選的 ${selectedIds.size} 筆訂單批次送出 BC 訂單？`)) return
    setBatchSubmitting(true)
    let ok = 0, skipped = 0, failed = 0
    const errMsgs: string[] = []
    try {
      for (const oid of selectedIds) {
        try {
          const res = await fetch(`/api/admin/shopee/orders/${oid}/bc-order`, { method: 'POST' })
          const d = await res.json()
          if (!res.ok) {
            if ((d.error || '').includes('無可下單')) skipped++
            else { failed++; if (d.error) errMsgs.push(d.error) }
            continue
          }
          const results = d.results || []
          const errs = results.filter((r: { error?: string }) => r.error)
          if (results.length === 0) skipped++
          else if (errs.length) { failed++; errMsgs.push(...errs.map((e: { error: string }) => e.error)) }
          else ok++
        } catch { failed++ }
      }
      let msg = `批次送出完成：成功 ${ok}、略過 ${skipped}、失敗 ${failed}`
      if (errMsgs.length) msg += '\n\n' + [...new Set(errMsgs)].slice(0, 8).join('\n')
      alert(msg)
      setSelectedIds(new Set())
      load()
    } finally { setBatchSubmitting(false) }
  }

  async function openBatchPrint(type: 'detail' | 'product') {
    if (selectedIds.size === 0) { alert('請先勾選訂單'); return }
    setBatchLoading(true); setBatchPrintModal(type)
    const res = await fetch('/api/admin/shopee/orders/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] }),
    })
    if (res.ok) setBatchPrintData(await res.json())
    setBatchLoading(false)
  }

  // 批次商品標籤改產 PDF（每張一頁，與明細頁一致，避免印表機切割位移）
  async function printBatchProductLabelsPdf() {
    const ls = labelSettings
    const orientation: 'landscape' | 'portrait' = ls.orientation === 'portrait' ? 'portrait' : 'landscape'
    const wMm = orientation === 'portrait' ? 15 : 30
    const hMm = orientation === 'portrait' ? 30 : 15
    const expiry = expiryDate || ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cards = batchPrintData.flatMap((d) => (d.items as any[]).flatMap((item) => Array.from({ length: item.quantity || 1 }, () => ({
      line1: item.custom_product_name || item.shopee_product_name || '',
      line2: item.custom_variation_name || item.shopee_variation_name || '',
      line3: expiry ? `使用期限：${expiry.replace(/-/g, '/')}` : '',
    }))))
    if (!cards.length) { alert('沒有可列印的標籤'); return }

    const PX_PER_MM = 24
    const CSS_PX_PER_MM = 96 / 25.4
    const scale = PX_PER_MM / CSS_PX_PER_MM
    const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif'
    const cw = Math.round(wMm * PX_PER_MM)
    const ch = Math.round(hMm * PX_PER_MM)
    const padX = 2 * PX_PER_MM
    const maxW = cw - padX * 2
    const fit = (ctx: CanvasRenderingContext2D, text: string) => {
      if (!text || ctx.measureText(text).width <= maxW) return text
      let t = text
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
      return t + '…'
    }
    const drawCard = (c: { line1: string; line2: string; line3: string }) => {
      const canvas = document.createElement('canvas')
      canvas.width = cw; canvas.height = ch
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch)
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const lines = [
        { text: c.line1, fpx: ls.line1 * scale, bold: true, ellipsis: true },
        { text: c.line2, fpx: ls.line2 * scale, bold: false, ellipsis: true },
        ...(c.line3 ? [{ text: c.line3, fpx: ls.line3 * scale, bold: false, ellipsis: false }] : []),
      ]
      const heights = lines.map(l => l.fpx * 1.1)
      const totalH = heights.reduce((a, b) => a + b, 0)
      let y = (ch - totalH) / 2
      lines.forEach((l, idx) => {
        ctx.font = `${l.bold ? 'bold ' : ''}${l.fpx}px ${FONT}`
        const text = l.ellipsis ? fit(ctx, l.text) : l.text
        ctx.fillText(text, cw / 2, y + heights[idx] / 2)
        y += heights[idx]
      })
      return canvas.toDataURL('image/png')
    }

    const win = window.open('', '_blank')
    if (win) win.document.body.innerHTML = '<p id="msg" style="font-family:sans-serif;padding:16px">PDF 產生中…</p>'
    const setMsg = (t: string) => { try { const m = win?.document.getElementById('msg'); if (m) m.textContent = t } catch {} }
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation })
      for (let i = 0; i < cards.length; i++) {
        setMsg(`PDF 產生中… ${i + 1}/${cards.length}`)
        if (i > 0) doc.addPage([wMm, hMm], orientation)
        doc.addImage(drawCard(cards[i]), 'PNG', 0, 0, wMm, hMm)
      }
      const blobUrl = doc.output('bloburl') as unknown as string
      if (win) win.location.href = blobUrl
      else window.open(blobUrl, '_blank')
    } catch (e) {
      const msg = 'PDF 產生失敗：' + (e instanceof Error ? e.message : String(e))
      setMsg(msg)
      alert(msg)
    }
  }

  async function openBatchEdit() {
    if (selectedIds.size === 0) { alert('請先勾選訂單'); return }
    setBatchEditLoading(true); setBatchEditModal(true)
    const res = await fetch('/api/admin/shopee/orders/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] }),
    })
    if (res.ok) setBatchEditData(await res.json())
    setBatchEditLoading(false)
  }

  async function reloadBatchEdit() {
    const res = await fetch('/api/admin/shopee/orders/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] }),
    })
    if (res.ok) setBatchEditData(await res.json())
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">蝦皮訂單</h1>
          <p className="mt-1 text-sm text-gray-500">共 {total} 筆訂單</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-gray-500">使用期限：</span>
            <input type="date" value={expiryDate} onChange={(e) => saveExpiryDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          <button onClick={() => setShowLabelSettings(true)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50" title="標籤設定">
            <Settings className="w-4 h-4" />
          </button>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">選擇帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-gray-500">已選 {selectedIds.size} 筆</span>
              <button onClick={batchSubmitBc} disabled={batchSubmitting} className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                <Send className="w-4 h-4" /> {batchSubmitting ? '送出中…' : '批次送出 BC'}
              </button>
              <button onClick={() => openBatchPrint('detail')} className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">
                <Printer className="w-4 h-4" /> 批次商品明細
              </button>
              <button onClick={() => openBatchPrint('product')} className="flex items-center gap-1 px-3 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700">
                <Printer className="w-4 h-4" /> 批次商品標籤
              </button>
              <button onClick={openBatchEdit} className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                <Edit3 className="w-4 h-4" /> 批量編輯
              </button>
            </>
          )}
          <button onClick={() => setShowManualOrder(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">
            <Plus className="w-4 h-4" /> 手動新增訂單
          </button>
          <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer ${importing ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" /> {importing ? '匯入中...' : '匯入訂單 Excel'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
          <label className={`flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 cursor-pointer ${importingSettlement ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" /> {importingSettlement ? '匯入中...' : '匯入金流 Excel'}
            <input ref={settlementFileRef} type="file" accept=".xlsx,.xls" onChange={handleSettlementImport} className="hidden" disabled={importingSettlement} />
          </label>
        </div>
      </div>

      {importResult && (
        <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{importResult}</div>
      )}

      <div className="mt-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="搜尋訂單號、買家、收件人、ICCID..." value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setUrl({ search: searchInput, page: 1 }) }}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button onClick={() => setUrl({ search: searchInput, page: 1 })} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-gray-500">訂單日期：</span>
          <input type="date" value={filterOrderDateFrom} onChange={e => setUrl({ order_date_from: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-400">~</span>
          <input type="date" value={filterOrderDateTo} onChange={e => setUrl({ order_date_to: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <button onClick={() => { const r = monthRange(0); setUrl({ order_date_from: r.from, order_date_to: r.to, page: 1 }) }}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">本期</button>
          <button onClick={() => { const r = monthRange(-1); setUrl({ order_date_from: r.from, order_date_to: r.to, page: 1 }) }}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">上期</button>
          <span className="text-gray-500 ml-2">匯入日期：</span>
          <input type="date" value={filterCreatedFrom} onChange={e => setUrl({ created_from: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-400">~</span>
          <input type="date" value={filterCreatedTo} onChange={e => setUrl({ created_to: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <button onClick={() => { const r = monthRange(0); setUrl({ created_from: r.from, created_to: r.to, page: 1 }) }}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">本期</button>
          <button onClick={() => { const r = monthRange(-1); setUrl({ created_from: r.from, created_to: r.to, page: 1 }) }}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">上期</button>
          <select value={filterReturnStatus} onChange={e => setUrl({ return_status: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs ml-2">
            <option value="">退貨/退款</option>
            <option value="has">有退貨/退款</option>
            <option value="none">無退貨/退款</option>
          </select>
          <select value={filterFinanceStatus} onChange={e => setUrl({ finance_status: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">金流狀態</option>
            <option value="未匯入">未匯入</option>
            <option value="已匯入">已匯入</option>
            <option value="金流異常">金流異常</option>
          </select>
          <select value={filterShopeeStatus} onChange={e => setUrl({ order_status: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">蝦皮狀態</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setUrl({ status: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">系統狀態</option>
            <option value="pending">待處理</option>
            <option value="processing">處理中</option>
            <option value="backfilled">已回填</option>
            <option value="completed">已完成</option>
          </select>
          <select value={filterAccount} onChange={e => setUrl({ account_id: e.target.value, page: 1 })}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs">
            <option value="">全部帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={load} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">重新整理</button>
          <button onClick={() => { setSearchInput(''); setUrl({ order_date_from: '', order_date_to: '', created_from: '', created_to: '', return_status: '', finance_status: '', status: '', order_status: '', account_id: '', search: '', page: 1 }) }}
            className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">清除</button>
        </div>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : orders.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無蝦皮訂單</p>
          <p className="mt-1 text-xs text-gray-400">從蝦皮後台匯出 Excel 後點擊「匯入 Excel」</p>
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={displayOrders.length > 0 && selectedIds.size === displayOrders.length}
                    onChange={toggleSelectAll} className="rounded border-gray-300" />
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort('order_date')}>
                  訂單日期 {sortBy === 'order_date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort('created_at')}>
                  匯入日期 {sortBy === 'created_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left px-4 py-3 font-medium">帳號</th>
                <th className="text-left px-4 py-3 font-medium">蝦皮訂單號</th>
                <th className="text-left px-4 py-3 font-medium">買家</th>
                <th className="text-left px-4 py-3 font-medium">金額</th>
                <th className="text-left px-4 py-3 font-medium">淨利率</th>
                <th className="text-left px-4 py-3 font-medium">商品數</th>
                <th className="text-left px-4 py-3 font-medium">蝦皮狀態</th>
                <th className="text-left px-4 py-3 font-medium">退貨/退款</th>
                <th className="text-left px-4 py-3 font-medium">金流狀態</th>
                <th className="text-left px-4 py-3 font-medium">系統狀態</th>
                <th className="text-left px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayOrders.map((o) => {
                const s = o.internal_status === '不成立'
                  ? { label: '不成立', color: 'bg-gray-100 text-gray-500' }
                  : orderIsCompleted(o)
                    ? STATUS_LABELS.completed
                    : orderIsBackfilled(o)
                      ? { label: '已回填', color: 'bg-indigo-100 text-indigo-700' }
                      : (STATUS_LABELS[o.internal_status] || { label: o.internal_status, color: 'bg-gray-100 text-gray-600' })
                const fs = getFinanceStatus(o)
                const pendingItems = o.shopee_order_items?.filter(i => i.status === 'pending').length || 0
                const fmtDate = (d: string | null) => {
                  if (!d) return '-'
                  const dt = new Date(d)
                  if (isNaN(dt.getTime())) return d.slice(0, 10)
                  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt)
                }
                const simplifyStatus = (st: string | null) => {
                  if (!st) return '-'
                  if (st.includes('已完成')) return '已完成'
                  return st
                }
                return (
                  <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(o.order_date)}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(o.created_at)}</td>
                    <td className="px-4 py-2 text-xs">{o.shopee_account_id ? accountMap.get(o.shopee_account_id) || '-' : '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {o.shopee_order_number}
                      {o.shopee_tracking_code && <div className="text-[10px] text-gray-400">({o.shopee_tracking_code})</div>}
                    </td>
                    <td className="px-4 py-2 text-xs">{o.buyer_account || '-'}</td>
                    <td className="px-4 py-2 text-xs font-medium">NT$ {getOriginalPrice(o) || '-'}</td>
                    <td className="px-4 py-2 text-xs">
                      {(() => {
                        const nr = getNetProfitRate(o)
                        if (nr.rate === null) return <span className="text-gray-400">-</span>
                        return <span className={nr.rate >= 0 ? (nr.estimated ? 'text-blue-600' : 'text-green-600') : 'text-red-500'}>
                          {nr.rate.toFixed(1)}%{nr.estimated && <span className="text-[10px] ml-0.5">(預)</span>}
                        </span>
                      })()}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {o.shopee_order_items?.length || 0}
                      {pendingItems > 0 && <span className="ml-1 text-orange-500">({pendingItems} 待對應)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">{simplifyStatus(o.order_status)}</td>
                    <td className="px-4 py-2 text-xs">{o.return_status || '-'}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${fs.color}`}>{fs.label}</span></td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${s.color}`}>{s.label}</span></td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/shopee/orders/${o.id}`} className="text-gray-400 hover:text-blue-600"><ChevronRight className="w-4 h-4" /></Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              共 {total} 筆 · 每頁
              <select value={pageSize} onChange={e => setUrl({ page_size: Number(e.target.value), page: 1 })}
                className="px-2 py-1 border border-gray-300 rounded text-xs">
                {[20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}

      {/* 批次列印彈窗 */}
      {batchPrintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold">{batchPrintModal === 'detail' ? `批次明細標籤（${batchPrintData.length} 筆）` : `批次商品標籤（${batchPrintData.length} 筆）`}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  // 商品標籤改產 PDF（每張一頁，不漂移）
                  if (batchPrintModal === 'product') { printBatchProductLabelsPdf(); return }
                  const el = document.getElementById('batch-print-area')
                  if (!el) return
                  const html = `<html><head><style>
                      @page{size:100mm 150mm;margin:0}
                      body{margin:0;font-family:sans-serif}
                      .detail-label{page-break-after:always}
                    </style></head><body>${el.innerHTML}</body></html>`
                  const w = window.open('', '', `width=${screen.width},height=${screen.height}`)
                  if (!w) return
                  w.document.write(html)
                  w.document.close()
                  setTimeout(() => { w.print() }, 100)
                }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Printer className="w-4 h-4" /> 列印
                </button>
                <button onClick={() => setBatchPrintModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5" id="batch-print-area">
              {batchLoading ? <p className="text-gray-500 text-sm">載入中...</p> : batchPrintModal === 'detail' ? (
                /* 批次明細標籤 */
                batchPrintData.map((d, idx) => (
                  <div key={idx} className="detail-label" style={{ width: '100mm', minHeight: '150mm', padding: '5mm', fontSize: '11px', fontFamily: 'sans-serif', border: '1px solid #ccc', margin: '0 auto', marginBottom: '5mm', pageBreakAfter: 'always' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span>蝦皮訂單：{d.order.shopee_order_number}</span>
                      {d.order.shopee_account_id && <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>{accountMap.get(d.order.shopee_account_id) || '-'}</span>}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '3mm' }}>日期：{d.order.order_date ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d.order.order_date)) : '-'}</div>
                    <div style={{ borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>收件人：</strong>{d.order.recipient_name}</span><span><strong>電話：</strong>{d.order.recipient_phone}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>地址：</strong>{d.order.zip_code} {d.order.city}{d.order.district} {d.order.shipping_address}</span>
                        <span>{d.order.shipping_method && <><strong>寄送：</strong>{d.order.shipping_method}</>}{d.order.pickup_store_id && <> · <strong>門市：</strong>{d.order.pickup_store_id}</>}</span>
                      </div>
                    </div>
                    {d.order.shopee_tracking_code && (
                      <div style={{ borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '1mm' }}>包裹：{d.order.shopee_tracking_code}</div>
                        <div dangerouslySetInnerHTML={{ __html: generateCode128SVG(d.order.shopee_tracking_code, 25, 1.5) }} />
                      </div>
                    )}
                    <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>商品明細：</div>
                    {d.items.map((item: any, i: number) => (
                      <div key={i} style={{ border: '1px solid #000', borderRadius: '2mm', padding: '2mm', marginBottom: '2mm' }}>
                        <div><strong>{i + 1}. {item.shopee_product_name}</strong> × {item.quantity}</div>
                        <div style={{ fontSize: '10px', color: '#666' }}>{item.shopee_variation_name}</div>
                        {item.iccid?.map((ic: string, j: number) => <div key={j} style={{ fontSize: '9px', fontFamily: 'monospace' }}>ICCID: {ic}</div>)}
                      </div>
                    ))}
                    {d.order.buyer_note && <div style={{ marginTop: '3mm', padding: '2mm', background: '#fff3cd', borderRadius: '2mm', fontSize: '10px' }}><strong>買家備註：</strong>{d.order.buyer_note}</div>}
                    <div style={{ marginTop: '3mm', textAlign: 'right', fontWeight: 'bold' }}>金額：NT$ {d.order.buyer_total_payment}</div>
                  </div>
                ))
              ) : (
                /* 批次商品標籤 — 螢幕預覽用 padding 撐出間隔；列印時 CSS 會清掉 */
                <div className="label-grid" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4mm' }}>
                  {batchPrintData.flatMap((d, idx) =>
                    d.items.flatMap((item: any) =>
                      Array.from({ length: item.quantity }, (_, j) => (
                        <div key={`${idx}-${item.id}-${j}`} className="label"
                          style={{ width: labelSettings.orientation === 'portrait' ? '15mm' : '30mm', height: labelSettings.orientation === 'portrait' ? '30mm' : '15mm', border: '1px solid #ccc', padding: '1mm 2mm', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxSizing: 'border-box', overflow: 'hidden' }}>
                          <div style={{ fontSize: `${labelSettings.line1}px`, fontWeight: 'bold', lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {item.custom_product_name || item.shopee_product_name}
                          </div>
                          <div style={{ fontSize: `${labelSettings.line2}px`, lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {item.custom_variation_name || item.shopee_variation_name}
                          </div>
                          {expiryDate && (
                            <div style={{ fontSize: `${labelSettings.line3}px`, lineHeight: 1.1, whiteSpace: 'nowrap' }}>使用期限：{expiryDate.replace(/-/g, '/')}</div>
                          )}
                        </div>
                      ))
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 批量編輯彈窗 */}
      {batchEditModal && (
        <BatchEditModal
          data={batchEditData}
          loading={batchEditLoading}
          orderIds={[...selectedIds]}
          onClose={() => setBatchEditModal(false)}
          onSaved={() => { load() }}
          onReload={reloadBatchEdit}
        />
      )}

      {/* 標籤字體設定彈窗 */}
      {showManualOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-lg">手動新增蝦皮訂單</h2>
              <button onClick={() => !creating && setShowManualOrder(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-gray-500">蝦皮訂單編號 <span className="text-red-500">*</span></label>
                <input value={manualOrderNumber} onChange={e => setManualOrderNumber(e.target.value)}
                  placeholder="例：26041866A1PX49"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-500">蝦皮帳號</label>
                <select value={manualAccountId} onChange={e => setManualAccountId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="">-</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">買家帳號</label>
                <input value={manualBuyer} onChange={e => setManualBuyer(e.target.value)}
                  placeholder="蝦皮買家 ID"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div className="text-xs text-gray-500 pt-2">
                建立後會進入訂單詳情頁面，可在那裡新增商品明細、收件資訊等。
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowManualOrder(false)} disabled={creating}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={createManualOrder} disabled={creating}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {creating ? '建立中⋯' : '建立並進入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLabelSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold mb-4">標籤 / 收據設定</h2>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-medium">商品標籤方向</p>
              <div className="flex gap-2">
                <button onClick={() => setLabelSettings({ ...labelSettings, orientation: 'landscape' })}
                  className={`flex-1 py-2 text-sm rounded-lg border ${labelSettings.orientation === 'landscape' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                  橫向 30×15
                </button>
                <button onClick={() => setLabelSettings({ ...labelSettings, orientation: 'portrait' })}
                  className={`flex-1 py-2 text-sm rounded-lg border ${labelSettings.orientation === 'portrait' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                  直向 15×30
                </button>
              </div>
              <p className="text-xs text-gray-500 font-medium pt-2">商品標籤字體</p>
              {([['line1', '第一行（商品名稱）'], ['line2', '第二行（規格名稱）'], ['line3', '第三行（使用期限）']] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={labelSettings[key]} onChange={(e) => setLabelSettings({ ...labelSettings, [key]: Number(e.target.value) })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" /> <span className="text-xs text-gray-400">pt</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-3 mt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">收據印章圖片</p>
                {typeof window !== 'undefined' && localStorage.getItem('receipt_stamp_url') ? (
                  <div className="flex items-center gap-3">
                    <img src={localStorage.getItem('receipt_stamp_url')!} alt="印章" style={{ maxHeight: '60px' }} />
                    <button onClick={() => { localStorage.removeItem('receipt_stamp_url'); setShowLabelSettings(false); setTimeout(() => setShowLabelSettings(true), 0) }}
                      className="text-xs text-red-500 hover:underline">移除</button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500">上傳印章圖片</span>
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const form = new FormData()
                      form.append('file', file)
                      const res = await fetch('/api/admin/media', { method: 'POST', body: form })
                      if (res.ok) {
                        const { url } = await res.json()
                        localStorage.setItem('receipt_stamp_url', url)
                        setShowLabelSettings(false); setTimeout(() => setShowLabelSettings(true), 0)
                      }
                    }} />
                  </label>
                )}
              </div>
              <div className="border-t border-gray-200 pt-3 mt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">寄件單預設寄件人</p>
                <div className="space-y-2">
                  <input type="text" placeholder="寄件人姓名 / 公司" value={senderInfo.name}
                    onChange={e => setSenderInfo({ ...senderInfo, name: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" placeholder="統一編號" value={senderInfo.tax_id}
                    onChange={e => setSenderInfo({ ...senderInfo, tax_id: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" placeholder="寄件人電話" value={senderInfo.phone}
                    onChange={e => setSenderInfo({ ...senderInfo, phone: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" placeholder="郵遞區號 + 城市 + 區（例：110 台北市信義區）" value={senderInfo.zip_city}
                    onChange={e => setSenderInfo({ ...senderInfo, zip_city: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" placeholder="詳細地址（例：東興路 41 號 10 樓）" value={senderInfo.address}
                    onChange={e => setSenderInfo({ ...senderInfo, address: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="內裝物品" value={senderInfo.contents}
                      onChange={e => setSenderInfo({ ...senderInfo, contents: e.target.value })}
                      className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    <input type="text" placeholder="無法投遞處理方式" value={senderInfo.undeliverable}
                      onChange={e => setSenderInfo({ ...senderInfo, undeliverable: e.target.value })}
                      className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-center" style={{ width: labelSettings.orientation === 'portrait' ? '15mm' : '30mm', height: labelSettings.orientation === 'portrait' ? '30mm' : '15mm', margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px solid #ccc' }}>
              <div style={{ fontSize: `${labelSettings.line1}px`, fontWeight: 'bold', lineHeight: 1.2 }}>商品名稱預覽</div>
              <div style={{ fontSize: `${labelSettings.line2}px`, lineHeight: 1.2 }}>規格名稱預覽</div>
              <div style={{ fontSize: `${labelSettings.line3}px`, lineHeight: 1.2 }}>使用期限：2026/04/06</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => { localStorage.setItem('shopee_sender_info', JSON.stringify(senderInfo)); saveLabelSettings(labelSettings) }} className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">儲存</button>
              <button onClick={() => setShowLabelSettings(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 批量編輯彈窗 ──────────────────────────
interface SkuGroup {
  shopee_sku_code: string
  shopee_product_name: string
  shopee_variation_name: string
  shopee_product_id: string
  shopee_variation_id: string
  customProductName: string
  customVariationName: string
  bc_sku_id: string | null
  bcSkuName: string | null
  matched_copies: string | null
  count: number
}

function BatchEditModal({ data, loading, orderIds, onClose, onSaved, onReload }: {
  data: { order: any; items: any[] }[]
  loading: boolean
  orderIds: string[]
  onClose: () => void
  onSaved: () => void
  onReload: () => Promise<void> | void
}) {
  const [groups, setGroups] = useState<SkuGroup[]>([])
  const [autoMatching, setAutoMatching] = useState(false)
  async function autoMatchV2() {
    setAutoMatching(true)
    const res = await fetch('/api/admin/shopee/orders/batch-automatch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ids: orderIds }),
    })
    const d = await res.json().catch(() => ({}))
    setAutoMatching(false)
    if (!res.ok) { alert(d.error || '自動對應失敗'); return }
    await onReload()  // 重抓資料 → groups 重算（名稱/BC 帶入）
    onSaved()         // 同步刷新訂單列表
    if (!d.matched) alert('沒有可自動對應的項目（V2 尚未對應這些商品選項）')
  }

  // data 是非同步 fetch 進來，用 effect 在資料抵達時重算 groups（避免「要點兩次才有資料」）
  // 故意不把 maps 放進 deps：儲存後父層會 refetch maps，若依賴會把使用者剛儲存的 bcSkuName 覆蓋掉
  useEffect(() => {
    if (!data || data.length === 0) { setGroups([]); return }
    const skuMap = new Map<string, SkuGroup>()
    for (const d of data) {
      for (const item of d.items) {
        const sku = item.shopee_sku_code || ''
        if (!sku) continue
        if (skuMap.has(sku)) { skuMap.get(sku)!.count++; continue }
        skuMap.set(sku, {
          shopee_sku_code: sku,
          shopee_product_name: item.shopee_product_name || '',
          shopee_variation_name: item.shopee_variation_name || '',
          shopee_product_id: item.shopee_product_id || '',
          shopee_variation_id: item.shopee_variation_id || '',
          customProductName: item.custom_product_name || '',
          customVariationName: item.custom_variation_name || '',
          bc_sku_id: item.bc_sku_id,
          bcSkuName: null,
          matched_copies: item.matched_copies,
          count: 1,
        })
      }
    }
    setGroups([...skuMap.values()])
  }, [data])

  const [saving, setSaving] = useState(false)
  const [matchingIdx, setMatchingIdx] = useState<number | null>(null)

  // 從 data 抓 bc_sku_id 載入名稱（data 抵達後才有 id 可查）
  useEffect(() => {
    if (!data || data.length === 0) return
    const bcIds = [...new Set(data.flatMap(d => d.items).map(i => i.bc_sku_id).filter(Boolean))] as string[]
    if (bcIds.length === 0) return
    fetch(`/api/admin/shopee/bc-search?action=names&sku_ids=${bcIds.join(',')}`).then(r => r.json()).then((list: { sku_id: string; name: string }[]) => {
      const nameMap = new Map(list.map(b => [b.sku_id, b.name]))
      setGroups(prev => prev.map(g => g.bc_sku_id ? { ...g, bcSkuName: nameMap.get(g.bc_sku_id) || null } : g))
    })
  }, [data])

  function updateGroup(idx: number, field: 'customProductName' | 'customVariationName', value: string) {
    setGroups(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n })
  }

  async function matchBc(skuId: string, copies: string) {
    if (matchingIdx === null) return
    const idx = matchingIdx
    const g = groups[idx]
    // 批次對應 API
    await fetch('/api/admin/shopee/orders/batch-match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_ids: orderIds,
        shopee_sku_code: g.shopee_sku_code,
        bc_sku_id: skuId,
        copies,
        shopee_product_id: g.shopee_product_id,
        shopee_variation_id: g.shopee_variation_id,
        shopee_product_name: g.shopee_product_name,
        shopee_variation_name: g.shopee_variation_name,
      }),
    })
    // 取得 BC 商品名稱
    const name = await fetch(`/api/admin/shopee/bc-search?action=names&sku_ids=${skuId}`)
      .then(r => r.json()).then((l: { sku_id: string; name: string }[]) => l[0]?.name || null).catch(() => null)
    setGroups(prev => {
      const n = [...prev]
      n[idx] = { ...n[idx], bc_sku_id: skuId, bcSkuName: name, matched_copies: copies }
      return n
    })
    setMatchingIdx(null)
  }

  async function handleSave() {
    setSaving(true)
    // 自設名稱：寫進這批訂單明細快照，並回寫 V2 蝦皮表（依選項ID）
    for (const g of groups) {
      if (g.customProductName || g.customVariationName) {
        await fetch('/api/admin/shopee/orders/batch-match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_ids: orderIds,
            shopee_sku_code: g.shopee_sku_code,
            bc_sku_id: g.bc_sku_id || null,
            copies: g.matched_copies || null,
            shopee_variation_id: g.shopee_variation_id,
            shopee_product_id: g.shopee_product_id,
            shopee_product_name: g.shopee_product_name,
            shopee_variation_name: g.shopee_variation_name,
            custom_product_name: g.customProductName || null,
            custom_variation_name: g.customVariationName || null,
          }),
        })
      }
    }
    setSaving(false)
    onSaved()
    alert('儲存完成')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold">批量編輯商品（{groups.length} 種商品）</h2>
          <div className="flex items-center gap-2">
            <button onClick={autoMatchV2} disabled={autoMatching}
              className="px-4 py-2 border border-blue-300 text-blue-700 text-sm rounded-lg hover:bg-blue-50 disabled:opacity-50">
              {autoMatching ? '對應中…' : 'V2 自動對應'}
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? '儲存中...' : '全部儲存'}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <p className="text-sm text-gray-500">載入中...</p> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">蝦皮商品</th>
                  <th className="text-left px-3 py-2 font-medium">商品編碼</th>
                  <th className="text-left px-3 py-2 font-medium">自訂名稱</th>
                  <th className="text-left px-3 py-2 font-medium">自訂規格</th>
                  <th className="text-left px-3 py-2 font-medium">BC 對應</th>
                  <th className="text-left px-3 py-2 font-medium w-12">數量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g, idx) => (
                  <tr key={g.shopee_sku_code} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium max-w-[200px] truncate" title={g.shopee_product_name}>{g.shopee_product_name}</div>
                      <div className="text-[10px] text-gray-400 max-w-[200px] truncate" title={g.shopee_variation_name}>{g.shopee_variation_name}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-500 max-w-[120px] truncate">{g.shopee_sku_code}</td>
                    <td className="px-3 py-2">
                      <input value={g.customProductName} onChange={e => updateGroup(idx, 'customProductName', e.target.value)}
                        placeholder="自訂名稱" className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={g.customVariationName} onChange={e => updateGroup(idx, 'customVariationName', e.target.value)}
                        placeholder="自訂規格" className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      {g.bc_sku_id ? (
                        <div>
                          <div className="text-[10px] text-green-600 font-medium">{g.bcSkuName || '-'}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{g.bc_sku_id}</div>
                          <div className="text-[10px] text-gray-400">copies: {g.matched_copies}</div>
                          <button onClick={() => setMatchingIdx(idx)} className="text-[10px] text-blue-500 hover:underline">重新對應</button>
                        </div>
                      ) : (
                        <button onClick={() => setMatchingIdx(idx)} className="px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-700">對應</button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-center">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* BC 對應子彈窗（共用元件，與「新增 BC 商品」一致：可選 SIM/eSIM、電信商） */}
        {matchingIdx !== null && (
          <BcMatchModal
            subtitle={`${groups[matchingIdx].shopee_product_name} · ${groups[matchingIdx].shopee_variation_name}`}
            onMatch={(skuId, copies) => matchBc(skuId, copies)}
            onClose={() => setMatchingIdx(null)}
          />
        )}
      </div>
    </div>
  )
}
