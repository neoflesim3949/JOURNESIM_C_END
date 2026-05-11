'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, Trash2, CheckCircle2, Circle, ChevronRight } from 'lucide-react'

interface Track {
  id: string
  track_prefix: string
  period_year: number
  period_start_month: number
  period_end_month: number
  start_number: string | number
  end_number: string | number
  next_number: string | number
  intype: string | null
  tax_type: string | null
  buyer_type: string | null
  is_active: boolean
  is_exhausted: boolean
  note: string | null
  total_count: number
  used_count: number
  remaining_count: number
  issued_count: number
  cancelled_count: number
  voided_count: number
}

const INTYPE_LABEL: Record<string, string> = { '07': '一般稅額', '08': '特種稅額' }
const TAX_LABEL: Record<string, string> = { '1': '應稅', '2': '零稅率', '3': '免稅', '4': '應稅(特種)', '9': '混合' }

export default function InvoiceTracksPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/invoice-tracks')
    if (res.ok) { const d = await res.json(); setTracks(d.data || []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleActive(t: Track) {
    await fetch('/api/admin/invoice-tracks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
    })
    load()
  }
  async function remove(t: Track) {
    if (!confirm(`確定刪除字軌 ${t.track_prefix} ${t.start_number}-${t.end_number}？`)) return
    await fetch(`/api/admin/invoice-tracks?id=${t.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">發票字軌</h1>
          <p className="mt-1 text-sm text-gray-500">管理自有字軌號碼池，開立發票時依設定自動配號</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新增字軌
          </button>
        </div>
      </div>

      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
        ⓘ 同期別 + 同稅率類型只能有一組 <span className="font-bold">啟用中</span>。新增時若勾「啟用」會自動關閉同條件的其他字軌。
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-center w-12">啟用</th>
              <th className="px-3 py-2 text-left">期別</th>
              <th className="px-3 py-2 text-left">字軌</th>
              <th className="px-3 py-2 text-left">類別</th>
              <th className="px-3 py-2 text-left">號碼範圍</th>
              <th className="px-3 py-2 text-right">總張數</th>
              <th className="px-3 py-2 text-right">已用</th>
              <th className="px-3 py-2 text-right">剩餘</th>
              <th className="px-3 py-2 text-left">下一號碼</th>
              <th className="px-3 py-2 text-right">作廢/註銷</th>
              <th className="px-3 py-2 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">載入中…</td></tr>}
            {!loading && tracks.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">尚未設定字軌，請點「新增字軌」</td></tr>}
            {!loading && tracks.map(t => (
              <tr key={t.id} className={`border-t hover:bg-gray-50 ${t.is_exhausted ? 'bg-red-50' : ''}`}>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => toggleActive(t)} title={t.is_active ? '啟用中（點擊停用）' : '停用（點擊啟用）'}>
                    {t.is_active ? <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" /> : <Circle className="w-5 h-5 text-gray-300 mx-auto" />}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs">{t.period_year}年 {t.period_start_month}-{t.period_end_month}月</td>
                <td className="px-3 py-2 font-mono font-bold">{t.track_prefix}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {INTYPE_LABEL[t.intype || ''] || '—'} / {TAX_LABEL[t.tax_type || ''] || '—'}
                  {t.buyer_type && <span className="ml-1 px-1 py-0.5 bg-gray-100 rounded">{t.buyer_type}</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{t.start_number} ~ {t.end_number}</td>
                <td className="px-3 py-2 text-right">{t.total_count.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-blue-600 font-bold">{t.used_count.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right font-bold ${t.is_exhausted ? 'text-red-600' : 'text-green-600'}`}>{t.remaining_count.toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.is_exhausted ? <span className="text-red-600">用完</span> : `${t.track_prefix}${String(t.next_number).padStart(8, '0')}`}</td>
                <td className="px-3 py-2 text-right text-xs">
                  <span className="text-red-500">{t.cancelled_count}</span> / <span className="text-gray-500">{t.voided_count}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <Link href={`/admin/invoices/tracks/${t.id}`} className="inline-flex items-center text-blue-600 hover:underline text-xs">
                    號碼明細<ChevronRight className="w-3 h-3" />
                  </Link>
                  <button onClick={() => remove(t)} className="ml-1 p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddTrackModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function AddTrackModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const rocYear = now.getFullYear() - 1911
  const m = now.getMonth() + 1
  const startMonth = m % 2 === 0 ? m - 1 : m
  const [trackPrefix, setTrackPrefix] = useState('')
  const [periodYear, setPeriodYear] = useState(rocYear)
  const [periodStartMonth, setPeriodStartMonth] = useState(startMonth)
  const [startNum, setStartNum] = useState('')
  const [endNum, setEndNum] = useState('')
  const [intype, setIntype] = useState<'07' | '08'>('07')
  const [taxType, setTaxType] = useState<'1' | '2' | '3' | '4' | '9'>('1')
  const [buyerType, setBuyerType] = useState<'' | 'B2C' | 'B2B'>('')
  const [isActive, setIsActive] = useState(true)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!/^[A-Za-z]{2}$/.test(trackPrefix)) { alert('字軌須為 2 個英文字母'); return }
    const s = Number(startNum), e = Number(endNum)
    if (!Number.isInteger(s) || !Number.isInteger(e) || s > e) { alert('起號 / 迄號錯誤'); return }
    if (String(s).length > 8 || String(e).length > 8) { alert('號碼最多 8 位數'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/invoice-tracks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_prefix: trackPrefix.toUpperCase(),
          period_year: periodYear,
          period_start_month: periodStartMonth,
          start_number: s,
          end_number: e,
          intype, tax_type: taxType,
          buyer_type: buyerType || null,
          is_active: isActive,
          note: note || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '儲存失敗'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold">新增字軌</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">字軌（2 碼英文）*</label>
              <input value={trackPrefix} onChange={e => setTrackPrefix(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2} placeholder="BP"
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs text-gray-500">民國年 *</label>
              <input type="number" value={periodYear} onChange={e => setPeriodYear(Number(e.target.value))}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">期別（起月）*</label>
              <select value={periodStartMonth} onChange={e => setPeriodStartMonth(Number(e.target.value))}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
                {[1, 3, 5, 7, 9, 11].map(m => <option key={m} value={m}>{m}-{m + 1}月</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                立即啟用
              </label>
            </div>
            <div>
              <label className="text-xs text-gray-500">起號（8 碼）*</label>
              <input type="number" value={startNum} onChange={e => setStartNum(e.target.value)}
                placeholder="52945250"
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-500">迄號（8 碼）*</label>
              <input type="number" value={endNum} onChange={e => setEndNum(e.target.value)}
                placeholder="52946749"
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-500">稅率類型</label>
              <select value={intype} onChange={e => setIntype(e.target.value as '07' | '08')}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="07">一般稅額</option>
                <option value="08">特種稅額</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">課稅別</label>
              <select value={taxType} onChange={e => setTaxType(e.target.value as '1' | '2' | '3' | '4' | '9')}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
                {Object.entries(TAX_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">適用對象</label>
              <select value={buyerType} onChange={e => setBuyerType(e.target.value as '' | 'B2C' | 'B2B')}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="">不限</option>
                <option value="B2C">B2C 二聯</option>
                <option value="B2B">B2B 三聯</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">備註</label>
              <input value={note} onChange={e => setNote(e.target.value)}
                className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50">取消</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-60">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
