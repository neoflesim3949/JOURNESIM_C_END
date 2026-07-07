'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Users, Shield, User, CreditCard, Plus, RotateCcw, Wallet, KeyRound } from 'lucide-react'

interface Staff { id: string; username: string; display_name: string | null; role: 'manager' | 'sales'; active: boolean }
interface Agency { id: string; name: string; contact_name: string | null; contact_phone: string | null; status: 'active' | 'disabled'; created_at: string }
interface Card { iccid: string; type: string | null }

export default function AgencyDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [agency, setAgency] = useState<Agency | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [cardCount, setCardCount] = useState(0)
  const [groupCount, setGroupCount] = useState(0)
  const [pool, setPool] = useState<Card[]>([])
  const [allocated, setAllocated] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewStaff, setShowNewStaff] = useState(false)
  const [cred, setCred] = useState<{ username: string; password: string } | null>(null)

  const loadDetail = useCallback(async () => {
    const d = await fetch(`/api/admin/travel/${id}`).then(r => r.json()).catch(() => null)
    if (d?.agency) { setAgency(d.agency); setStaff(d.staff || []); setCardCount(d.card_count || 0); setGroupCount(d.group_count || 0) }
    setLoading(false)
  }, [id])
  const loadCards = useCallback(async () => {
    const d = await fetch(`/api/admin/travel/${id}/cards`).then(r => r.json()).catch(() => null)
    if (d) { setPool(d.pool || []); setAllocated(d.allocated || []) }
  }, [id])

  useEffect(() => { loadDetail(); loadCards() }, [loadDetail, loadCards])

  async function toggleStatus() {
    if (!agency) return
    await fetch(`/api/admin/travel/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: agency.status === 'active' ? 'disabled' : 'active' }) })
    loadDetail()
  }
  async function toggleStaff(s: Staff) {
    await fetch(`/api/admin/travel/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: s.id, active: !s.active }) })
    loadDetail()
  }
  async function allocate(iccids: string[]) {
    if (iccids.length === 0) return
    await fetch(`/api/admin/travel/${id}/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iccids }) })
    loadCards(); loadDetail()
  }
  async function reclaim(iccid: string) {
    await fetch(`/api/admin/travel/${id}/cards`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iccid }) })
    loadCards(); loadDetail()
  }
  async function createStaff(body: { username: string; display_name: string; role: 'manager' | 'sales' }) {
    const d = await fetch(`/api/admin/travel/${id}/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null)
    if (d?.error) { alert(d.error); return }
    setShowNewStaff(false)
    if (d?.password) setCred(d)
    loadDetail()
  }
  async function resetPassword(s: Staff) {
    if (!confirm(`重設 ${s.username} 的密碼？`)) return
    const d = await fetch(`/api/admin/travel/${id}/staff`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: s.id }) }).then(r => r.json()).catch(() => null)
    if (d?.error) { alert(d.error); return }
    if (d?.password) setCred(d)
  }

  if (loading) return <div className="text-gray-400">載入中…</div>
  if (!agency) return <div className="text-gray-500">找不到此旅行社。<Link href="/admin/travel" className="text-teal-600">返回</Link></div>

  return (
    <div className="max-w-5xl">
      <Link href="/admin/travel" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" />旅行社專區</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{agency.name}</h1>
          <div className="text-sm text-gray-400 mt-1">聯絡人 {agency.contact_name || '—'} · {agency.contact_phone || '—'} · {groupCount} 團 · {cardCount} 張卡</div>
        </div>
        <button onClick={toggleStatus}
          className={`px-3 py-1.5 text-sm rounded-lg border ${agency.status === 'active' ? 'border-green-300 text-green-600' : 'border-gray-300 text-gray-500'}`}>
          {agency.status === 'active' ? '啟用中' : '已停用'}
        </button>
      </div>

      {/* 人員 */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-1.5"><Users className="w-4 h-4" />人員（{staff.length}）</h2>
          <button onClick={() => setShowNewStaff(true)} className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"><Plus className="w-4 h-4" />新增人員</button>
        </div>
        <div className="divide-y divide-gray-50">
          {staff.map(s => (
            <div key={s.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${s.role === 'manager' ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-500'}`}>
                  {s.role === 'manager' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-sm text-gray-800">{s.display_name || s.username} <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded ${s.role === 'manager' ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-500'}`}>{s.role === 'manager' ? '管理者' : '業務'}</span></div>
                  <div className="text-xs text-gray-400">{s.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => resetPassword(s)} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"><KeyRound className="w-3.5 h-3.5" />重設密碼</button>
                <button onClick={() => toggleStaff(s)} className={`text-xs px-2 py-1 rounded border ${s.active ? 'border-green-200 text-green-600' : 'border-gray-200 text-gray-400'}`}>{s.active ? '啟用' : '停用'}</button>
              </div>
            </div>
          ))}
          {staff.length === 0 && <div className="py-4 text-center text-sm text-gray-400">尚無人員，點右上「新增人員」建立第一個管理者帳號</div>}
        </div>
        <p className="mt-2 text-xs text-gray-400">建立第一個管理者後，其餘人員可由旅行社管理者於旅行社後台自行新增。</p>
      </section>

      {/* 卡片庫存分配 */}
      <CardAllocation agencyName={agency.name} pool={pool} allocated={allocated} onAllocate={allocate} onReclaim={reclaim} />

      {/* 結算（Phase 2 金流後啟用） */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Wallet className="w-4 h-4" />利潤結算</h2>
        <div className="py-6 text-center text-sm text-gray-400">金流上線後，將由團員訂單自動彙總每月應結算利潤。</div>
      </section>

      {showNewStaff && <NewStaffModal onClose={() => setShowNewStaff(false)} onCreate={createStaff} />}
      {cred && <CredModal cred={cred} onClose={() => setCred(null)} />}
    </div>
  )
}

function NewStaffModal({ onClose, onCreate }: { onClose: () => void; onCreate: (b: { username: string; display_name: string; role: 'manager' | 'sales' }) => void }) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'manager' | 'sales'>('manager')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">新增人員</h2>
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">姓名</label><input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">登入帳號</label><input value={username} onChange={e => setUsername(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">角色</label>
            <div className="flex gap-2">
              {(['manager', 'sales'] as const).map(r => (
                <button key={r} onClick={() => setRole(r)} className={`flex-1 px-3 py-2 text-sm rounded-lg border ${role === r ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-500'}`}>{r === 'manager' ? '管理者' : '業務'}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
          <button disabled={!name || !username} onClick={() => onCreate({ username, display_name: name, role })} className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">建立</button>
        </div>
      </div>
    </div>
  )
}

function CredModal({ cred, onClose }: { cred: { username: string; password: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">帳號密碼</h2>
        <p className="text-xs text-gray-400 mb-4">請立即記下密碼，只會顯示一次。</p>
        <div className="rounded-xl bg-gray-50 p-4 text-left space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-400">帳號</span><span className="font-mono text-gray-800">{cred.username}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-400">初始密碼</span><span className="font-mono text-teal-600 font-semibold">{cred.password}</span></div>
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700">我已記下</button>
      </div>
    </div>
  )
}

function CardAllocation({ agencyName, pool, allocated, onAllocate, onReclaim }: {
  agencyName: string; pool: Card[]; allocated: Card[]; onAllocate: (iccids: string[]) => void; onReclaim: (iccid: string) => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  function toggle(ic: string) { setSel(prev => { const n = new Set(prev); if (n.has(ic)) n.delete(ic); else n.add(ic); return n }) }
  function assignSelected() { onAllocate([...sel]); setSel(new Set()) }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-1.5"><CreditCard className="w-4 h-4" />卡片庫存分配</h2>
        <span className="text-xs text-gray-400">此社已分配 {allocated.length} 張 · 未分配庫存 {pool.length} 張{pool.length >= 500 ? '+' : ''}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">未分配庫存</span>
            <button onClick={assignSelected} disabled={sel.size === 0}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-teal-600 text-white disabled:opacity-40"><Plus className="w-3.5 h-3.5" />分配選取（{sel.size}）</button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {pool.map(c => (
              <label key={c.iccid} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={sel.has(c.iccid)} onChange={() => toggle(c.iccid)} />
                <span className="text-xs font-mono text-gray-600">{c.iccid}</span>
                {c.type && <span className="text-[10px] text-gray-400 uppercase">{c.type}</span>}
              </label>
            ))}
            {pool.length === 0 && <div className="py-4 text-center text-sm text-gray-400">無未分配庫存</div>}
          </div>
        </div>
        <div className="border border-gray-200 rounded-xl p-3">
          <div className="text-sm font-medium text-gray-700 mb-2">已分配給 {agencyName}</div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {allocated.map(c => (
              <div key={c.iccid} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50">
                <span className="text-xs font-mono text-gray-600">{c.iccid}</span>
                <button onClick={() => onReclaim(c.iccid)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"><RotateCcw className="w-3.5 h-3.5" />收回</button>
              </div>
            ))}
            {allocated.length === 0 && <div className="py-4 text-center text-sm text-gray-400">尚未分配卡片</div>}
          </div>
        </div>
      </div>
    </section>
  )
}
