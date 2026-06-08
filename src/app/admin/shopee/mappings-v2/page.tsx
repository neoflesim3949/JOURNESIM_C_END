'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Link2, ArrowLeft, GripVertical, Trash2, LayoutGrid, List } from 'lucide-react'
import { useUrlState } from '@/lib/use-url-state'
import { BcMatchModal } from '@/components/admin/bc-match-modal'

interface OptionRow {
  id: string
  shopee_product_id: string | null
  shopee_product_name: string | null
  shopee_variation_id: string
  shopee_variation_name: string | null
  main_sku_code: string | null
  variation_sku_code: string | null
  original_price: number | null
  bc_sku_id: string | null
  copies: string | null
  price_override: number | null
  custom_product_name: string | null
  custom_variation_name: string | null
  bc_name: string | null
  cost_cny: number | null
  cost_twd: number | null
  final_price: number | null
  margin: number | null
  margin_pct: number | null
  updated_at: string | null
  bc_changed?: boolean
}
interface Account { id: string; name: string; excel_password: string | null }

const KNOWN_COLS = ['商品ID', '商品名稱', '商品選項ID', '商品規格名稱', '主商品貨號', '商品選項貨號', '價格', 'GTIN', '庫存', '最低購買數量']

// 「商品規格名稱」最後一個逗號前=規格1(數據量)，後=規格2(天數)
function splitSpec(name: string | null): [string, string] {
  const s = (name || '').trim()
  const m = s.match(/^(.*)[,，]\s*([^,，]+)$/)
  if (m) return [m[1].trim(), m[2].trim()]
  return [s || '—', '—']
}
function dayNum(s: string): number {
  const m = s.match(/(\d+)/)
  return m ? Number(m[1]) : 9999
}

