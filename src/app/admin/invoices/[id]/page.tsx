'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Loader2, X } from 'lucide-react'

interface InvoiceDetail {
  id: string
  invoice_number: string
  random_number: string
  invoice_date: string
  invoice_time: string
  invoice_type: string
  buyer_type: string
  intype: string
  tax_type: string
  tax_rate: number | null
  buyer_id: string | null
  buyer_name: string | null
  buyer_company: string | null
  buyer_address: string | null
  buyer_phone: string | null
  buyer_email: string | null
  donate: boolean
  love_key: string | null
  carrier_type: string | null
  carrier_id: string | null
  main_remark: string | null
  certificate_remark: string | null
  visa_last4: string | null
  data_id: string | null
  orderid: string | null
  items: { description: string; quantity: number; unitPrice: number; unit?: string; amount: number; remark?: string }[]
  total_sales: number
  total_tax: number
  total_amount: number
  status: string
  cancelled_at: string | null
  cancel_reason: string | null
  voided_at: string | null
  void_reason: string | null
  allowance_amount: number
  smse_raw_response: string | null
  created_at: string
}

const TAX_LABEL: Record<string, string> = { '1': '應稅', '2': '零稅率', '3': '免稅', '4': '應稅(特種)', '9': '混合' }
const INTYPE_LABEL: Record<string, string> = { '07': '一般稅額', '08': '特種稅額' }
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  issued: { label: '開立完成', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '作廢', color: 'bg-red-100 text-red-700' },
  voided: { label: '註銷', color: 'bg-gray-100 text-gray-700' },
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCancel, setShowCancel] = useState(false)
  const [showVoid, setShowVoid] = useState(false)

  async function reload() {
    setLoading(true)
    const res = await fetch(`/api/admin/invoices/${id}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { reload() }, [id]) // eslint-disable-line

  if (loading) return <div className="p-6 text-gray-500"><Loader2 className="w-5 h-5 animate-spin inline" /> 載入中…</div>
  if (!data) return <div className="p-6 text-red-600">找不到發票</div>

  const st = STATUS_LABEL[data.status] || { label: data.status, color: 'bg-gray-100 text-gray-700' }

  return (
    <div className="max-w-5xl">
      <Link href="/admin/invoices/list" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> 返回發票列表
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> 電子發票資訊</h1>
          <p className="mt-1 text-sm text-gray-500">發票號碼 <span className="font-mono text-red-600 font-bold">{data.invoice_number}</span></p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.color}`}>{st.label}</span>
      </div>

      {/* 基本資訊 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Field label="發票號碼" value={<span className="font-mono text-red-600">{data.invoice_number}</span>} />
          <Field label="隨機碼" value={<span className="font-mono">{data.random_number}</span>} />
          <Field label="發票類型" value={data.invoice_type || data.buyer_type} />
          <Field label="發票日期" value={`${data.invoice_date} ${data.invoice_time || ''}`} />
          <Field label="自訂發票編號" value={data.data_id || '-'} />
          <Field label="自訂號碼" value={data.orderid || '-'} />
          <Field label="捐贈" value={data.donate ? `是（${data.love_key || '-'}）` : '未捐贈'} />
          <Field label="載具" value={data.carrier_type ? `${data.carrier_type}（${data.carrier_id || '-'}）` : '無載具'} />
          <Field label="稅率" value={`${INTYPE_LABEL[data.intype] || data.intype}-${TAX_LABEL[data.tax_type] || data.tax_type}${data.tax_rate ? ` (${(data.tax_rate * 100).toFixed(1)}%)` : ''}`} />
          <Field label="信用卡末四碼" value={data.visa_last4 || '-'} />
        </div>
      </div>

      {/* 買受人 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Field label="統一編號" value={<span className="font-mono text-red-600">{data.buyer_id || '-'}</span>} />
          <Field label="買受人" value={data.buyer_company || data.buyer_name || '-'} />
          <Field label="連絡電話" value={data.buyer_phone || '-'} />
          <Field label="Email" value={data.buyer_email || '-'} full />
          <Field label="地址" value={data.buyer_address || '-'} full />
        </div>
      </div>

      {/* 備註 */}
      {(data.main_remark || data.certificate_remark) && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
          <Field label="總備註" value={data.main_remark || '-'} />
          <Field label="證明聯備註" value={data.certificate_remark || '-'} />
        </div>
      )}

      {/* 商品明細 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs">
            <tr>
              <th className="px-3 py-2 text-left">品名（備註）</th>
              <th className="px-3 py-2 text-right w-20">數量(單位)</th>
              <th className="px-3 py-2 text-right w-24">單價</th>
              <th className="px-3 py-2 text-right w-24">金額</th>
            </tr>
          </thead>
          <tbody>
            {(data.items || []).map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{it.description}{it.remark ? <div className="text-xs text-gray-500">{it.remark}</div> : null}</td>
                <td className="px-3 py-2 text-right">{it.quantity}{it.unit ? ` (${it.unit})` : ''}</td>
                <td className="px-3 py-2 text-right">{it.unitPrice}</td>
                <td className="px-3 py-2 text-right">{it.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-red-50">
            <tr><td className="px-3 py-2 text-right font-medium" colSpan={3}>銷售額合計</td><td className="px-3 py-2 text-right font-bold">{Number(data.total_sales || 0).toLocaleString()}</td></tr>
            <tr><td className="px-3 py-2 text-right font-medium" colSpan={3}>營業稅</td><td className="px-3 py-2 text-right font-bold">{Number(data.total_tax || 0).toLocaleString()}</td></tr>
            <tr><td className="px-3 py-2 text-right font-medium" colSpan={3}>總計</td><td className="px-3 py-2 text-right font-bold text-red-600">{Number(data.total_amount).toLocaleString()}</td></tr>
            {data.allowance_amount > 0 && (
              <tr><td className="px-3 py-2 text-right text-xs text-gray-500" colSpan={3}>已折讓金額</td><td className="px-3 py-2 text-right text-xs text-amber-600">{Number(data.allowance_amount).toLocaleString()}</td></tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* 作廢/註銷資訊 */}
      {(data.status === 'cancelled' || data.status === 'voided') && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
          {data.status === 'cancelled' && (
            <>
              <Field label="作廢時間" value={data.cancelled_at ? new Date(data.cancelled_at).toLocaleString('zh-TW') : '-'} />
              <Field label="作廢原因" value={data.cancel_reason || '-'} />
            </>
          )}
          {data.status === 'voided' && (
            <>
              <Field label="註銷時間" value={data.voided_at ? new Date(data.voided_at).toLocaleString('zh-TW') : '-'} />
              <Field label="註銷原因" value={data.void_reason || '-'} />
            </>
          )}
        </div>
      )}

      {/* 操作按鈕（待實作 — 列印 / 補印 / 作廢 / 註銷 / 折讓） */}
      <div className="mt-6 flex gap-2 flex-wrap">
        <button disabled className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded opacity-60 cursor-not-allowed">列印發票</button>
        <button disabled className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded opacity-60 cursor-not-allowed">補印發票</button>
        <button disabled className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded opacity-60 cursor-not-allowed">查看發票</button>
        <button disabled className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded opacity-60 cursor-not-allowed">檢視 Email</button>
        <button disabled className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded opacity-60 cursor-not-allowed">發送簡訊</button>
        {data.status === 'issued' && (
          <>
            <button onClick={() => setShowCancel(true)} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">作廢</button>
            <button onClick={() => setShowVoid(true)} className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">註銷</button>
            <Link href={`/admin/invoices/${data.id}/allowance`} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">折讓</Link>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-400">※ 列印功能尚未實作</p>

      {showCancel && <ModifyModal mode="cancel" invoiceId={data.id} onClose={() => setShowCancel(false)} onDone={() => { setShowCancel(false); reload() }} />}
      {showVoid && <ModifyModal mode="void" invoiceId={data.id} onClose={() => setShowVoid(false)} onDone={() => { setShowVoid(false); reload() }} />}

      {/* 防止 router 警告 — 留個跳轉用途 */}
      {false && <button onClick={() => router.refresh()}>refresh</button>}
    </div>
  )
}

