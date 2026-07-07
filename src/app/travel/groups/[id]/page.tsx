'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Link2, Check, Smartphone, Cpu, Gift, ScanLine, MapPin, X, CalendarDays } from 'lucide-react'
import { tripDays, type TourGroup, type GroupPlan, type TourMember, type CatalogItem, type PlanType } from '../../_types'

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [group, setGroup] = useState<TourGroup | null>(null)
  const [plans, setPlans] = useState<GroupPlan[]>([])
  const [members, setMembers] = useState<TourMember[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const d = await fetch(`/api/travel/groups/${id}`).then(r => r.json()).catch(() => null)
    if (d?.group) { setGroup(d.group); setPlans(d.plans || []); setMembers(d.members || []) }
    setLoading(false)
  }, [id])
  const reloadCatalog = useCallback(async () => {
    const d = await fetch(`/api/travel/catalog?group_id=${id}`).then(r => r.json()).catch(() => null)
    if (d?.items) setCatalog(d.items)
  }, [id])

  useEffect(() => { reload(); reloadCatalog() }, [reload, reloadCatalog])

  const patchGroup = useCallback(async (fields: Record<string, unknown>, refreshCatalog = false) => {
    await fetch(`/api/travel/groups/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })
    await reload()
    if (refreshCatalog) reloadCatalog()
  }, [id, reload, reloadCatalog])

  if (loading) return <div className="text-gray-400">載入中…</div>
  if (!group) return <div className="text-gray-500">找不到此團。<Link href="/travel/groups" className="text-teal-600">返回</Link></div>

  return (
    <div className="max-w-5xl">
      <Link href="/travel/groups" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" />出團管理</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{group.name}</h1>
          <div className="text-sm text-gray-400 mt-1">
            團號 {group.code || '—'} · {group.depart_date || '—'} ~ {group.return_date || '—'}
            {tripDays(group.depart_date, group.return_date) && <> · {tripDays(group.depart_date, group.return_date)} 天</>}
            {group.countries.length > 0 && <> · {group.countries.join('、')}</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <Gift className="w-4 h-4 text-green-600" />
            <input type="checkbox" checked={group.base_is_free} onChange={e => patchGroup({ base_is_free: e.target.checked })} />基礎方案免費
          </label>
          <Link href={`/travel/groups/${group.id}/issue`} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 whitespace-nowrap"><ScanLine className="w-4 h-4" />現場發卡</Link>
        </div>
      </div>

      <InfoSection group={group} patchGroup={patchGroup} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <PlanColumn type="sim" groupId={id} plans={plans} catalog={catalog} reload={reload} days={tripDays(group.depart_date, group.return_date)} />
        <PlanColumn type="esim" groupId={id} plans={plans} catalog={catalog} reload={reload} days={tripDays(group.depart_date, group.return_date)} />
      </div>
      <BaseSection group={group} plans={plans} patchGroup={patchGroup} />
      <MembersSection groupId={id} plans={plans} members={members} reload={reload} />
    </div>
  )
}

// ---------- 團資訊 ----------
function InfoSection({ group, patchGroup }: { group: TourGroup; patchGroup: (f: Record<string, unknown>, rc?: boolean) => Promise<void> }) {
  const [country, setCountry] = useState('')
  const [form, setForm] = useState({ name: group.name, code: group.code || '', depart_date: group.depart_date || '', return_date: group.return_date || '' })
  useEffect(() => { setForm({ name: group.name, code: group.code || '', depart_date: group.depart_date || '', return_date: group.return_date || '' }) }, [group])
  const days = tripDays(form.depart_date || null, form.return_date || null)

  function commit(field: string, value: string) { if ((group as unknown as Record<string, unknown>)[field] !== value) patchGroup({ [field]: value }) }
  function addCountry() {
    const c = country.trim(); if (!c) return
    if (!group.countries.includes(c)) patchGroup({ countries: [...group.countries, c] }, true)
    setCountry('')
  }
  function removeCountry(c: string) { patchGroup({ countries: group.countries.filter(x => x !== c) }, true) }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
      <h2 className="font-semibold text-gray-800 mb-3">團資訊</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="團名"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onBlur={e => commit('name', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></Field>
        <Field label="團號"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} onBlur={e => commit('code', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></Field>
        <Field label="出發日"><input type="date" value={form.depart_date} onChange={e => { setForm({ ...form, depart_date: e.target.value }); patchGroup({ depart_date: e.target.value }) }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></Field>
        <Field label="回程日"><input type="date" value={form.return_date} onChange={e => { setForm({ ...form, return_date: e.target.value }); patchGroup({ return_date: e.target.value }) }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></Field>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-600">
        <CalendarDays className="w-4 h-4 text-teal-600" />天數：{days ? <span className="font-medium text-gray-800">{days} 天</span> : <span className="text-gray-300">請設定出發/回程日</span>}
        <span className="text-xs text-gray-400">（依日期自動計算，含頭尾）</span>
      </div>
      <div className="mt-4">
        <label className="block text-xs text-gray-500 mb-1.5 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />途經國家</label>
        <div className="flex flex-wrap items-center gap-2">
          {group.countries.map(c => (
            <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-sm">{c}<button onClick={() => removeCountry(c)} className="text-teal-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></span>
          ))}
          <div className="flex items-center gap-1">
            <input value={country} onChange={e => setCountry(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCountry() }} placeholder="新增國家" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28" />
            <button onClick={addCountry} disabled={!country.trim()} className="p-1.5 rounded-lg bg-teal-600 text-white disabled:opacity-40"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">加入方案時，只會列出「涵蓋所有途經國家」的套餐。</p>
      </div>
    </section>
  )
}

// ---------- 方案 ----------
function PlanColumn({ type, groupId, plans, catalog, reload, days }: {
  type: PlanType; groupId: string; plans: GroupPlan[]; catalog: CatalogItem[]; reload: () => Promise<void>; days: number | null
}) {
  const [adding, setAdding] = useState(false)
  const usedKeys = new Set(plans.map(p => `${p.package_plan_id}:${p.copies}`))
  // 依天數過濾：份數（copies）＝天數才顯示（未設天數則全列）
  const available = catalog.filter(c => c.plan_type === type && !usedKeys.has(c.key) && (days == null || Number(c.copies) === days))
  const rows = plans.filter(p => p.plan_type === type)
  const Icon = type === 'sim' ? Smartphone : Cpu
  const accent = type === 'sim' ? 'text-blue-600' : 'text-purple-600'

  async function addPlan(c: CatalogItem) {
    await fetch(`/api/travel/groups/${groupId}/plans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
    setAdding(false); reload()
  }
  async function setPrice(planId: string, price: number) {
    const d = await fetch(`/api/travel/groups/${groupId}/plans`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: planId, agency_price: price }) }).then(r => r.json()).catch(() => null)
    if (d?.error) alert(d.error)
    reload()
  }
  async function removePlan(planId: string) {
    await fetch(`/api/travel/groups/${groupId}/plans`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: planId }) })
    reload()
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className={`font-semibold flex items-center gap-1.5 ${accent}`}><Icon className="w-4 h-4" />{type === 'sim' ? 'SIM 方案' : 'eSIM 方案'}</h2>
        <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"><Plus className="w-4 h-4" />加入</button>
      </div>
      {adding && (
        <div className="mb-3 border border-dashed border-gray-300 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">依途經國家精準匹配{days != null ? `、僅顯示 ${days} 天（份數）` : ''}的套餐，建議售價自動帶入</div>
          <div className="space-y-2">
            {available.map(c => (
              <button key={c.key} onClick={() => addPlan(c)} className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2 text-left hover:border-teal-400">
                <span className="text-sm text-gray-700">{c.name}</span>
                <span className="text-xs whitespace-nowrap"><span className="text-gray-400">建議 NT${c.suggested_price ?? '—'}</span> <span className="text-amber-600">成本 NT${c.our_cost}</span></span>
              </button>
            ))}
            {available.length === 0 && <div className="text-sm text-gray-400">無可加入的方案（請確認途經國家）</div>}
          </div>
        </div>
      )}
      <div className="space-y-2">
        {rows.map(p => <PlanRow key={p.id} plan={p} onPrice={setPrice} onRemove={removePlan} />)}
        {rows.length === 0 && <div className="py-6 text-center text-sm text-gray-400">尚未加入 {type === 'sim' ? 'SIM' : 'eSIM'} 方案</div>}
      </div>
    </section>
  )
}