export default function ShopeeMappingsV2Page() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useUrlState('account', '')
  const [productId, setProductId] = useUrlState('product', '')
  const [options, setOptions] = useState<OptionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [matching, setMatching] = useState<OptionRow | null>(null) // BC 對應彈窗
  const [specOrders, setSpecOrders] = useState<{ product_id: string; spec_type: string; spec_value: string; sort_index: number }[]>([])
  const [orderOverride, setOrderOverride] = useState<Record<string, string[]>>({})
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 批量定價
  const [showBatchPrice, setShowBatchPrice] = useState(false)
  const [bpMode, setBpMode] = useState<'formula' | 'markup' | 'fixed'>('formula')
  const [bpAdd, setBpAdd] = useState('3')
  const [bpMult, setBpMult] = useState('1.5')
  const [bpFixed, setBpFixed] = useState('')
  const [bpRound, setBpRound] = useState<'ceil' | 'round' | 'floor' | 'none' | 'ceil95' | 'floor95'>('ceil')
  const [bpRoundTo, setBpRoundTo] = useState('1')
  const [productView, setProductView] = useState<'card' | 'list'>('card')
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  // 已忽略警示的商品：商品ID → 當下警示指紋（毛利率/BC變更）。指紋變了(裡面有調整)就重新顯示。存這台電腦
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try { const s = localStorage.getItem('v2_alert_dismissed'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const oursRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/shopee/accounts').then(r => r.json()).then((d: Account[]) => {
      setAccounts(d || [])
      if (!accountId && d?.length) setAccountId(d[0].id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!accountId) { setOptions([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/shopee/mappings-v2?account_id=${accountId}`)
      const d = await res.json()
      setOptions(d.options || [])
      setSpecOrders(d.spec_orders || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function readAoa(file: File): Promise<{ aoa: unknown[][]; sheet_name: string }> {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const sheet = wb.SheetNames[0]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '', raw: false })
      return { aoa, sheet_name: sheet }
    } catch {
      const acc = accounts.find(a => a.id === accountId)
      const password = acc?.excel_password || prompt('此檔案有密碼保護，請輸入密碼') || ''
      const fd = new FormData()
      fd.append('file', file); fd.append('password', password)
      const res = await fetch('/api/admin/shopee/parse-excel?mode=aoa', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message || d.error || '解析失敗')
      return { aoa: d.aoa, sheet_name: d.sheet_name }
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!accountId) { alert('請先選擇蝦皮帳號'); return }
    setImporting(true)
    try {
      const { aoa, sheet_name } = await readAoa(file)
      const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').trim()
      const headerRow = aoa.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === '商品選項ID') && r.some(c => norm(c) === '價格'))
      if (headerRow < 0) { alert('找不到表頭（需含「商品選項ID」與「價格」欄），請確認是蝦皮批量上傳表'); return }
      const header = (aoa[headerRow] as unknown[]).map(c => String(c ?? '').trim())
      const colIndex: Record<string, number> = {}
      header.forEach((h, i) => { const n = norm(h); if (KNOWN_COLS.includes(n)) colIndex[n] = i })
      const varCol = colIndex['商品選項ID']
      let noteRow: number | null = null
      const next = aoa[headerRow + 1] as unknown[] | undefined
      if (next && (varCol === undefined || !norm(next[varCol]))) noteRow = headerRow + 1

      const res = await fetch('/api/admin/shopee/mappings-v2/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, file_name: file.name, sheet_name, raw_aoa: aoa, header, col_index: colIndex, header_row: headerRow, note_row: noteRow }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '匯入失敗'); return }
      alert(`成功匯入 ${d.count} 個選項`)
      load()
    } catch (err) {
      alert('匯入失敗：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch('/api/admin/shopee/mappings-v2', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    await load()
  }

  // 快速碼：skuId_copies → 直接對應
  async function applyQuick(id: string, raw: string, el?: HTMLInputElement) {
    const v = raw.trim()
    if (!v) return
    const m = v.match(/^(.+)_([0-9]+)$/)
    if (!m) { alert('快速碼格式：skuId_copies，例如 1753758976610890_7'); return }
    if (el) el.value = ''
    await patch(id, { bc_sku_id: m[1], copies: m[2] })
  }
  function copyText(t: string) { try { navigator.clipboard?.writeText(t) } catch {} }

  // 編輯自設名稱（寫回 V1 id-mappings 表，標籤/收據共用）
  async function saveName(type: 'product' | 'variation', key: string, name: string) {
    await fetch('/api/admin/shopee/mappings-v2/names', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, type, key, display_name: name }),
    })
    await load()
  }

  // 警示指紋：各選項的毛利率 + BC變更；裡面調整(毛利/BC變)就會變，紅色自動再現
  function alertFingerprint(opts: OptionRow[]): string {
    let h = 5381
    for (const o of opts) {
      const s = `${o.shopee_variation_id}:${o.margin_pct ?? ''}:${o.bc_changed ? 1 : 0}`
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    }
    return String(h)
  }
  // 忽略紅卡警示（外層確認；綁定當下指紋，裡面有調整會重新顯示）。存這台電腦
  function dismissAlert(pid: string, fp: string) {
    setDismissedAlerts(prev => {
      const n = { ...prev, [pid]: fp }
      try { localStorage.setItem('v2_alert_dismissed', JSON.stringify(n)) } catch {}
      return n
    })
  }
  function resetAlerts() {
    setDismissedAlerts({})
    try { localStorage.removeItem('v2_alert_dismissed') } catch {}
  }

  // 確認 BC 變更：把該商品所有已變更選項的快照更新成現況，清除紅色警示
  async function resnapshotProduct() {
    if (!current || !accountId) return
    const ids = current.opts.filter(o => o.bc_changed).map(o => o.id)
    if (!ids.length) return
    await fetch('/api/admin/shopee/mappings-v2/resnapshot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, ids }),
    })
    load()
  }

  // 下載「我們自己的表」（可在 Excel 編輯自設名稱/售價/快速碼，再上傳套回）
  function exportOurs() {
    const list = (selectedProducts.size > 0
      ? options.filter(o => selectedProducts.has(o.shopee_product_id || `__${o.id}`))
      : options).slice()
    if (list.length === 0) { alert('沒有資料'); return }
    // 排序：商品 → 數據量(自訂拖曳順序) → 天數(小到大)
    const pidOf = (o: OptionRow) => o.shopee_product_id || `__${o.id}`
    const prodIndex = new Map(products.map((p, i) => [p.id, i]))
    const dataIdxByProd = new Map<string, Map<string, number>>()
    for (const s of specOrders) {
      if (s.spec_type !== 'data') continue
      if (!dataIdxByProd.has(s.product_id)) dataIdxByProd.set(s.product_id, new Map())
      dataIdxByProd.get(s.product_id)!.set(s.spec_value, s.sort_index)
    }
    const dataRank = (o: OptionRow) => {
      const pid = pidOf(o); const s1 = splitSpec(o.shopee_variation_name)[0]
      const ov = orderOverride[pid]
      if (ov) { const i = ov.indexOf(s1); return i === -1 ? 9999 : i }
      return dataIdxByProd.get(pid)?.get(s1) ?? 9999
    }
    list.sort((a, b) => {
      const pa = prodIndex.get(pidOf(a)) ?? 9999, pb = prodIndex.get(pidOf(b)) ?? 9999
      if (pa !== pb) return pa - pb
      const da = dataRank(a), db = dataRank(b)
      if (da !== db) return da - db
      return dayNum(splitSpec(a.shopee_variation_name)[1]) - dayNum(splitSpec(b.shopee_variation_name)[1])
    })
    const rows = list.map(o => ({
      '蝦皮商品ID': o.shopee_product_id || '',
      '商品名稱': o.shopee_product_name || '',
      '蝦皮商品選項ID': o.shopee_variation_id,
      '規格名稱': o.shopee_variation_name || '',
      '商品自設名稱': o.custom_product_name || '',
      '規格自設名稱': o.custom_variation_name || '',
      '對應BC快速碼': o.bc_sku_id ? `${o.bc_sku_id}_${o.copies}` : '',
      '售價(覆蓋)': o.price_override ?? '',
      '原蝦皮價(參考)': o.original_price ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '商品對應V2')
    XLSX.writeFile(wb, `商品對應V2_我們的表_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // 上傳「我們自己的表」：依選項ID 套用 商品自設名稱/規格自設名稱/售價(覆蓋)/快速碼
  async function uploadOurs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!accountId) { alert('請先選擇蝦皮帳號'); return }
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!json.length) { alert('檔案沒有資料'); return }
      const header = Object.keys(json[0])
      const hasProd = header.includes('商品自設名稱')
      const hasVar = header.includes('規格自設名稱')
      const hasPrice = header.includes('售價(覆蓋)')
      const hasQuick = header.includes('對應BC快速碼')
      const rows = json.map(r => {
        const variation_id = String(r['蝦皮商品選項ID'] || '').trim()
        if (!variation_id) return null
        const set: Record<string, unknown> = {}
        if (hasProd) set.custom_product_name = String(r['商品自設名稱'] || '').trim() || null
        if (hasVar) set.custom_variation_name = String(r['規格自設名稱'] || '').trim() || null
        if (hasPrice) { const v = String(r['售價(覆蓋)'] || '').trim(); set.price_override = v === '' ? null : Number(v) }
        if (hasQuick) { const m = String(r['對應BC快速碼'] || '').trim().match(/^(.+)_([0-9]+)$/); if (m) { set.bc_sku_id = m[1]; set.copies = m[2] } }
        return Object.keys(set).length ? { variation_id, set } : null
      }).filter(Boolean)
      if (!rows.length) { alert('沒有可套用的列（需有「蝦皮商品選項ID」欄）'); return }
      const res = await fetch('/api/admin/shopee/mappings-v2/import-ours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, rows }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '上傳失敗'); return }
      alert(`已套用 ${d.count} 筆`)
      load()
    } catch (err) {
      alert('解析失敗：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      if (oursRef.current) oursRef.current.value = ''
    }
  }

  async function doExport() {
    if (!accountId) return
    setExporting(true)
    try {
      const body = selectedProducts.size > 0 ? { product_ids: [...selectedProducts] } : {}
      const res = await fetch(`/api/admin/shopee/mappings-v2/export?account_id=${accountId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `蝦皮改價_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  // 依商品ID 分組
  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; opts: OptionRow[] }>()
    for (const o of options) {
      const pid = o.shopee_product_id || `__${o.id}`
      if (!map.has(pid)) map.set(pid, { id: pid, name: o.shopee_product_name || '(未命名商品)', opts: [] })
      map.get(pid)!.opts.push(o)
    }
    return [...map.values()]
  }, [options])

  const filteredProducts = search
    ? products.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()))
    : products

  const current = productId ? products.find(p => p.id === productId) : null

  // 當前商品：依數據量(規格1)分組，組內依天數(規格2)排序，每個組合一列展開
  const groups = useMemo(() => {
    if (!current) return []
    const map = new Map<string, OptionRow[]>()
    const order: string[] = []
    for (const o of current.opts) {
      const s1 = splitSpec(o.shopee_variation_name)[0]
      if (!map.has(s1)) { map.set(s1, []); order.push(s1) }
      map.get(s1)!.push(o)
    }
    return order.map(s1 => ({
      spec1: s1,
      rows: map.get(s1)!.slice().sort((a, b) =>
        dayNum(splitSpec(a.shopee_variation_name)[1]) - dayNum(splitSpec(b.shopee_variation_name)[1])),
    }))
  }, [current])

  // 套用自訂數據量排序（拖曳覆蓋優先，其次 DB 儲存的順序，其餘首見順序殿後）
  const orderedGroups = useMemo(() => {
    if (!current) return groups
    const override = orderOverride[current.id]
    const savedIdx = new Map<string, number>()
    for (const s of specOrders) {
      if (s.product_id === current.id && s.spec_type === 'data') savedIdx.set(s.spec_value, s.sort_index)
    }
    const rank = (s1: string) => override ? (override.indexOf(s1) === -1 ? 9999 : override.indexOf(s1)) : (savedIdx.get(s1) ?? 9999)
    return [...groups].sort((a, b) => rank(a.spec1) - rank(b.spec1))
  }, [groups, orderOverride, specOrders, current])

  async function saveSpecOrder(productId: string, order: string[]) {
    setOrderOverride(prev => ({ ...prev, [productId]: order }))
    await fetch('/api/admin/shopee/mappings-v2/spec-order', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, product_id: productId, spec_type: 'data', order }),
    })
  }

  function onDropSpec(toIdx: number) {
    if (dragIdx === null || dragIdx === toIdx || !current) { setDragIdx(null); return }
    const cur = orderedGroups.map(g => g.spec1)
    const [moved] = cur.splice(dragIdx, 1)
    cur.splice(toIdx, 0, moved)
    setDragIdx(null)
    saveSpecOrder(current.id, cur)
  }

  // 勾選 / 批量
  const currentIds = current ? current.opts.map(o => o.id) : []
  const allSelected = currentIds.length > 0 && currentIds.every(id => selectedIds.has(id))
  const selectedCount = currentIds.filter(id => selectedIds.has(id)).length

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (currentIds.every(id => n.has(id))) currentIds.forEach(id => n.delete(id))
      else currentIds.forEach(id => n.add(id))
      return n
    })
  }
  function openProduct(id: string) { setSelectedIds(new Set()); setProductId(id); setSearch('') }

  async function deleteOne(id: string) {
    if (!confirm('刪除此選項？')) return
    await fetch(`/api/admin/shopee/mappings-v2?id=${id}`, { method: 'DELETE' })
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    load()
  }
  async function batchDelete() {
    const ids = currentIds.filter(id => selectedIds.has(id))
    if (ids.length === 0) return
    if (!confirm(`刪除選取的 ${ids.length} 個選項？`)) return
    await fetch('/api/admin/shopee/mappings-v2/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, ids, action: 'delete' }),
    })
    setSelectedIds(new Set())
    load()
  }

  // 批量定價：依勾選項目的 BC 成本(TWD)，用三模式計算售價 + 進位
  async function applyBatchPrice() {
    const ids = currentIds.filter(id => selectedIds.has(id))
    const opts = options.filter(o => ids.includes(o.id))
    if (opts.length === 0) return
    const add = parseFloat(bpAdd) || 0
    const mult = parseFloat(bpMult) || 1
    const fixed = parseFloat(bpFixed)
    const step = parseFloat(bpRoundTo) || 1
    // 無條件進至95：個位 0→降十位個位9(150→149)、1~5→5、6~9→9
    const ceil95 = (v: number) => {
      const n = Math.ceil(v); const u = n % 10; const base = n - u
      if (u === 0) return Math.max(base - 1, 0)
      return u <= 5 ? base + 5 : base + 9
    }
    // 無條件捨至95：個位 5→5、9→9（已是合法結尾）、0~4→降十位個位9、6~8→5
    const floor95 = (v: number) => {
      const n = Math.floor(v); const u = n % 10; const base = n - u
      if (u === 5 || u === 9) return n
      if (u <= 4) return Math.max(base - 1, 0)
      return base + 5
    }
    const round = (v: number) => {
      if (bpRound === 'round') return Math.round(v / step) * step
      if (bpRound === 'floor') return Math.floor(v / step) * step
      if (bpRound === 'none') return Math.round(v)
      if (bpRound === 'ceil95') return ceil95(v)
      if (bpRound === 'floor95') return floor95(v)
      return Math.ceil(v / step) * step
    }
    const rows: { variation_id: string; set: { price_override: number } }[] = []
    for (const o of opts) {
      let price: number | null = null
      if (bpMode === 'fixed') {
        if (!isNaN(fixed)) price = fixed
      } else if (o.cost_twd) {
        price = round(bpMode === 'formula' ? (o.cost_twd + add) * mult : o.cost_twd * mult)
      }
      if (price != null && !isNaN(price)) rows.push({ variation_id: o.shopee_variation_id, set: { price_override: price } })
    }
    if (rows.length === 0) { alert('沒有可計算的項目（未對應 BC 的項目沒有成本，固定價格模式可不需成本）'); return }
    await fetch('/api/admin/shopee/mappings-v2/import-ours', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, rows }),
    })
    setShowBatchPrice(false); setSelectedIds(new Set()); load()
  }

  // 商品層：勾選 / 刪除 / 更新時間
  const latestUpdate = (opts: OptionRow[]) => {
    const ts = opts.map(o => o.updated_at).filter(Boolean).sort()
    const last = ts[ts.length - 1]
    if (!last) return '—'
    return new Date(last).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  }
  const allProductsSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.has(p.id))
  function toggleProduct(id: string) {
    setSelectedProducts(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAllProducts() {
    setSelectedProducts(prev => {
      const n = new Set(prev)
      if (filteredProducts.every(p => n.has(p.id))) filteredProducts.forEach(p => n.delete(p.id))
      else filteredProducts.forEach(p => n.add(p.id))
      return n
    })
  }
  async function deleteProducts(pids: Set<string>) {
    const ids = products.filter(p => pids.has(p.id)).flatMap(p => p.opts.map(o => o.id))
    if (ids.length === 0) return
    if (!confirm(`刪除選取的 ${pids.size} 件商品（共 ${ids.length} 個選項）？`)) return
    await fetch('/api/admin/shopee/mappings-v2/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, ids, action: 'delete' }),
    })
    setSelectedProducts(new Set())
    load()
  }

  const priceOf = (o: OptionRow) => o.final_price ?? o.original_price ?? null
  const rangeStr = (opts: OptionRow[]) => {
    const ps = opts.map(priceOf).filter((x): x is number => x != null)
    if (!ps.length) return '—'
    const lo = Math.min(...ps), hi = Math.max(...ps)
    return lo === hi ? `NT$${lo}` : `NT$${lo}–${hi}`
  }

  return (
    <div>
      {/* 頂部工具列 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">商品對應 V2</h1>
          <p className="text-sm text-gray-500 mt-1">匯入蝦皮批量上傳表 → 依商品分組對應億點、設定售價 → 匯出改價檔回傳蝦皮</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={accountId} onChange={e => { setProductId(''); setSelectedIds(new Set()); setAccountId(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">選擇帳號</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className={`flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg ${accountId && !importing ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
            <Upload className="w-4 h-4" /> {importing ? '匯入中…' : '匯入蝦皮表'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={!accountId || importing} className="hidden" />
          </label>
          <button onClick={doExport} disabled={!accountId || exporting}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> {exporting ? '匯出中…' : (selectedProducts.size > 0 ? `匯出選取 (${selectedProducts.size})` : '匯出改價檔')}
          </button>
        </div>
      </div>

      {!current ? (
        /* ───── 商品列表 ───── */
        <>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="flex items-center gap-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋商品名稱 / 商品ID"
                className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="text-xs text-gray-400 whitespace-nowrap">{filteredProducts.length} 件商品</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleAllProducts} disabled={filteredProducts.length === 0}
                className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {allProductsSelected ? '取消全選' : '全選'}
              </button>
              <button onClick={exportOurs} disabled={!accountId}
                className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">下載我們的表</button>
              <label className={`px-3 py-1.5 border border-gray-300 text-sm rounded-lg ${accountId ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>上傳我們的表
                <input ref={oursRef} type="file" accept=".xlsx,.xls,.csv" onChange={uploadOurs} disabled={!accountId} className="hidden" />
              </label>
              {Object.keys(dismissedAlerts).length > 0 && (
                <button onClick={resetAlerts} title="把忽略的紅卡警示全部還原"
                  className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">重設警示 ({Object.keys(dismissedAlerts).length})</button>
              )}
              <span className="text-gray-300">|</span>
              {selectedProducts.size > 0 && (
                <>
                  <span className="text-sm text-blue-700 font-medium">已選 {selectedProducts.size} 商品</span>
                  <button onClick={() => deleteProducts(selectedProducts)} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">刪除選取</button>
                  <button onClick={() => setSelectedProducts(new Set())} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">清除</button>
                  <span className="text-gray-300">|</span>
                </>
              )}
              <div className="inline-flex border border-gray-300 rounded-lg overflow-hidden">
                <button onClick={() => setProductView('card')} title="圖卡" className={`p-2 ${productView === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setProductView('list')} title="列表" className={`p-2 ${productView === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><List className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">{accountId ? '尚無資料，請匯入蝦皮批量上傳表' : '請先選擇蝦皮帳號'}</div>
          ) : productView === 'card' ? (
            /* 圖卡 */
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProducts.map(p => {
                const mapped = p.opts.filter(o => o.bc_sku_id).length
                const lowMargin = p.opts.some(o => o.margin_pct != null && o.margin_pct < 40)
                const bcChanged = p.opts.some(o => o.bc_changed)
                const alertFp = alertFingerprint(p.opts)
                const showAlert = (lowMargin || bcChanged) && dismissedAlerts[p.id] !== alertFp
                const alertMsg = [lowMargin && '有選項毛利率低於 40%', bcChanged && 'BC 商品已變更（品名/成本）'].filter(Boolean).join('；')
                return (
                  <div key={p.id} onClick={() => openProduct(p.id)}
                    className={`relative cursor-pointer bg-white border rounded-xl p-4 hover:shadow-sm transition ${showAlert ? 'border-red-300 hover:border-red-400 bg-red-50/30' : 'border-gray-200 hover:border-blue-400'}`}>
                    <input type="checkbox" checked={selectedProducts.has(p.id)} onClick={e => e.stopPropagation()} onChange={() => toggleProduct(p.id)}
                      className="absolute top-3 right-3 accent-blue-600" />
                    {showAlert && (
                      <button onClick={e => { e.stopPropagation(); dismissAlert(p.id, alertFp) }} title="忽略警示（清除紅色；裡面有調整會再出現）"
                        className="absolute top-2.5 left-2.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none hover:bg-red-600">✕</button>
                    )}
                    <div className={`font-medium line-clamp-2 min-h-[2.5rem] ${showAlert ? 'pl-5 pr-6 text-red-600' : 'pr-6 text-gray-800'}`} title={alertMsg || undefined}>{p.name}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-1">商品ID: {p.id.startsWith('__') ? '—' : p.id}</div>
                    <div className="flex items-center justify-between mt-3 text-sm">
                      <span className="text-gray-500">{p.opts.length} 個選項</span>
                      <button onClick={e => { e.stopPropagation(); deleteProducts(new Set([p.id])) }} title="刪除商品" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-sm ${mapped === p.opts.length ? 'text-green-600' : 'text-amber-600'}`}>已對應 {mapped}/{p.opts.length}</span>
                      <span className="text-[10px] text-gray-400">更新：{latestUpdate(p.opts)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* 列表 */
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-3 py-2.5 w-10 text-center"><input type="checkbox" checked={allProductsSelected} onChange={toggleAllProducts} className="accent-blue-600" /></th>
                    <th className="text-left px-3 py-2.5 font-medium">商品</th>
                    <th className="text-left px-3 py-2.5 font-medium w-32">商品ID</th>
                    <th className="text-right px-3 py-2.5 font-medium w-20">選項數</th>
                    <th className="text-right px-3 py-2.5 font-medium w-24">已對應</th>
                    <th className="text-right px-3 py-2.5 font-medium w-32">售價範圍</th>
                    <th className="text-left px-3 py-2.5 font-medium w-40">最近更新</th>
                    <th className="px-2 py-2.5 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map(p => {
                    const mapped = p.opts.filter(o => o.bc_sku_id).length
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => openProduct(p.id)}>
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => toggleProduct(p.id)} className="accent-blue-600" />
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const has = p.opts.some(o => (o.margin_pct != null && o.margin_pct < 40) || o.bc_changed)
                            const fp = alertFingerprint(p.opts)
                            const showAlert = has && dismissedAlerts[p.id] !== fp
                            return (
                              <div className="flex items-center gap-1.5">
                                {showAlert && (
                                  <button onClick={e => { e.stopPropagation(); dismissAlert(p.id, fp) }} title="忽略警示（裡面有調整會再出現）"
                                    className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none hover:bg-red-600 shrink-0">✕</button>
                                )}
                                <div className={`font-medium max-w-[480px] truncate ${showAlert ? 'text-red-600' : 'text-gray-800'}`}>{p.name}</div>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-400">{p.id.startsWith('__') ? '—' : p.id}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{p.opts.length}</td>
                        <td className={`px-3 py-2 text-right ${mapped === p.opts.length ? 'text-green-600' : 'text-amber-600'}`}>{mapped}/{p.opts.length}</td>
                        <td className="px-3 py-2 text-right text-blue-600 font-medium whitespace-nowrap">{rangeStr(p.opts)}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{latestUpdate(p.opts)}</td>
                        <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <button onClick={() => deleteProducts(new Set([p.id]))} title="刪除商品" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* ───── 商品詳情：數據量分組 + 天數逐列展開 ───── */
        <>
          <button onClick={() => { setProductId(''); setSelectedIds(new Set()) }} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-3">
            <ArrowLeft className="w-4 h-4" /> 返回商品列表
          </button>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <div className="font-bold text-gray-800">{current.name}</div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">商品ID: {current.id.startsWith('__') ? '—' : current.id} · {current.opts.length} 個選項</div>
            {current.opts.some(o => o.bc_changed) && (
              <button onClick={resnapshotProduct}
                className="mt-2 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700">確認 BC 變更（清除紅色警示）</button>
            )}
          </div>

          {/* 數據量排序（拖曳） */}
          {orderedGroups.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
              <div className="text-xs text-gray-500 mb-2">數據量排序（拖曳調整，會自動儲存；天數依數字排序）</div>
              <div className="flex flex-wrap gap-2">
                {orderedGroups.map((g, i) => (
                  <div key={g.spec1} draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDropSpec(i)}
                    className={`cursor-grab active:cursor-grabbing select-none inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm ${dragIdx === i ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}>
                    <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                    {g.spec1}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 批量工具列 */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 mb-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <span className="text-blue-700 font-medium">已選 {selectedCount} 項</span>
              <span className="text-gray-300">|</span>
              <button onClick={() => setShowBatchPrice(true)} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">批量定價</button>
              <button onClick={batchDelete} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">刪除選取</button>
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 border border-gray-300 rounded hover:bg-white">清除選取</button>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium border-r border-gray-200 min-w-[140px]">數據量</th>
                  <th className="text-left px-3 py-2.5 font-medium w-16">天數</th>
                  <th className="text-left px-3 py-2.5 font-medium w-32">蝦皮商品選項ID</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[120px]">商品自設名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[120px]">規格自設名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[220px]">對應億點 BC</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">BC 成本</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">計算成本</th>
                  <th className="text-right px-3 py-2.5 font-medium w-28">售價(覆蓋)</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">毛利</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">毛利率</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">原蝦皮價</th>
                  <th className="text-center px-2 py-2.5 font-medium w-16">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-blue-600" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderedGroups.map((g, gi) => g.rows.map((o, ri) => {
                  const s2 = splitSpec(o.shopee_variation_name)[1]
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50/40 ${o.bc_changed ? 'bg-red-50' : ''} ${ri === 0 && gi > 0 ? 'border-t-2 border-gray-200' : 'border-t border-gray-100'}`}>
                      {ri === 0 && (
                        <td rowSpan={g.rows.length} className="px-3 py-2 align-middle text-center font-medium text-gray-700 border-r border-gray-200 bg-gray-50/40">{g.spec1}</td>
                      )}
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{s2}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{o.shopee_variation_id}</td>
                      <td className="px-3 py-2">
                        <input defaultValue={o.custom_product_name ?? ''} placeholder="自設名稱"
                          onBlur={e => { const v = e.target.value.trim(); if (v !== (o.custom_product_name ?? '')) saveName('product', o.shopee_variation_id, v) }}
                          className="w-28 px-2 py-1 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="px-3 py-2">
                        <input defaultValue={o.custom_variation_name ?? ''} placeholder="自設規格名稱"
                          onBlur={e => { const v = e.target.value.trim(); if (v !== (o.custom_variation_name ?? '')) saveName('variation', o.shopee_variation_id, v) }}
                          className="w-28 px-2 py-1 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="px-3 py-2">
                        {o.bc_sku_id ? (
                          <div>
                            <div className="relative group inline-block max-w-[260px] align-bottom">
                              <div className={`font-medium truncate ${o.bc_changed ? 'text-red-600' : 'text-blue-700'}`}>{o.bc_name || o.bc_sku_id}</div>
                              <div className="hidden group-hover:block absolute z-30 left-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-[11px] leading-snug rounded shadow-lg whitespace-normal break-words w-[340px]">{o.bc_name || o.bc_sku_id}</div>
                            </div>
                            <button onClick={() => copyText(`${o.bc_sku_id}_${o.copies}`)} title="點擊複製快速碼"
                              className="text-[10px] text-gray-400 font-mono hover:text-blue-600">{o.bc_sku_id}_{o.copies} 📋</button>
                            {o.bc_changed && (
                              <div className="text-[10px] text-red-600 mt-0.5">⚠ BC 已變更
                                <button onClick={() => patch(o.id, { bc_sku_id: o.bc_sku_id, copies: o.copies })} className="ml-1 underline hover:text-red-700">確認</button>
                              </div>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-[11px]">未對應</span>}
                        <div className="mt-1 flex items-center gap-1">
                          <input placeholder="快速碼 skuId_copies"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyQuick(o.id, (e.target as HTMLInputElement).value, e.target as HTMLInputElement) } }}
                            onBlur={e => applyQuick(o.id, e.target.value, e.target)}
                            className="w-36 px-2 py-1 border border-gray-300 rounded text-[11px] font-mono" />
                          <button onClick={() => setMatching(o)} title="搜尋對應" className="inline-flex items-center px-2 py-1 border border-gray-300 rounded text-[10px] text-gray-600 hover:bg-gray-100">
                            <Link2 className="w-3 h-3" />
                          </button>
                          {o.bc_sku_id && (
                            <button onClick={() => patch(o.id, { bc_sku_id: null, copies: null })} className="px-2 py-1 border border-gray-200 rounded text-[10px] text-gray-400 hover:bg-gray-100">取消</button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{o.cost_cny != null ? `¥${o.cost_cny}` : '—'}</td>
                      <td className="px-3 py-2 text-right">{o.cost_twd ? `NT$ ${o.cost_twd}` : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" defaultValue={o.price_override ?? o.original_price ?? ''} placeholder={o.cost_twd ? String(o.cost_twd) : ''}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            const displayed = o.price_override != null ? o.price_override : (o.original_price ?? null)
                            const next = v === '' ? null : Number(v)
                            if (next !== displayed) patch(o.id, { price_override: next })
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right" />
                      </td>
                      <td className="px-3 py-2 text-right">{o.margin != null ? <span className={o.margin >= 0 ? 'text-green-600' : 'text-red-500'}>NT$ {o.margin}</span> : '—'}</td>
                      <td className="px-3 py-2 text-right">{o.margin_pct != null ? <span className={o.margin_pct >= 40 ? 'text-green-600' : 'text-red-500'}>{o.margin_pct}%</span> : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{o.original_price != null ? `NT$ ${o.original_price}` : '—'}</td>
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} className="accent-blue-600 align-middle" />
                        <button onClick={() => deleteOne(o.id)} className="ml-2 text-gray-300 hover:text-red-500 align-middle"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 批量定價 */}
      {showBatchPrice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBatchPrice(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">批量定價（已選 {selectedCount} 項）</h2>
            <div className="mt-3 flex items-center gap-4">
              <label className="flex items-center gap-2"><input type="radio" checked={bpMode === 'formula'} onChange={() => setBpMode('formula')} className="accent-blue-600" /><span className="text-sm">混合公式</span></label>
              <label className="flex items-center gap-2"><input type="radio" checked={bpMode === 'markup'} onChange={() => setBpMode('markup')} className="accent-blue-600" /><span className="text-sm">倍率加成</span></label>
              <label className="flex items-center gap-2"><input type="radio" checked={bpMode === 'fixed'} onChange={() => setBpMode('fixed')} className="accent-blue-600" /><span className="text-sm">固定價格</span></label>
            </div>

            <div className="mt-4">
              {bpMode === 'fixed' ? (
                <input type="number" value={bpFixed} onChange={e => setBpFixed(e.target.value)} placeholder="統一售價 (TWD)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              ) : (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-700 font-medium">公式：{bpMode === 'formula' ? '（成本TWD + 加價）× 倍率' : '成本TWD × 倍率'}</div>
                  <div className={`mt-2 grid ${bpMode === 'formula' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                    {bpMode === 'formula' && (
                      <label className="block text-xs text-gray-500">加價 (TWD)
                        <input type="number" value={bpAdd} onChange={e => setBpAdd(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </label>
                    )}
                    <label className="block text-xs text-gray-500">倍率
                      <input type="number" step="0.1" value={bpMult} onChange={e => setBpMult(e.target.value)} placeholder="例：1.5" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {bpMode !== 'fixed' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-500">進位方式
                  <select value={bpRound} onChange={e => setBpRound(e.target.value as typeof bpRound)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="ceil">無條件進位</option>
                    <option value="round">四捨五入</option>
                    <option value="floor">無條件捨去</option>
                    <option value="none">不進位</option>
                    <option value="ceil95">無條件進至95</option>
                    <option value="floor95">無條件捨至95</option>
                  </select>
                </label>
                {bpRound !== 'ceil95' && bpRound !== 'floor95' && (
                  <label className="block text-xs text-gray-500">進位單位
                    <input type="number" value={bpRoundTo} onChange={e => setBpRoundTo(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </label>
                )}
              </div>
            )}

            <div className="mt-3 text-[11px] text-gray-400">只套用到已對應 BC（有成本）的選項；未對應的略過（固定價格模式不需成本）。寫入「售價(覆蓋)」。</div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={applyBatchPrice} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">套用</button>
              <button onClick={() => setShowBatchPrice(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* BC 對應 */}
      {matching && (
        <BcMatchModal
          subtitle={`${matching.shopee_product_name || ''} · ${matching.shopee_variation_name || ''}`}
          onMatch={(skuId, copies) => { patch(matching.id, { bc_sku_id: skuId, copies }); setMatching(null) }}
          onClose={() => setMatching(null)}
        />
      )}
    </div>
  )
}
