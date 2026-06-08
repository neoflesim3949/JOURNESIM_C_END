'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Link2, Trash2, Send, X } from 'lucide-react'
import { BcMatchModal } from '@/components/admin/bc-match-modal'
import { MobileShopeeNav } from '@/components/admin/mobile-shopee-nav'

interface MItem {
  id: string
  shopee_product_name: string | null
  shopee_variation_name: string | null
  quantity: number
  original_price: number | null
  sale_price: number | null
  bc_sku_id: string | null
  matched_copies: string | null
  cost_cny: number | null
  cost_twd: number | null
  iccid: string[] | null
  status: string
  is_manual?: boolean
  delivery_type?: 'sim' | 'esim'
  bc_order_id: string | null
}
interface MOrder {
  id: string; shopee_order_number: string; buyer_account: string | null
  order_date: string | null; buyer_total_payment: number | null
  internal_status: string; is_manual?: boolean; shopee_account_id: string | null
}

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待對應', color: 'bg-gray-100 text-gray-600' },
  matched: { label: '已對應', color: 'bg-blue-100 text-blue-700' },
  iccid_filled: { label: '已填號', color: 'bg-indigo-100 text-indigo-700' },
  bc_ordered: { label: '已下單', color: 'bg-green-100 text-green-700' },
  completed: { label: '完成', color: 'bg-green-100 text-green-700' },
}