function PlanRow({ plan, onPrice, onRemove }: { plan: GroupPlan; onPrice: (id: string, price: number) => void; onRemove: (id: string) => void }) {
  const [price, setPriceLocal] = useState(String(plan.agency_price ?? ''))
  useEffect(() => { setPriceLocal(String(plan.agency_price ?? '')) }, [plan.agency_price])
  const over = plan.suggested_price != null && Number(price) > Number(plan.suggested_price)
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700 truncate">{plan.name}</div>
        <div className="text-[11px]"><span className="text-gray-400">建議 NT${plan.suggested_price ?? '—'}</span> · <span className="text-amber-600">成本 NT${plan.our_cost ?? 0}</span></div>
      </div>
      <div className="shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">NT$</span>
          <input type="number" value={price} onChange={e => setPriceLocal(e.target.value)} onBlur={() => onPrice(plan.id, Number(price))}
            className={`w-20 border rounded px-2 py-1 text-sm ${over ? 'border-red-400 text-red-600' : 'border-gray-200'}`} />
        </div>
        {over && <div className="text-[11px] text-red-500 mt-0.5 text-right">超過建議售價</div>}
      </div>
      <button onClick={() => onRemove(plan.id)} className="shrink-0 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
    </div>
  )
}

// ---------- 基礎方案 ----------
function BaseSection({ group, plans, patchGroup }: { group: TourGroup; plans: GroupPlan[]; patchGroup: (f: Record<string, unknown>) => Promise<void> }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
      <h2 className="font-semibold text-gray-800 mb-1">基礎方案</h2>
      <p className="text-xs text-gray-400 mb-3">團員預設拿到的方案。SIM / eSIM 各選一個，兩者互換免費；升級才收差額。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BasePicker label="基礎 SIM" icon={<Smartphone className="w-4 h-4" />} plans={plans.filter(p => p.plan_type === 'sim')} value={group.base_sim_plan_id} onChange={v => patchGroup({ base_sim_plan_id: v })} />
        <BasePicker label="基礎 eSIM" icon={<Cpu className="w-4 h-4" />} plans={plans.filter(p => p.plan_type === 'esim')} value={group.base_esim_plan_id} onChange={v => patchGroup({ base_esim_plan_id: v })} />
      </div>
    </section>
  )
}

