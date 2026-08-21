'use client'

import { useState } from 'react'
import DateRange from '@/components/admin/DateRange'
import { Search, Loader2, Calendar, Printer } from 'lucide-react'

interface PlanSub {
  skuName?: string
  copies?: string
  planStatus?: string
  planStartTime?: string | null
  planEndTime?: string | null
  remainingDays?: string
  totalDays?: string
  totalTraffic?: string
  remainingTraffic?: string
  subOrderId?: string
  channelSubOrderId?: string
}
interface PlanOrder {
  orderId?: string
  channelOrderId?: string
  subOrderList?: PlanSub[]
}
interface Row {
  iccid: string
  card: { type?: string; status?: string; expirationDate?: string; usageCount?: string } | null
  plan: { ok: boolean; orders?: PlanOrder[]; error?: string }
}

// 依 BC 官方文件 F010 status：0-已開卡 1-使用中 2-已用盡 3-失效 4-續期 5-報廢
const CARD_STATUS: Record<string, string> = { '0': '已開卡', '1': '使用中', '2': '已用盡', '3': '失效', '4': '續期', '5': '報廢' }
// 依 BC 官方文件 F012 planStatus：0-未使用 1-正在使用 2-使用結束 3-已取消
const PLAN_STATUS: Record<string, string> = { '0': '未使用', '1': '正在使用', '2': '使用結束', '3': '已取消' }

function fmtTraffic(s?: string) {
  if (s == null || s === '') return '—'
  const n = Number(s)
  if (isNaN(n)) return s
  if (n < 0) return '不限'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' GB'
  return n + ' MB'
}

