'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, FileText, Loader2 } from 'lucide-react'

interface Item {
  description: string
  quantity: string
  unit: string
  unitPrice: string
  amount: string
  remark: string
  productTaxType?: '1' | '3' // 混合稅率時用
}

const TAX_TYPE_OPTIONS: { value: '1' | '2' | '3' | '4' | '9'; label: string }[] = [
  { value: '1', label: '應稅' },
  { value: '2', label: '零稅率' },
  { value: '3', label: '免稅' },
  { value: '4', label: '應稅(特種稅率)' },
  { value: '9', label: '混合稅率' },
]

function nowTaipei() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const parts: Record<string, string> = {}
  for (const p of fmt) parts[p.type] = p.value
  return {
    date: `${parts.year}/${parts.month}/${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

export default function InvoiceIssuePage() {
  const init = nowTaipei()
  const [date, setDate] = useState(init.date)
  const [time, setTime] = useState(init.time)
  const [intype, setIntype] = useState<'07' | '08'>('07')
  const [taxType, setTaxType] = useState<'1' | '2' | '3' | '4' | '9'>('1')
  const [taxRate, setTaxRate] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [randomNumber, setRandomNumber] = useState('')

  const [buyerType, setBuyerType] = useState<'B2C' | 'B2B' | 'B2G'>('B2C')
  const [buyerId, setBuyerId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [donate, setDonate] = useState(false)
  const [loveKey, setLoveKey] = useState('')
  const [carrierType, setCarrierType] = useState<'' | 'EJ0113' | '3J0002' | 'CQ0001'>('')
  const [carrierId, setCarrierId] = useState('')

  const [mainRemark, setMainRemark] = useState('')
  const [certificateRemark, setCertificateRemark] = useState('')
  const [orderid, setOrderid] = useState('')
  const [dataId, setDataId] = useState('')
  const [visaLast4, setVisaLast4] = useState('')

  const [items, setItems] = useState<Item[]>([
    { description: '', quantity: '1', unit: '', unitPrice: '', amount: '', remark: '' },
  ])
  const [unitTAX, setUnitTAX] = useState<'Y' | 'N'>('Y')
  const [roundDown, setRoundDown] = useState(false)
  const [adjustMinus1, setAdjustMinus1] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<null | { ok: boolean; msg: string; data?: Record<string, unknown> }>(null)
  const [smseMode, setSmseMode] = useState<'test' | 'prod' | null>(null)
  const [smseGrvc, setSmseGrvc] = useState('')

  useEffect(() => {
    fetch('/api/admin/invoices/issue').then(r => r.json()).then(d => {
      setSmseMode(d.mode); setSmseGrvc(d.grvc)
    }).catch(() => {})
  }, [])

  // B2C 一律含稅；B2B/B2G 依使用者選擇
  const effectiveUnitTAX: 'Y' | 'N' = buyerType === 'B2C' ? 'Y' : unitTAX
  // 內含(Y): 品項小計就是含稅，allAmount = sum(amount)
  // 外加(N): 品項小計是未稅，allAmount = sum(amount) × 1.05（5% 應稅）
  const calc = useMemo(() => {
    const sumItems = items.reduce((s, it) => {
      const n = Number(it.amount || 0)
      return s + (isNaN(n) ? 0 : n)
    }, 0)
    const round = (n: number) => roundDown ? Math.floor(n) : Math.round(n)
    let allAmount: number, totalSales: number, totalTax: number
    const isTaxable = taxType === '1' // 應稅 5%
    if (!isTaxable) {
      allAmount = round(sumItems); totalSales = sumItems; totalTax = 0
    } else if (effectiveUnitTAX === 'Y') {
      // 內含
      allAmount = round(sumItems)
      totalSales = round(allAmount / 1.05)
      totalTax = allAmount - totalSales
    } else {
      // 外加
      totalSales = round(sumItems)
      totalTax = round(totalSales * 0.05)
      if (adjustMinus1) totalTax -= 1
      allAmount = totalSales + totalTax
    }
    return { allAmount, totalSales, totalTax }
  }, [items, roundDown, effectiveUnitTAX, taxType, adjustMinus1])
  const allAmount = calc.allAmount

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const merged = { ...it, ...patch }
      // 自動算 amount = qty × unitPrice
      const q = Number(merged.quantity)
      const p = Number(merged.unitPrice)
      if (!isNaN(q) && !isNaN(p)) {
        merged.amount = String(roundDown ? Math.floor(q * p) : Math.round(q * p))
      }
      return merged
    }))
  }
  function addItem() {
    setItems(prev => [...prev, { description: '', quantity: '1', unit: '', unitPrice: '', amount: '', remark: '' }])
  }
  function removeItem(idx: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    setResult(null)
    // 基本驗證
    const validItems = items.filter(it => it.description && Number(it.quantity) > 0 && it.unitPrice !== '')
    if (validItems.length === 0) { alert('請新增至少一個有效品項'); return }
    if (allAmount <= 0) { alert('總金額需大於 0'); return }
    if ((buyerType === 'B2B' || buyerType === 'B2G') && !buyerId.trim()) { alert(`${buyerType} 需填統一編號`); return }
    if (donate && !loveKey.trim()) { alert('捐贈需填愛心碼'); return }
    if (donate && (buyerType !== 'B2C')) { alert('只有 B2C 可捐贈'); return }
    if (carrierType && !carrierId.trim() && carrierType !== 'EJ0113') { alert('該載具類型必須填寫 ID'); return }

    setSubmitting(true)
    try {
      const body = {
        invoiceDate: date,
        invoiceTime: time,
        intype, taxType,
        taxRate: taxRate || undefined,
        invoiceNumber: invoiceNumber || undefined,
        randomNumber: randomNumber || undefined,
        buyerType,
        buyerId: buyerId || undefined,
        companyName: companyName || undefined,
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        donate,
        loveKey: loveKey || undefined,
        carrierType: carrierType || undefined,
        carrierId: carrierId || undefined,
        mainRemark: mainRemark || undefined,
        certificateRemark: certificateRemark || undefined,
        orderid: orderid || undefined,
        dataId: dataId || undefined,
        visaLast4: visaLast4 || undefined,
        items: validItems.map(it => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          unit: it.unit?.trim() || undefined,
          amount: Number(it.amount || 0),
          remark: it.remark?.trim() || undefined,
        })),
        allAmount,
        unitTAX: buyerType !== 'B2C' ? effectiveUnitTAX : undefined,
      }
      const res = await fetch('/api/admin/invoices/issue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        setResult({ ok: false, msg: d.error || '開立失敗', data: d })
        return
      }
      setResult({ ok: true, msg: `開立成功：${d.invoiceNumber} (${d.invoiceType})`, data: d })
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> 發票開立
          </h1>
          <p className="mt-1 text-sm text-gray-500">透過速買配（SmilePay / smse）開立電子發票</p>
        </div>
        {smseMode && (
          <div className="text-xs text-right">
            <div>
              模式：
              <span className={`ml-1 px-2 py-0.5 rounded-full font-medium ${smseMode === 'prod' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {smseMode === 'prod' ? '正式環境' : '測試環境'}
              </span>
            </div>
            <div className="mt-1 text-gray-500 font-mono">{smseGrvc}</div>
          </div>
        )}
      </div>

      {/* 資訊 */}
      <Section title="資訊">
        <div className="grid grid-cols-2 gap-4">
          <Field label="發票日期">
            <input type="text" value={date} onChange={e => setDate(e.target.value)} placeholder="YYYY/MM/DD"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="發票時間">
            <input type="text" value={time} onChange={e => setTime(e.target.value)} placeholder="HH:MM:SS"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="稅率類型">
            <select value={intype} onChange={e => setIntype(e.target.value as '07' | '08')}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="07">一般稅額</option>
              <option value="08">特種稅額</option>
            </select>
          </Field>
          <Field label="課稅別">
            <select value={taxType} onChange={e => setTaxType(e.target.value as '1' | '2' | '3' | '4' | '9')}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              {TAX_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          {intype === '08' && (taxType === '4' || taxType === '9') && (
            <Field label="稅率">
              <input type="text" value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="如 0.25"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </Field>
          )}
          <Field label="發票號碼">
            <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="留空 = 系統配號"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
          </Field>
          <Field label="隨機碼">
            <input type="text" value={randomNumber} onChange={e => setRandomNumber(e.target.value)} placeholder="留空 = 自動產生"
              maxLength={4}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
          </Field>
        </div>
      </Section>

      {/* 買受人 + 對象類別 */}
      <Section title="買受人">
        <div className="flex gap-3 mb-3 text-sm">
          {(['B2C', 'B2B', 'B2G'] as const).map(t => (
            <label key={t} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={buyerType === t} onChange={() => setBuyerType(t)} />
              {t}{t === 'B2G' && '（企業對政府）'}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {(buyerType === 'B2B' || buyerType === 'B2G') ? (
            <>
              <Field label="統一編號 *">
                <input type="text" value={buyerId} onChange={e => setBuyerId(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
              </Field>
              <Field label="公司名稱">
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
              </Field>
            </>
          ) : (
            <Field label="姓名">
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </Field>
          )}
          <Field label="電話">
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="Email" full>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="填入後自動發送發票通知信"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="地址" full>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
        </div>

        {/* 捐贈 / 載具（僅 B2C） */}
        {buyerType === 'B2C' && (
          <div className="mt-3 flex gap-6 items-start text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={donate} onChange={e => { setDonate(e.target.checked); if (e.target.checked) setCarrierType('') }} />
              捐贈
            </label>
            {donate && (
              <input type="text" value={loveKey} onChange={e => setLoveKey(e.target.value)} placeholder="愛心碼"
                className="px-2 py-1 border border-gray-300 rounded text-sm font-mono w-32" />
            )}
            {!donate && (
              <>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!carrierType} onChange={e => setCarrierType(e.target.checked ? 'EJ0113' : '')} />
                  載具
                </label>
                {carrierType && (
                  <>
                    <select value={carrierType} onChange={e => setCarrierType(e.target.value as 'EJ0113' | '3J0002' | 'CQ0001')}
                      className="px-2 py-1 border border-gray-300 rounded text-sm">
                      <option value="EJ0113">速買配載具</option>
                      <option value="3J0002">手機條碼</option>
                      <option value="CQ0001">自然人憑證</option>
                    </select>
                    <input type="text" value={carrierId} onChange={e => setCarrierId(e.target.value)}
                      placeholder={carrierType === 'EJ0113' ? '可空白（用 Email/Phone 註冊）' : '載具 ID'}
                      className="px-2 py-1 border border-gray-300 rounded text-sm font-mono w-56" />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>

      {/* 備註 */}
      <Section title="備註與自訂編號">
        <div className="grid grid-cols-2 gap-4">
          <Field label="總備註（顯示在 A4/A5）" full>
            <input type="text" value={mainRemark} onChange={e => setMainRemark(e.target.value)} maxLength={200}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="證明聯備註（A4/A5/熱感紙）" full>
            <input type="text" value={certificateRemark} onChange={e => setCertificateRemark(e.target.value)} maxLength={34}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="可重複自訂號碼 (orderid)">
            <input type="text" value={orderid} onChange={e => setOrderid(e.target.value)} maxLength={30}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="不可重複自訂號碼 (data_id)">
            <input type="text" value={dataId} onChange={e => setDataId(e.target.value)} maxLength={50}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="信用卡末四碼">
            <input type="text" value={visaLast4} onChange={e => setVisaLast4(e.target.value)} maxLength={4}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
          </Field>
        </div>
      </Section>

      {/* 品項 */}
      <Section title="品項">
        <div className="flex justify-end gap-3 mb-2 text-xs items-center">
          {buyerType !== 'B2C' && (
            <label className="flex items-center gap-1 cursor-pointer">
              <span>單價呈現方式</span>
              <select value={unitTAX} onChange={e => setUnitTAX(e.target.value as 'Y' | 'N')}
                className="px-2 py-0.5 border border-gray-300 rounded text-xs">
                <option value="Y">含稅</option>
                <option value="N">未稅</option>
              </select>
              {taxType === '1' && <span className="text-gray-500">稅率：5%</span>}
            </label>
          )}
          {buyerType === 'B2C' && taxType === '1' && (
            <span className="text-gray-500 text-xs">B2C 一律含稅 / 稅率：5%</span>
          )}
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={roundDown} onChange={e => setRoundDown(e.target.checked)} />
            小計四捨五入改無條件捨去
          </label>
        </div>
        <table className="w-full text-xs border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 border-b text-left w-1/3">品名 *</th>
              <th className="px-2 py-1.5 border-b text-left w-16">數量 *</th>
              <th className="px-2 py-1.5 border-b text-left w-16">單位</th>
              <th className="px-2 py-1.5 border-b text-left w-24">單價 *</th>
              <th className="px-2 py-1.5 border-b text-left w-24">小計</th>
              <th className="px-2 py-1.5 border-b text-left">備註</th>
              <th className="px-2 py-1.5 border-b w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b">
                <td className="px-1 py-1"><input type="text" value={it.description} onChange={e => updateItem(i, { description: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                <td className="px-1 py-1"><input type="number" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                <td className="px-1 py-1"><input type="text" value={it.unit} onChange={e => updateItem(i, { unit: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                <td className="px-1 py-1"><input type="number" step="0.01" value={it.unitPrice} onChange={e => updateItem(i, { unitPrice: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                <td className="px-1 py-1"><input type="number" value={it.amount} onChange={e => updateItem(i, { amount: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-gray-50" /></td>
                <td className="px-1 py-1"><input type="text" value={it.remark} onChange={e => updateItem(i, { remark: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => removeItem(i)} disabled={items.length === 1}
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">
            <Plus className="w-3.5 h-3.5" /> 新增品項
          </button>
          <div className="flex items-center gap-4 text-sm">
            {taxType === '1' && effectiveUnitTAX === 'N' && (
              <>
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={adjustMinus1} onChange={e => setAdjustMinus1(e.target.checked)} />
                  調整稅額 -1NT
                </label>
                <span>未稅價：<span className="font-bold text-red-600">{calc.totalSales.toLocaleString()}</span></span>
              </>
            )}
            <span>含稅價：<span className="font-bold text-red-600 text-lg">{allAmount.toLocaleString()}</span></span>
          </div>
        </div>
      </Section>

      {/* 送出 */}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={handleSubmit} disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {submitting ? '開立中…' : '開立發票'}
        </button>
      </div>

      {/* 結果 */}
      {result && (
        <div className={`mt-4 p-4 rounded-lg border ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <div className="font-semibold">{result.ok ? '✅ ' : '❌ '}{result.msg}</div>
          {result.data ? (
            <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(result.data, null, 2)}</pre>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-base font-semibold mb-4 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  )
}