function Field({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-full' : ''}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  )
}

function ModifyModal({ mode, invoiceId, onClose, onDone }: {
  mode: 'cancel' | 'void'
  invoiceId: string
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [extra, setExtra] = useState('') // 作廢時的專案核准文號
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const title = mode === 'cancel' ? '發票作廢' : '發票註銷'
  const reasonLabel = mode === 'cancel' ? '作廢原因' : '註銷原因'

  async function submit() {
    if (!reason.trim()) { alert('請輸入原因'); return }
    if (reason.length > 20) { alert('原因最多 20 字'); return }
    setSubmitting(true)
    try {
      const url = `/api/admin/invoices/${invoiceId}/${mode === 'cancel' ? 'cancel' : 'void'}`
      const body: Record<string, string> = {}
      if (mode === 'cancel') {
        body.cancelReason = reason.trim()
        if (extra.trim()) body.returnTaxDocumentNumber = extra.trim()
      } else {
        body.voidReason = reason.trim()
      }
      if (remark.trim()) body.remark = remark.trim()
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '送出失敗'); return }
      const note = mode === 'void' && d.note ? `\n\n${d.note}` : ''
      alert(`${title}成功${note}`)
      onDone()
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className="text-xs text-gray-500">{reasonLabel}（最多 20 字）*</label>
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={20}
              className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          {mode === 'cancel' && (
            <div>
              <label className="text-xs text-gray-500">專案核准文號（若有）</label>
              <input value={extra} onChange={e => setExtra(e.target.value)} maxLength={60}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">備註（最多 200 字）</label>
            <textarea value={remark} onChange={e => setRemark(e.target.value)} maxLength={200} rows={3}
              className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          {mode === 'cancel' && <p className="text-xs text-amber-700">⚠️ 作廢後號碼將被佔用，無法重新開立</p>}
          {mode === 'void' && <p className="text-xs text-amber-700">⚠️ 註銷成功後，若<span className="font-bold">下一個號碼尚未使用</span>，此號碼會自動歸還字軌、下次可重用；若下一號已使用則保留 gap、無法歸還。</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50">取消</button>
          <button onClick={submit} disabled={submitting}
            className={`px-4 py-2 text-white text-sm rounded disabled:opacity-60 ${mode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-800'}`}>
            {submitting ? '送出中…' : '確認'}
          </button>
        </div>
      </div>
    </div>
  )
}