export default function CardsLookupPage() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null) // 正在送 F017 的 channelSubOrderId
  const [onlyUnused, setOnlyUnused] = useState(true)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set()) // key = `${iccid}|${channelSubOrderId}`
  const [batchWorking, setBatchWorking] = useState(false)
  // 標籤列印（30mm × 15mm，與蝦皮商品標籤同一套 canvas → jsPDF 每張一頁作法）
  const [showExpiryLabel, setShowExpiryLabel] = useState(false)
  const [expiryLabelDate, setExpiryLabelDate] = useState('')
  const [expiryLabelCount, setExpiryLabelCount] = useState(30)
  const [showBlankLabel, setShowBlankLabel] = useState(false)
  const [blankRangeText, setBlankRangeText] = useState('')
  const [showApnLabel, setShowApnLabel] = useState(false)
  const [apnLabelText, setApnLabelText] = useState('')
  const [apnLabelCount, setApnLabelCount] = useState(30)

  async function handleLookup() {
    const iccids = [...new Set(text.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean))]
    if (iccids.length === 0) { alert('請輸入 ICCID'); return }
    if (iccids.length > 200) { alert('單次最多 200 筆，請分批查詢'); return }
    setLoading(true); setError(null); setRows([])
    try {
      const res = await fetch('/api/admin/cards-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iccids }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || '查詢失敗'); return }
      setRows(d.rows || [])
    } finally { setLoading(false) }
  }

  // 把目前可顯示的 row（含過濾後）全部攤平 — 用於全選
  function getVisibleRows() {
    const arr: { iccid: string; sub: PlanSub; order: PlanOrder; key: string }[] = []
    for (const r of rows) {
      if (!r.plan.ok) continue
      for (const o of r.plan.orders || []) {
        for (const s of o.subOrderList || []) {
          if (onlyUnused && (s.planStatus || '') !== '0') continue
          arr.push({ iccid: r.iccid, sub: s, order: o, key: `${r.iccid}|${s.channelSubOrderId || ''}` })
        }
      }
    }
    return arr
  }

  function toggleSelect(key: string) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleSelectAll() {
    const visible = getVisibleRows().filter(v => {
      if (v.order.channelOrderId) return true
      if (v.sub.channelSubOrderId && /[SE]\d+$/.test(v.sub.channelSubOrderId)) return true
      return false
    })
    const allKeys = visible.map(v => v.key)
    const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k))
    setSelected(allSelected ? new Set() : new Set(allKeys))
  }

  async function handleBatchAfterSale() {
    const visible = getVisibleRows()
    const picked = visible.filter(v => selected.has(v.key))
    if (picked.length === 0) { alert('請先勾選'); return }
    const reason = prompt(`對 ${picked.length} 張卡批次申請售後\n請輸入原因代碼：\n20 = 無理由退訂\n29 = eSIM 未下載退訂`)
    if (reason === null) return
    if (!reason.trim()) { alert('請填寫原因代碼'); return }
    if (!confirm(`確定對 ${picked.length} 張卡申請售後？同 channelOrderId 的會合併到同一張售後單，由 BC 自動拆。`)) return

    setBatchWorking(true)
    try {
      const res = await fetch('/api/admin/cards-lookup/aftersale-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          items: picked.map(p => ({
            iccid: p.iccid,
            channelSubOrderId: p.sub.channelSubOrderId,
            channelOrderId: p.order.channelOrderId,
            orderId: p.order.orderId,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) { alert('批次售後失敗：' + (d.error || '未知錯誤')); return }
      const ok = (d.results || []).filter((r: { ok: boolean }) => r.ok).length
      const fail = (d.results || []).filter((r: { ok: boolean }) => !r.ok).length
      const skipped = (d.failed || []).length
      const detail = (d.results || []).map((r: { ok: boolean; channelOrderId: string; iccids: string[]; afterSaleId?: string; error?: string }) =>
        r.ok
          ? `✅ ${r.channelOrderId} (${r.iccids.length} 張) → ${r.afterSaleId}`
          : `❌ ${r.channelOrderId} (${r.iccids.length} 張): ${r.error}`
      ).join('\n')
      alert(`批次完成\n成功 ${ok} 組 / 失敗 ${fail} 組${skipped > 0 ? ` / 跳過 ${skipped} 張（缺 channelOrderId）` : ''}\n\n${detail}`)
      setSelected(new Set())
    } finally { setBatchWorking(false) }
  }

  async function handleAfterSale(iccid: string, sub: PlanSub, order: PlanOrder) {
    const reason = prompt('請輸入售後原因代碼：\n20 = 無理由退訂\n29 = eSIM 未下載退訂')
    if (reason === null) return
    if (!reason.trim()) { alert('請填寫原因代碼'); return }
    if (!confirm(`確定對 ICCID ${iccid} 申請售後退卡？\n子單：${sub.channelSubOrderId}\n原因：${reason}`)) return

    setWorking(sub.channelSubOrderId || iccid)
    try {
      const res = await fetch('/api/admin/cards-lookup/aftersale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iccid,
          channelSubOrderId: sub.channelSubOrderId,
          channelOrderId: order.channelOrderId || '',
          orderId: order.orderId || '',
          reason: reason.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) { alert('售後申請失敗：' + (d.error || '未知錯誤')); return }
      alert(`售後申請成功\n售後單號：${d.afterSaleId}`)
    } finally { setWorking(null) }
  }

  // 產 30mm × 15mm 標籤 PDF（每張一頁，canvas 繪字避免印表機字型/切割位移）
  // 每行字級自動放大到左右滿版；各行總高超出標籤時再整體等比縮回
  async function printLabelsPdf(labels: { text: string; bold?: boolean }[][]) {
    const W_MM = 30, H_MM = 15
    const PX_PER_MM = 24
    const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif'
    const cw = W_MM * PX_PER_MM, ch = H_MM * PX_PER_MM
    const padX = 1 * PX_PER_MM, padY = 0.8 * PX_PER_MM
    const maxW = cw - padX * 2
    const LINE_GAP = 1.12
    const drawCard = (lines: { text: string; bold?: boolean }[]) => {
      const canvas = document.createElement('canvas')
      canvas.width = cw; canvas.height = ch
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch)
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      // 以 100px 量寬 → 等比放大到滿版（文字寬與字級成正比）
      const sizes = lines.map(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}100px ${FONT}`
        const w = ctx.measureText(l.text).width || 1
        return 100 * maxW / w
      })
      const totalH = sizes.reduce((a, b) => a + b * LINE_GAP, 0)
      const k = totalH > ch - padY * 2 ? (ch - padY * 2) / totalH : 1
      let y = (ch - totalH * k) / 2
      lines.forEach((l, i) => {
        const fpx = sizes[i] * k
        ctx.font = `${l.bold ? 'bold ' : ''}${fpx}px ${FONT}`
        ctx.fillText(l.text, cw / 2, y + (fpx * LINE_GAP) / 2)
        y += fpx * LINE_GAP
      })
      return canvas.toDataURL('image/png')
    }

    const win = window.open('', '_blank')
    if (win) win.document.body.innerHTML = '<p id="msg" style="font-family:sans-serif;padding:16px">PDF 產生中…</p>'
    const setMsg = (t: string) => { try { const m = win?.document.getElementById('msg'); if (m) m.textContent = t } catch {} }
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: [W_MM, H_MM], orientation: 'landscape' })
      for (let i = 0; i < labels.length; i++) {
        setMsg(`PDF 產生中… ${i + 1}/${labels.length}`)
        if (i > 0) doc.addPage([W_MM, H_MM], 'landscape')
        doc.addImage(drawCard(labels[i]), 'PNG', 0, 0, W_MM, H_MM)
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

  // 效期標籤：有效日期 / yyyy/mm/dd，重複 N 份
  function printExpiryLabels() {
    if (!expiryLabelDate) { alert('請選擇日期'); return }
    const count = Math.floor(expiryLabelCount)
    if (!count || count < 1 || count > 1000) { alert('份數請填 1 ~ 1000'); return }
    const dateText = expiryLabelDate.replace(/-/g, '/')
    void printLabelsPdf(Array.from({ length: count }, () => [
      { text: '有效日期', bold: true },
      { text: dateText },
    ]))
    setShowExpiryLabel(false)
  }

  // 空白卡標籤：輸入號段（如 22108295501-22108295550），每 10 個一組出「號段起迄／起號／迄號」三行
  function printBlankLabels() {
    const m = blankRangeText.trim().match(/^(\d+)\s*[-~～]\s*(\d+)$/)
    if (!m) { alert('號段格式錯誤，範例：22108295501-22108295550'); return }
    const [, sStr, eStr] = m
    const start = BigInt(sStr), end = BigInt(eStr)
    if (end < start) { alert('迄號不可小於起號'); return }
    const total = end - start + BigInt(1)
    if (total > BigInt(10000)) { alert('號段超過 10000 張，請分批列印'); return }
    const pad = sStr.length
    const fmt = (n: bigint) => n.toString().padStart(pad, '0')
    const labels: { text: string; bold?: boolean }[][] = []
    for (let a = start; a <= end; a += BigInt(10)) {
      const b = a + BigInt(9) <= end ? a + BigInt(9) : end
      labels.push([
        { text: '號段起迄', bold: true },
        { text: fmt(a) },
        { text: fmt(b) },
      ])
    }
    if (!confirm(`共 ${total} 張卡，將列印 ${labels.length} 張標籤（每 10 個一組），確定？`)) return
    void printLabelsPdf(labels)
    setShowBlankLabel(false)
  }

  // APN 標籤：APN / 內容，重複 N 份
  function printApnLabels() {
    const apn = apnLabelText.trim()
    if (!apn) { alert('請輸入 APN'); return }
    const count = Math.floor(apnLabelCount)
    if (!count || count < 1 || count > 1000) { alert('份數請填 1 ~ 1000'); return }
    void printLabelsPdf(Array.from({ length: count }, () => [
      { text: 'APN', bold: true },
      { text: apn },
    ]))
    setShowApnLabel(false)
  }

  async function loadExpiring(scope: 'tomorrow' | 'month' | 'range' = 'tomorrow') {
    let url = '/api/admin/cards/expiring-tomorrow'
    if (scope === 'month') url = '/api/admin/cards/expiring-month'
    else if (scope === 'range') {
      if (!rangeFrom || !rangeTo) { alert('請選擇起訖日期'); return }
      url = `/api/admin/cards/expiring-range?from=${rangeFrom}&to=${rangeTo}`
    }
    const res = await fetch(url)
    const d = await res.json()
    if (!res.ok) { alert(d.error || '查詢失敗'); return }
    if (!d.iccids || d.iccids.length === 0) {
      alert(`${d.label || (d.dates || []).join(' / ')} 沒有到期卡片`)
      return
    }
    const allIccids: string[] = d.iccids
    setText(allIccids.join('\n'))
    setLoading(true); setError(null); setRows([])
    try {
      // 卡片查詢單次上限 200，分批查詢再合併
      const merged: Row[] = []
      for (let i = 0; i < allIccids.length; i += 200) {
        const batch = allIccids.slice(i, i + 200)
        const r2 = await fetch('/api/admin/cards-lookup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iccids: batch }),
        })
        const d2 = await r2.json()
        if (!r2.ok) { setError(d2.error || '查詢失敗'); break }
        merged.push(...(d2.rows || []))
        setRows([...merged]) // 逐批更新，邊查邊顯示
      }
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">卡片查詢退卡</h1>
          <p className="mt-1 text-sm text-gray-500">貼入多筆 ICCID（每行一個或以逗號 / 空白分隔），一次查 F010 卡狀態 + F012 套餐使用，可直接申請 F017 售後</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setShowExpiryLabel(true)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
            <Printer className="w-4 h-4" /> 列印效期標籤
          </button>
          <button onClick={() => setShowBlankLabel(true)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
            <Printer className="w-4 h-4" /> 列印空白卡標籤
          </button>
          <button onClick={() => setShowApnLabel(true)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
            <Printer className="w-4 h-4" /> 列印 APN 標籤
          </button>
          <button onClick={() => loadExpiring('tomorrow')}
            className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700">
            <Calendar className="w-4 h-4" /> 查詢到期卡片
          </button>
          <button onClick={() => loadExpiring('month')}
            className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700">
            <Calendar className="w-4 h-4" /> 查詢本月到期
          </button>
          <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1">
            <DateRange from={rangeFrom} to={rangeTo} onFrom={setRangeFrom} onTo={setRangeTo} label="日期" />
            <button onClick={() => loadExpiring('range')}
              className="ml-1 px-3 py-1 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700">查詢區間到期</button>
          </div>
        </div>
      </div>

      {showExpiryLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowExpiryLabel(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">列印效期標籤</h2>
            <p className="mt-1 text-xs text-gray-500">30mm × 15mm，兩行滿版：「有效日期」＋日期</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">有效日期</label>
                <input type="date" value={expiryLabelDate} onChange={e => setExpiryLabelDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">份數</label>
                <input type="number" min={1} max={1000} value={expiryLabelCount}
                  onChange={e => setExpiryLabelCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              {/* 預覽：textLength 模擬列印的「字級放大到左右滿版」 */}
              <svg viewBox="0 0 300 150" style={{ width: '30mm', height: '15mm', margin: '0 auto', display: 'block', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4 }}>
                <text x="150" y="52" textAnchor="middle" fontWeight="bold" fontSize="62" textLength="284" lengthAdjust="spacingAndGlyphs">有效日期</text>
                <text x="150" y="122" textAnchor="middle" fontSize="52" textLength="284" lengthAdjust="spacingAndGlyphs">{(expiryLabelDate || 'yyyy-mm-dd').replace(/-/g, '/')}</text>
              </svg>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowExpiryLabel(false)}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={printExpiryLabels}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                <Printer className="w-4 h-4" /> 產生 PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {showBlankLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBlankLabel(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">列印空白卡標籤</h2>
            <p className="mt-1 text-xs text-gray-500">輸入號段，每 10 個號自動切一組，每組一張三行標籤：「號段起迄」＋起號＋迄號（30mm × 15mm）</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">號段（起號-迄號）</label>
                <input type="text" value={blankRangeText} onChange={e => setBlankRangeText(e.target.value)}
                  placeholder="22108295501-22108295550" spellCheck={false}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
              </div>
              {(() => {
                const m = blankRangeText.trim().match(/^(\d+)\s*[-~～]\s*(\d+)$/)
                const s = m ? m[1] : '22108295501'
                let e = '22108295510'
                if (m) {
                  try {
                    const start = BigInt(m[1]); const end = BigInt(m[2])
                    const first = start + BigInt(9) <= end ? start + BigInt(9) : end
                    e = first.toString().padStart(m[1].length, '0')
                  } catch { e = m[2] }
                }
                // 預覽：textLength 模擬列印的「字級放大到左右滿版」（第一張）
                return (
                  <svg viewBox="0 0 300 150" style={{ width: '30mm', height: '15mm', margin: '0 auto', display: 'block', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4 }}>
                    <text x="150" y="40" textAnchor="middle" fontWeight="bold" fontSize="46" textLength="284" lengthAdjust="spacingAndGlyphs">號段起迄</text>
                    <text x="150" y="90" textAnchor="middle" fontSize="40" textLength="284" lengthAdjust="spacingAndGlyphs">{s}</text>
                    <text x="150" y="136" textAnchor="middle" fontSize="40" textLength="284" lengthAdjust="spacingAndGlyphs">{e}</text>
                  </svg>
                )
              })()}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowBlankLabel(false)}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={printBlankLabels}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                <Printer className="w-4 h-4" /> 產生 PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {showApnLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowApnLabel(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">列印 APN 標籤</h2>
            <p className="mt-1 text-xs text-gray-500">30mm × 15mm，兩行滿版：「APN」＋設定值</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">APN</label>
                <input type="text" value={apnLabelText} onChange={e => setApnLabelText(e.target.value)}
                  placeholder="three.mobile.com.hk" spellCheck={false}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">份數</label>
                <input type="number" min={1} max={1000} value={apnLabelCount}
                  onChange={e => setApnLabelCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              {/* 預覽：textLength 模擬列印的「字級放大到左右滿版」 */}
              <svg viewBox="0 0 300 150" style={{ width: '30mm', height: '15mm', margin: '0 auto', display: 'block', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4 }}>
                <text x="150" y="58" textAnchor="middle" fontWeight="bold" fontSize="64" textLength="284" lengthAdjust="spacingAndGlyphs">APN</text>
                <text x="150" y="120" textAnchor="middle" fontSize="34" textLength="284" lengthAdjust="spacingAndGlyphs">{apnLabelText.trim() || 'three.mobile.com.hk'}</text>
              </svg>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowApnLabel(false)}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={printApnLabels}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                <Printer className="w-4 h-4" /> 產生 PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="22107859520&#10;22107859511&#10;22107859512"
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
        <div className="mt-2 flex items-center gap-3">
          <button onClick={handleLookup} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? '查詢中…' : '查詢'}
          </button>
          {rows.length > 0 && (() => {
            // 未使用 = 所有查詢結果中 planStatus=0 的套餐數（不受「只顯示未使用」開關影響）
            let unused = 0
            for (const r of rows) {
              if (!r.plan.ok) continue
              for (const o of r.plan.orders || []) for (const s of o.subOrderList || []) if ((s.planStatus || '') === '0') unused++
            }
            return <span className="text-xs text-gray-500">已查詢 {rows.length} 筆 · <span className="text-amber-600 font-medium">未使用 {unused} 筆</span></span>
          })()}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={onlyUnused} onChange={e => setOnlyUnused(e.target.checked)} />
            只顯示「未使用」
          </label>
          {selected.size > 0 && (
            <button onClick={handleBatchAfterSale} disabled={batchWorking}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-60">
              {batchWorking ? '送出中…' : `批次申請售後 (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">
                  {(() => {
                    const visible = getVisibleRows()
                    const allSelected = visible.length > 0 && visible.every(v => selected.has(v.key))
                    return <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  })()}
                </th>
                <th className="px-3 py-2 text-left border-b">ICCID</th>
                <th className="px-3 py-2 text-left border-b">載體狀態</th>
                <th className="px-3 py-2 text-left border-b">截止日</th>
                <th className="px-3 py-2 text-left border-b">套餐 (skuName ×copies)</th>
                <th className="px-3 py-2 text-left border-b">套餐狀態</th>
                <th className="px-3 py-2 text-left border-b">激活時間</th>
                <th className="px-3 py-2 text-left border-b">結束時間</th>
                <th className="px-3 py-2 text-left border-b">剩餘天數</th>
                <th className="px-3 py-2 text-left border-b">剩餘流量</th>
                <th className="px-3 py-2 text-left border-b">BC 訂單</th>
                <th className="px-3 py-2 text-left border-b">操作</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // 每張卡 → 可顯示的 subs，並依 BC 訂單號分組（同單相鄰、框起來）
                interface Blk { r: Row; subs: { sub: PlanSub; order: PlanOrder }[]; orderId: string }
                const blocks: Blk[] = []
                for (const r of rows) {
                  const subs: { sub: PlanSub; order: PlanOrder }[] = []
                  if (r.plan.ok) for (const o of r.plan.orders || []) for (const s of o.subOrderList || []) {
                    if (onlyUnused && (s.planStatus || '') !== '0') continue
                    subs.push({ sub: s, order: o })
                  }
                  if (subs.length === 0) { if (onlyUnused) continue; blocks.push({ r, subs: [], orderId: '' }) }
                  else blocks.push({ r, subs, orderId: subs[0].order.orderId || '' })
                }
                // 依 BC 訂單號排序 → 同單相鄰
                blocks.sort((a, b) => (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0))

                let band = -1
                return blocks.map((blk, bi) => {
                  const { r, subs, orderId } = blk
                  const prev = blocks[bi - 1], next = blocks[bi + 1]
                  const grouped = !!orderId
                  const gStart = grouped && (!prev || prev.orderId !== orderId)
                  const gEnd = grouped && (!next || next.orderId !== orderId)
                  if (gStart) band++
                  const bg = grouped ? (band % 2 === 0 ? 'bg-blue-50/40' : 'bg-indigo-50/30') : ''
                  const eL = grouped ? 'border-l-2 border-l-blue-500' : ''   // 整組左框
                  const eR = grouped ? 'border-r-2 border-r-blue-500' : ''   // 整組右框

                  if (subs.length === 0) {
                    const eT = gStart ? 'border-t-2 border-t-blue-500' : ''
                    const eB = gEnd ? 'border-b-2 border-b-blue-500' : ''
                    return (
                      <tr key={r.iccid} className={`${grouped ? '' : 'border-b'} hover:bg-gray-50 ${bg}`}>
                        <td className={`px-3 py-2 ${eL} ${eT} ${eB}`}></td>
                        <td className={`px-3 py-2 font-mono ${eT} ${eB}`}>{r.iccid}</td>
                        <td className={`px-3 py-2 ${eT} ${eB}`}>{CARD_STATUS[r.card?.status || ''] || r.card?.status || '—'}</td>
                        <td className={`px-3 py-2 ${eT} ${eB}`}>{r.card?.expirationDate || '—'}</td>
                        <td className={`px-3 py-2 text-gray-400 ${eT} ${eB}`} colSpan={6}>{r.plan.ok ? '無套餐記錄' : <span className="text-red-600">F012 失敗：{r.plan.error}</span>}</td>
                        <td className={`px-3 py-2 ${eT} ${eB}`}>—</td>
                        <td className={`px-3 py-2 ${eR} ${eT} ${eB}`}>—</td>
                      </tr>
                    )
                  }
                  return subs.map(({ sub, order }, i) => {
                    const key = `${r.iccid}|${sub.channelSubOrderId || ''}`
                    const derivable = !!sub.channelSubOrderId && /[SE]\d+$/.test(sub.channelSubOrderId)
                    const noChannel = !order.channelOrderId && !derivable
                    const eT = gStart && i === 0 ? 'border-t-2 border-t-blue-500' : ''            // 組頭上框（每格）
                    const eB = gEnd && i === subs.length - 1 ? 'border-b-2 border-b-blue-500' : ''  // 組尾下框（每格）
                    const eBspan = gEnd ? 'border-b-2 border-b-blue-500' : ''                       // rowSpan 欄底框（跨到卡底）
                    return (
                    <tr key={`${r.iccid}-${i}`} className={`${grouped ? '' : 'border-b'} hover:brightness-95 ${noChannel ? 'bg-amber-50' : bg}`}>
                      <td className={`px-3 py-2 ${eL} ${eT} ${eB}`}>
                        <input type="checkbox" checked={selected.has(key)}
                          onChange={() => toggleSelect(key)}
                          disabled={noChannel}
                          title={noChannel ? '此卡無 channelOrderId，無法透過 F017 退卡' : ''} />
                      </td>
                      {i === 0 && (
                        <>
                          <td className={`px-3 py-2 font-mono align-top ${eT} ${eBspan}`} rowSpan={subs.length}>{r.iccid}</td>
                          <td className={`px-3 py-2 align-top ${eT} ${eBspan}`} rowSpan={subs.length}>{CARD_STATUS[r.card?.status || ''] || r.card?.status || '—'}</td>
                          <td className={`px-3 py-2 align-top ${eT} ${eBspan}`} rowSpan={subs.length}>{r.card?.expirationDate || '—'}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 ${eT} ${eB}`}>{sub.skuName || '—'}{sub.copies ? ` ×${sub.copies}` : ''}</td>
                      <td className={`px-3 py-2 ${eT} ${eB}`}>{PLAN_STATUS[sub.planStatus || ''] || sub.planStatus || '—'}</td>
                      <td className={`px-3 py-2 ${eT} ${eB}`}>{sub.planStartTime || '—'}</td>
                      <td className={`px-3 py-2 ${eT} ${eB}`}>{sub.planEndTime || '—'}</td>
                      <td className={`px-3 py-2 ${eT} ${eB}`}>{sub.remainingDays != null ? `${sub.remainingDays}/${sub.totalDays || '—'}` : '—'}</td>
                      <td className={`px-3 py-2 ${eT} ${eB}`}>{fmtTraffic(sub.remainingTraffic)}</td>
                      <td className={`px-3 py-2 ${eT} ${eB}`}>
                        {i === 0 ? <div className="font-mono text-[11px] font-semibold text-blue-700">{order.orderId || '—'}</div> : <div className="font-mono text-[10px] text-gray-300">〃</div>}
                        <div className="font-mono text-[10px] text-gray-400">{sub.channelSubOrderId || '—'}</div>
                        {noChannel && <div className="text-[10px] text-amber-700 mt-0.5">⚠️ 無渠道單號</div>}
                      </td>
                      <td className={`px-3 py-2 ${eR} ${eT} ${eB}`}>
                        {noChannel ? (
                          <span className="text-[10px] text-amber-700" title="此卡是 BC 端直建（無 channelOrderId），需到 BC 後台手動退">
                            需 BC 後台退
                          </span>
                        ) : (
                          <button onClick={() => handleAfterSale(r.iccid, sub, order)}
                            disabled={working === (sub.channelSubOrderId || r.iccid)}
                            className="px-2 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                            {working === (sub.channelSubOrderId || r.iccid) ? '送出中…' : '申請售後'}
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })
                })
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
