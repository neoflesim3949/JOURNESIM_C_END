'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react'

interface OrigItem { description: string; quantity: number; unitPrice: number; unit?: string; amount: number; remark?: string }
interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  invoice_time: string
  buyer_type: string
  tax_type: string
  intype: string
  items: OrigItem[]
  total_sales: number
  total_tax: number
  total_amount: number
  allowance_amount: number
  status: string
}

interface AllowRow {
  description: string
  quantity: string  // 折讓數量
  unitPriceInclTax: string  // 含稅單價（預填原值）
  taxRate: number
}

const TAX_RATE: Record<string, number> = { '1': 0.05, '2': 0, '3': 0, '4': 0.25 } // 4 通常為特種，rate 由發票決定

function fmt(n: number) { return Math.round(n * 100) / 100 }

export default function InvoiceAllowancePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AllowRow[]>([])
  const [allowanceDate, setAllowanceDate] = useState(new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)
  const [adjustMinus1, setAdjustMinus1] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/invoices/${id}`).then(r => r.json()).then((d: Invoice) => {
      setInvoice(d)
      const rate = TAX_RATE[d.tax_type] ?? 0
      // 判斷原發票是「含稅」還是「外加」儲存：若 items 加總 ≈ total_amount 即為含稅
      const sumItems = (d.items || []).reduce((s, it) => s + Number(it.amount || 0), 0)
      const isInclusive = Math.abs(sumItems - Number(d.total_amount)) < 1
      setRows((d.items || []).map((it) => ({
        description: it.description,
        quantity: '',
        // 含稅單價：發票本來就含稅 → 直接帶原 unitPrice；外加 → ×(1+rate)
        unitPriceInclTax: String(isInclusive ? it.unitPrice : (it.unitPrice * (rate > 0 ? (1 + rate) : 1))),
        taxRate: rate,
      })))
      setLoading(false)
    })
  }, [id])

  const calcs = useMemo(() => {
    const lines = rows.map(r => {
      const qty = Number(r.quantity || 0)
      const inclUnit = Number(r.unitPriceInclTax || 0)
      // 跟 speedmate 一致：以含稅總額為基準反推未稅，稅金 = 含稅 - 未稅，避免 1 元誤差
      const subtotalIncl = Math.round(qty * inclUnit)
      const exclUnit = r.taxRate > 0 ? inclUnit / (1 + r.taxRate) : inclUnit
      const subtotalExcl = r.taxRate > 0 ? Math.round(subtotalIncl / (1 + r.taxRate)) : subtotalIncl
      const tax = subtotalIncl - subtotalExcl
      return {
        qty, inclUnit, exclUnit: fmt(exclUnit),
        subtotalExcl,
        tax,
        subtotalIncl,
      }
    })
    const totalExcl = lines.reduce((s, l) => s + l.subtotalExcl, 0)
    let totalTax = lines.reduce((s, l) => s + l.tax, 0)
    if (adjustMinus1) totalTax -= 1
    const totalIncl = totalExcl + totalTax
    return { lines, totalExcl: fmt(totalExcl), totalTax, totalIncl: fmt(totalIncl) }
  }, [rows, adjustMinus1])

  function setQty(idx: number, v: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: v } : r))
  }
  function setUnit(idx: number, v: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, unitPriceInclTax: v } : r))
  }
  function clearRow(idx: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: '' } : r))
  }
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }
  function allowAll() {
    if (!invoice) return
    // 將每一列設為原數量
    setRows(prev => prev.map((r, i) => ({ ...r, quantity: String(invoice.items[i]?.quantity ?? 1) })))
  }

  async function submit() {
    const validRows = rows.map((r, i) => ({ row: r, calc: calcs.lines[i] }))
      .filter(({ calc }) => calc.qty > 0)
    if (validRows.length === 0) { alert('請至少填寫一個品項的數量'); return }

    if (!invoice) return
    const maxAllowable = Number(invoice.total_amount) - Number(invoice.allowance_amount || 0)
    if (calcs.totalIncl > maxAllowable) {
      alert(`折讓總額 ${calcs.totalIncl} 超過可折讓金額 ${maxAllowable}`)
      return
    }

    setSubmitting(true)
    try {
      const body = {
        allowanceDate,
        items: validRows.map(({ row, calc }) => ({
          description: row.description,
          quantity: calc.qty,
          unitPriceExclTax: calc.exclUnit,
          amountExclTax: calc.subtotalExcl,
          tax: calc.tax,
          taxType: invoice.tax_type,
        })),
      }
      const res = await fetch(`/api/admin/invoices/${id}/allowance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '送出失敗'); return }
      alert(`折讓單開立成功\n折讓單號：${d.allowanceNumber}`)
      router.push(`/admin/invoices/${id}`)
    } finally { setSubmitting(false) }
  }

  if (loading || !invoice) return <div className="p-6 text-gray-500">載入中…</div>
  const maxAllowable = Number(invoice.total_amount) - Number(invoice.allowance_amount || 0)

  return (
    <div className="max-w-5xl">
      <Link href={`/admin/invoices/${id}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> 返回發票明細
      </Link>

      <h1 className="mt-3 text-2xl font-bold">折讓存證式發票</h1>

      {/* 原發票資訊 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="發票號碼" value={<span className="font-mono text-red-600">{invoice.invoice_number}</span>} />
          <Field label="發票日期" value={`${invoice.invoice_date} ${(invoice.invoice_time || '').slice(0, 8)}`} />
          <Field label="發票類型" value={invoice.buyer_type === 'B2C' ? '二聯' : '三聯'} />
          <Field label="可折讓金額" value={<span className="font-bold text-red-600">{maxAllowable.toLocaleString()}</span>} />
        </div>

        <table className="mt-3 w-full text-xs border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 border-b text-left">原品名</th>
              <th className="px-2 py-1.5 border-b text-right w-20">數量</th>
              <th className="px-2 py-1.5 border-b text-right w-24">單價</th>
              <th className="px-2 py-1.5 border-b text-right w-24">金額</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((it, i) => (
              <tr key={i} className="border-b">
                <td className="px-2 py-1">{it.description}</td>
                <td className="px-2 py-1 text-right">{it.quantity}</td>
                <td className="px-2 py-1 text-right">{it.unitPrice}</td>
                <td className="px-2 py-1 text-right">{it.amount}</td>
              </tr>
            ))}
            <tr className="bg-red-50 font-bold">
              <td className="px-2 py-1 text-right" colSpan={3}>銷售額合計</td>
              <td className="px-2 py-1 text-right">{Number(invoice.total_sales).toLocaleString()}</td>
            </tr>
            <tr className="bg-red-50 font-bold">
              <td className="px-2 py-1 text-right" colSpan={3}>營業稅</td>
              <td className="px-2 py-1 text-right">{Number(invoice.total_tax).toLocaleString()}</td>
            </tr>
            <tr className="bg-red-50 font-bold">
              <td className="px-2 py-1 text-right" colSpan={3}>總計</td>
              <td className="px-2 py-1 text-right">{Number(invoice.total_amount).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 折讓項目 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
        <div className="bg-gray-50 p-3 rounded mb-3 text-xs space-y-1 text-gray-700">
          <div>※ 輸入的單價為<span className="text-red-600 font-bold">發票原始稅率的單價（含稅）</span>，系統自動計算稅金 / 小計 / 總計</div>
          <div>※ <span className="text-red-600 font-bold">【稅金總計】</span>請營業人務必再次驗算，如有差額手動調整 <span className="text-red-600 font-bold">【稅金】</span>欄位</div>
          <div>※ <span className="text-red-600 font-bold">【總計】</span>如有相差 1NT 時，請用 <span className="text-red-600 font-bold">【調整稅額-1NT】</span>功能進行修改</div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-gray-500">指定折讓單日期</label>
          <input type="date" value={allowanceDate} onChange={e => setAllowanceDate(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm" />
          <button onClick={allowAll} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">全額折讓</button>
        </div>

        <table className="w-full text-xs border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1 py-1.5 border-b text-center w-16">操作</th>
              <th className="px-2 py-1.5 border-b text-left">品名</th>
              <th className="px-1 py-1.5 border-b text-right w-16">數量</th>
              <th className="px-1 py-1.5 border-b text-right w-24">單價(含稅)</th>
              <th className="px-1 py-1.5 border-b text-center w-20">稅率(%)</th>
              <th className="px-1 py-1.5 border-b text-right w-24">單價(未稅)</th>
              <th className="px-1 py-1.5 border-b text-right w-24">小計(未稅)</th>
              <th className="px-1 py-1.5 border-b text-right w-20">稅金</th>
              <th className="px-1 py-1.5 border-b text-right w-24">小計(含稅)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = calcs.lines[i]
              return (
                <tr key={i} className="border-b">
                  <td className="px-1 py-1 text-center">
                    <button onClick={() => removeRow(i)} className="p-1 text-gray-400 hover:text-red-600" title="刪除"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                    <button onClick={() => clearRow(i)} className="p-1 text-gray-400 hover:text-blue-600" title="清空數量"><RotateCcw className="w-3.5 h-3.5 inline" /></button>
                  </td>
                  <td className="px-2 py-1">{r.description}</td>
                  <td className="px-1 py-1"><input type="number" value={r.quantity} onChange={e => setQty(i, e.target.value)} className="w-full px-1 py-0.5 border border-gray-200 rounded text-xs text-right" /></td>
                  <td className="px-1 py-1"><input type="number" step="0.01" value={r.unitPriceInclTax} onChange={e => setUnit(i, e.target.value)} className="w-full px-1 py-0.5 border border-gray-200 rounded text-xs text-right" /></td>
                  <td className="px-1 py-1 text-center text-gray-600">{(r.taxRate * 100).toFixed(1)}%</td>
                  <td className="px-1 py-1 text-right text-gray-600">{c.exclUnit}</td>
                  <td className="px-1 py-1 text-right text-gray-600">{c.subtotalExcl}</td>
                  <td className="px-1 py-1 text-right">
                    <span className="px-1 bg-gray-100 rounded">{c.tax}</span>
                  </td>
                  <td className="px-1 py-1 text-right font-medium">{c.subtotalIncl}</td>
                </tr>
              )
            })}
            <tr className="bg-red-50 font-bold">
              <td className="px-1 py-1.5 text-center" colSpan={6}>
                <label className="flex items-center gap-1 justify-end text-xs cursor-pointer">
                  <input type="checkbox" checked={adjustMinus1} onChange={e => setAdjustMinus1(e.target.checked)} />
                  調整稅額 -1NT
                </label>
              </td>
              <td className="px-1 py-1.5 text-right">總計</td>
              <td className="px-1 py-1.5 text-right">{calcs.totalTax}</td>
              <td className="px-1 py-1.5 text-right text-red-600">{calcs.totalIncl}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-center gap-3">
        <button onClick={submit} disabled={submitting}
          className="px-6 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-60">
          {submitting ? '送出中…' : '送出'}
        </button>
        <button onClick={() => router.push(`/admin/invoices/${id}`)}
          className="px-6 py-2 bg-red-500 text-white rounded font-medium hover:bg-red-600">
          關閉
        </button>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  )
}
