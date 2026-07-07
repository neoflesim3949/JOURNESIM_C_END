'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ScanLine, Smartphone, Cpu, Check, QrCode, X, RotateCcw, Package } from 'lucide-react'
import type { TourGroup, GroupPlan, TourMember, PlanType } from '../../../_types'

type Filter = 'todo' | 'done' | 'all'

export default function IssuePage() {
  const { id } = useParams<{ id: string }>()
  const [group, setGroup] = useState<TourGroup | null>(null)
  const [plans, setPlans] = useState<GroupPlan[]>([])
  const [members, setMembers] = useState<TourMember[]>([])
  const [available, setAvailable] = useState<string[]>([])
  const [filter, setFilter] = useState<Filter>('todo')
  const [issuing, setIssuing] = useState<TourMember | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [d, inv] = await Promise.all([
      fetch(`/api/travel/groups/${id}`).then(r => r.json()).catch(() => null),
      fetch('/api/travel/inventory').then(r => r.json()).catch(() => null),
    ])
    if (d?.group) { setGroup(d.group); setPlans(d.plans || []); setMembers(d.members || []) }
    if (inv?.available) setAvailable(inv.available)
    setLoading(false)
  }, [id])
  useEffect(() => { reload() }, [reload])

  const planMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans])
  function planOf(m: TourMember): GroupPlan | null {
    const pid = m.chosen_plan_id || group?.base_sim_plan_id || group?.base_esim_plan_id
    return pid ? planMap.get(pid) || null : null
  }

  async function commitIssue(m: TourMember, iccid: string | null) {
    const body: Record<string, unknown> = { member_id: m.id, issue: true }
    if (iccid) body.iccid = iccid
    const d = await fetch(`/api/travel/groups/${id}/members`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null)
    if (d?.error) { alert(d.error); return }
    setIssuing(null); reload()
  }
  async function undoIssue(m: TourMember) {
    await fetch(`/api/travel/groups/${id}/members`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: m.id, issue: false }) })
    reload()
  }

  if (loading) return <div className="text-gray-400 p-6">載入中…</div>
  if (!group) return <div className="text-gray-500 p-6">找不到此團。</div>

  const issued = members.filter(m => m.issued).length
  const list = members.filter(m => filter === 'all' ? true : filter === 'done' ? m.issued : !m.issued)

  return (
    <div className="max-w-md mx-auto -m-8 min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 pt-5 pb-3">
        <Link href={`/travel/groups/${group.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 mb-2"><ArrowLeft className="w-4 h-4" />返回團管理</Link>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">現場發卡</h1>
          <span className="flex items-center gap-1 text-xs text-gray-500"><Package className="w-3.5 h-3.5" />庫存 {available.length} 張</span>
        </div>
        <div className="text-sm text-gray-400">{group.name}</div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1"><span>已發放</span><span>{issued}/{members.length}</span></div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${members.length ? (issued / members.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="flex gap-1 mt-3">
          {([['todo', '待發放'], ['done', '已發放'], ['all', '全部']] as [Filter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-sm rounded-lg ${filter === f ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {list.map(m => {
          const plan = planOf(m)
          return (
            <div key={m.id} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-800">{m.name}</div>
                  <div className="text-xs text-gray-400">{m.contact}</div>
                  <div className="mt-2">
                    {plan ? <span className="inline-flex items-center gap-1.5 text-sm text-gray-700"><TypeIcon type={plan.plan_type} />{plan.name}</span> : <span className="text-sm text-gray-300">尚未選擇方案</span>}
                    {!m.chosen_plan_id && plan && <span className="ml-1 text-[11px] text-amber-500">（採基礎方案）</span>}
                  </div>
                </div>
                {m.issued && <span className="shrink-0 inline-flex items-center gap-1 text-teal-600 text-sm"><Check className="w-4 h-4" />已發放</span>}
              </div>
              {m.issued ? (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2">
                  <span className="text-xs text-teal-700 font-mono">{m.iccid || 'eSIM QR'}</span>
                  <button onClick={() => undoIssue(m)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"><RotateCcw className="w-3.5 h-3.5" />取消</button>
                </div>
              ) : (
                <button onClick={() => setIssuing(m)} disabled={!plan} className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
                  {plan?.plan_type === 'esim' ? <><QrCode className="w-4 h-4" />產生 eSIM QR</> : <><ScanLine className="w-4 h-4" />掃描 / 輸入卡號</>}
                </button>
              )}
            </div>
          )
        })}
        {list.length === 0 && <div className="text-center text-gray-400 py-12">沒有{filter === 'todo' ? '待發放' : filter === 'done' ? '已發放' : ''}的團員</div>}
      </div>

      {issuing && <IssueModal member={issuing} plan={planOf(issuing)} available={available} onClose={() => setIssuing(null)} onDone={commitIssue} />}
    </div>
  )
}

function IssueModal({ member, plan, available, onClose, onDone }: {
  member: TourMember; plan: GroupPlan | null; available: string[]; onClose: () => void; onDone: (m: TourMember, iccid: string | null) => void
}) {
  const isEsim = plan?.plan_type === 'esim'
  const [iccid, setIccid] = useState('')
  const [err, setErr] = useState('')
  const [qr, setQr] = useState(false)

  function scan() { setErr(''); if (available[0]) setIccid(available[0]); else setErr('庫存已無可用 SIM') }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-800">發卡給 {member.name}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {plan && <div className="text-sm text-gray-500 mb-4 flex items-center gap-1.5"><TypeIcon type={plan.plan_type} />{plan.name}</div>}
        {isEsim ? (
          <div className="text-center">
            {qr ? (
              <>
                <div className="w-40 h-40 mx-auto rounded-xl bg-gray-900 text-white flex items-center justify-center"><QrCode className="w-24 h-24" /></div>
                <p className="mt-3 text-xs text-gray-500">確認後將產生 eSIM QR（正式版走 BC F040）並寄送給旅客</p>
                <button onClick={() => onDone(member, null)} className="mt-4 w-full py-3 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700">完成發卡</button>
              </>
            ) : (
              <button onClick={() => setQr(true)} className="w-full py-3 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 flex items-center justify-center gap-2"><QrCode className="w-5 h-5" />產生 eSIM QR</button>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs text-gray-500 mb-1">SIM 卡號（ICCID）</label>
            <div className="flex gap-2">
              <input value={iccid} onChange={e => { setIccid(e.target.value); setErr('') }} placeholder="掃描或手動輸入" className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono" />
              <button onClick={scan} className="flex items-center gap-1 px-3 rounded-lg bg-gray-900 text-white text-sm"><ScanLine className="w-4 h-4" />掃描</button>
            </div>
            {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
            <div className="text-[11px] text-gray-400 mt-2">庫存可用：{available.length} 張</div>
            <button onClick={() => { if (!iccid.trim()) { setErr('請輸入或掃描卡號'); return } onDone(member, iccid.trim()) }} className="mt-4 w-full py-3 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700">確認發卡</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TypeIcon({ type }: { type: PlanType }) {
  return type === 'sim'
    ? <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600"><Smartphone className="w-3 h-3" />SIM</span>
    : <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600"><Cpu className="w-3 h-3" />eSIM</span>
}