function BasePicker({ label, icon, plans, value, onChange }: { label: string; icon: React.ReactNode; plans: GroupPlan[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">{icon}{label}</div>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
        <option value="">— 未設定 —</option>
        {plans.map(p => <option key={p.id} value={p.id}>{p.name}（NT${p.agency_price ?? '—'}）</option>)}
      </select>
    </div>
  )
}

// ---------- 團員 ----------
function MembersSection({ groupId, plans, members, reload }: { groupId: string; plans: GroupPlan[]; members: TourMember[]; reload: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const planMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans])

  async function addMember() {
    if (!name.trim()) return
    await fetch(`/api/travel/groups/${groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contact }) })
    setName(''); setContact(''); reload()
  }
  async function removeMember(mid: string) {
    await fetch(`/api/travel/groups/${groupId}/members`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: mid }) })
    reload()
  }
  function copyLink(token: string) {
    navigator.clipboard?.writeText(`${location.origin}/tour/${token}`).catch(() => {})
    setCopied(token); setTimeout(() => setCopied(null), 1500)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-800 mb-3">團員名單（{members.length}）</h2>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div><label className="block text-xs text-gray-500 mb-1">姓名</label><input value={name} onChange={e => setName(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" placeholder="團員姓名" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">聯絡方式</label><input value={contact} onChange={e => setContact(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" placeholder="手機 / Email" /></div>
        <button onClick={addMember} disabled={!name.trim()} className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-40"><Plus className="w-4 h-4" />加入團員</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b">
            <th className="py-2 font-medium">姓名 / 聯絡</th><th className="py-2 font-medium">目前選擇</th><th className="py-2 font-medium w-24">線上實收</th><th className="py-2 font-medium w-20">付款</th><th className="py-2 font-medium w-20">發放</th><th className="py-2 font-medium w-28">專屬連結</th><th className="py-2 font-medium w-8"></th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => {
            const plan = m.chosen_plan_id ? planMap.get(m.chosen_plan_id) : null
            return (
              <tr key={m.id} className="border-b border-gray-50">
                <td className="py-2"><div className="text-gray-700">{m.name}</div><div className="text-xs text-gray-400">{m.contact}</div></td>
                <td className="py-2">{plan ? <span className="flex items-center gap-1.5 text-gray-700"><TypeBadge type={plan.plan_type} />{plan.name}</span> : <span className="text-gray-300">未選擇</span>}</td>
                <td className="py-2 text-gray-700">{m.pay_status === 'free' ? '—' : `NT$${m.online_charge}`}</td>
                <td className="py-2"><PayBadge status={m.pay_status} /></td>
                <td className="py-2">{m.issued ? <span className="text-green-600 flex items-center gap-1"><Check className="w-4 h-4" />{m.iccid || 'eSIM'}</span> : <span className="text-gray-300">未發放</span>}</td>
                <td className="py-2"><button onClick={() => copyLink(m.token)} className="flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs">{copied === m.token ? <><Check className="w-3.5 h-3.5" />已複製</> : <><Link2 className="w-3.5 h-3.5" />複製連結</>}</button></td>
                <td className="py-2 text-right"><button onClick={() => removeMember(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            )
          })}
          {members.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">尚無團員</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

// ---------- 共用 ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}
function TypeBadge({ type }: { type: PlanType }) {
  return type === 'sim'
    ? <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600"><Smartphone className="w-3 h-3" />SIM</span>
    : <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600"><Cpu className="w-3 h-3" />eSIM</span>
}
function PayBadge({ status }: { status: TourMember['pay_status'] }) {
  const map = { paid: ['bg-green-50 text-green-600', '已付款'], unpaid: ['bg-gray-100 text-gray-400', '未付款'], free: ['bg-teal-50 text-teal-600', '免費'] } as const
  const [cls, label] = map[status]
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{label}</span>
}