export default function MobileShopeeOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<MOrder | null>(null)
  const [items, setItems] = useState<MItem[]>([])
  const [bcNameMap, setBcNameMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState<MItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 新增品項
  const [showAdd, setShowAdd] = useState(false)
  const [aName, setAName] = useState('')
  const [aVar, setAVar] = useState('')
  const [aQty, setAQty] = useState('1')
  const [aPrice, setAPrice] = useState('0')
  const [aType, setAType] = useState<'sim' | 'esim'>('esim')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const d = await fetch(`/api/admin/shopee/orders/${id}`).then(r => r.json())
      setOrder(d.order); setItems(d.items || [])
      const skuIds = [...new Set((d.items || []).map((i: MItem) => i.bc_sku_id).filter(Boolean))]
      if (skuIds.length) {
        const list = await fetch(`/api/admin/shopee/bc-search?action=names&sku_ids=${skuIds.join(',')}`).then(r => r.json())
        setBcNameMap(new Map((list || []).map((b: { sku_id: string; name: string }) => [b.sku_id, b.name])))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function matchBcItem(skuId: string, copies: string) {
    if (!matching) return
    const m = matching
    const hasIccid = !!(m.iccid && m.iccid.length > 0)
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: m.id, bc_sku_id: skuId, matched_copies: copies,
        status: hasIccid ? 'iccid_filled' : 'matched',
        shopee_product_id: null, shopee_variation_id: null,
        shopee_product_name: m.shopee_product_name, shopee_variation_name: m.shopee_variation_name,
      }),
    })
    setMatching(null); load()
  }
  async function unmatch(item: MItem) {
    if (!confirm('取消此商品對應？')) return
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, bc_sku_id: null, matched_copies: null, status: 'pending' }),
    }); load()
  }
  async function saveIccid(item: MItem, text: string) {
    const lines = [...new Set(text.split(/[\n,]/).map(s => s.trim()).filter(Boolean))]
    await fetch(`/api/admin/shopee/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, iccid: lines.length ? lines : null, status: lines.length ? 'iccid_filled' : 'matched' }),
    }); load()
  }
  async function deleteItem(item: MItem) {
    if (!confirm('刪除此品項？')) return
    await fetch(`/api/admin/shopee/orders/${id}/items/${item.id}`, { method: 'DELETE' }); load()
  }
  async function addItem() {
    if (!aName.trim()) { alert('請輸入品名'); return }
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/shopee/orders/${id}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: aName.trim(), variation: aVar.trim(), quantity: Number(aQty) || 1, price: Number(aPrice) || 0, delivery_type: aType }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || '新增失敗'); return }
      setAName(''); setAVar(''); setAQty('1'); setAPrice('0'); setShowAdd(false); load()
    } finally { setAdding(false) }
  }
  async function submitBc() {
    if (!confirm('送出 BC 訂單？')) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/shopee/orders/${id}/bc-order`, { method: 'POST' })
      const d = await res.json()
      const errs = (d.results || []).filter((r: { error?: string }) => r.error)
      if (errs.length) alert('部分失敗：\n' + errs.map((e: { error: string }) => e.error).join('\n'))
      else alert('已送出 BC 訂單')
      load()
    } finally { setSubmitting(false) }
  }

  const canSubmit = items.some(i => (i.status === 'matched' || i.status === 'iccid_filled') && !i.bc_order_id)

  if (loading) return <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center text-gray-400">載入中…</div>
  if (!order) return <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center text-gray-400">找不到訂單</div>

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* 頂部 */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 shrink-0 flex items-center gap-2">
        <button onClick={() => router.push('/admin/m/shopee/orders')} className="p-1.5"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold truncate">{order.shopee_order_number}</span>
            {order.is_manual && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 shrink-0">手動</span>}
          </div>
          <div className="text-xs text-gray-500 truncate">{order.buyer_account || '-'} · {items.length} 項</div>
        </div>
        <MobileShopeeNav current="orders" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-28">
        {items.map(item => {
          const st = ITEM_STATUS[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-600' }
          const isSim = (item.delivery_type || 'sim') === 'sim'
          return (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">{item.shopee_product_name || '-'}</div>
                  <div className="text-xs text-gray-500">{item.shopee_variation_name || '-'}</div>
                </div>
                <span className={`px-2 py-0.5 text-[11px] rounded-full shrink-0 ${st.color}`}>{st.label}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                <span>數量 {item.quantity}</span>
                <span>NT$ {item.sale_price ?? item.original_price ?? 0}</span>
                <span className={`px-1.5 py-0.5 rounded ${isSim ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>{isSim ? 'SIM' : 'eSIM'}</span>
                {!item.bc_order_id && (
                  <button onClick={() => deleteItem(item)} className="ml-auto text-gray-300 active:text-red-500"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>

              {/* BC 對應 */}
              <div className="mt-2.5 pt-2.5 border-t border-gray-100">
                {item.bc_sku_id ? (
                  <div>
                    <div className="text-sm text-blue-700 font-medium">{bcNameMap.get(item.bc_sku_id) || item.bc_sku_id}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{item.bc_sku_id} · copies {item.matched_copies}{item.cost_twd ? ` · 成本 NT$${item.cost_twd}` : ''}</div>
                    {!item.bc_order_id && (
                      <div className="mt-1.5 flex gap-2">
                        <button onClick={() => setMatching(item)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs">重新對應</button>
                        <button onClick={() => unmatch(item)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-400">取消</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => setMatching(item)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
                    <Link2 className="w-4 h-4" /> 對應 BC 商品
                  </button>
                )}
              </div>

              {/* SIM 需填 ICCID（eSIM 下單後由 BC 回填） */}
              {isSim && item.bc_sku_id && !item.bc_order_id && (
                <MIccidInput key={`icc-${item.id}-${(item.iccid || []).join(',')}`} item={item} onSave={saveIccid} />
              )}
              {item.iccid && item.iccid.length > 0 && (
                <div className="mt-1.5 text-[11px] text-gray-500">ICCID：{item.iccid.join(', ')}</div>
              )}
            </div>
          )
        })}

        {items.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">尚無品項，點下方「新增品項」</div>}
      </div>

      {/* 底部操作列 */}
      <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3 flex gap-2 shrink-0">
        <button onClick={() => { setShowAdd(true) }} className="flex-1 py-3 border border-purple-300 text-purple-700 rounded-lg font-medium flex items-center justify-center gap-1.5">
          <Plus className="w-5 h-5" /> 新增品項
        </button>
        <button onClick={submitBc} disabled={!canSubmit || submitting}
          className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium flex items-center justify-center gap-1.5 disabled:opacity-40">
          <Send className="w-5 h-5" /> {submitting ? '送出中…' : '送出 BC 訂單'}
        </button>
      </div>

      {/* 新增品項彈窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white w-full rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">新增品項</h2>
              <button onClick={() => setShowAdd(false)} className="p-1"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">品名 *
                <input value={aName} onChange={e => setAName(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
              </label>
              <label className="block text-sm">選項 / 規格
                <input value={aVar} onChange={e => setAVar(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">數量
                  <input type="number" value={aQty} onChange={e => setAQty(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
                </label>
                <label className="block text-sm">售價 (NT$)
                  <input type="number" value={aPrice} onChange={e => setAPrice(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAType('esim')} className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${aType === 'esim' ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-gray-300'}`}>eSIM</button>
                <button onClick={() => setAType('sim')} className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${aType === 'sim' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-300'}`}>SIM</button>
              </div>
            </div>
            <button onClick={addItem} disabled={adding} className="mt-5 w-full py-3 bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50">
              {adding ? '新增中…' : '新增'}
            </button>
          </div>
        </div>
      )}

      {/* BC 對應（共用） */}
      {matching && (
        <BcMatchModal
          subtitle={`${matching.shopee_product_name || ''} · ${matching.shopee_variation_name || ''}`}
          onMatch={(skuId, copies) => matchBcItem(skuId, copies)}
          onClose={() => setMatching(null)}
        />
      )}
    </div>
  )
}

// SIM 卡號回填（含起始~結束號段自動產生）
function MIccidInput({ item, onSave }: { item: MItem; onSave: (item: MItem, text: string) => void }) {
  const [text, setText] = useState((item.iccid || []).join('\n'))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const lines = [...new Set(text.split(/[\n,]/).map(s => s.trim()).filter(Boolean))]
  function gen() {
    const sm = start.trim().match(/^(.*?)(\d+)$/); const em = end.trim().match(/^(.*?)(\d+)$/)
    if (!sm || !em) return
    const prefix = sm[1], sN = parseInt(sm[2]), eN = parseInt(em[2]); if (eN < sN) return
    const pad = sm[2].length; const g: string[] = []
    for (let i = sN; i <= eN; i++) g.push(prefix + String(i).padStart(pad, '0'))
    setText(g.join('\n')); setStart(''); setEnd('')
  }
  return (
    <div className="mt-2.5">
      <div className="text-[11px] text-gray-500 mb-1">ICCID 回填（{lines.length}/{item.quantity}）</div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <input value={start} onChange={e => setStart(e.target.value)} placeholder="起始號段" className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
        <span className="text-gray-400 text-xs">~</span>
        <input value={end} onChange={e => setEnd(e.target.value)} placeholder="結束號段" className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
        <button onClick={gen} className="px-2.5 py-1.5 bg-gray-100 text-xs rounded shrink-0">產生</button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={Math.min(Math.max(item.quantity, 2), 5)}
        placeholder="89... 每行一個" className={`w-full px-2 py-1.5 border rounded text-sm font-mono ${lines.length >= item.quantity ? 'border-green-300 bg-green-50' : 'border-gray-300'}`} />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-gray-400">{lines.length !== item.quantity && lines.length > 0 ? `需要 ${item.quantity} 個` : ''}</span>
        <button onClick={() => onSave(item, text)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs">儲存</button>
      </div>
    </div>
  )
}
