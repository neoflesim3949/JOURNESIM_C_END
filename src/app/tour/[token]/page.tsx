'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Plane, Smartphone, Cpu, Check, Gift, ArrowRight, Sparkles, Info, UserPlus, Ticket, Activity, Mail, LogIn } from 'lucide-react'

type PlanType = 'sim' | 'esim'
interface Plan { id: string; name: string; plan_type: PlanType; agency_price: number | null }
interface Group { name: string; code: string | null; depart_date: string | null; return_date: string | null; base_is_free: boolean; base_sim_plan_id: string | null; base_esim_plan_id: string | null }
interface Member { name: string; chosen_plan_id: string | null; online_charge: number; pay_status: string; email: string | null; is_member: boolean }
interface Data { agency: { name: string; logo_url: string | null }; group: Group; plans: Plan[]; member: Member }

function chargeFor(group: Group, plans: Plan[], plan: Plan): { charge: number; label: string } {
  const baseIds = [group.base_sim_plan_id, group.base_esim_plan_id]
  const price = (id: string | null) => { const p = plans.find(x => x.id === id); return p ? Number(p.agency_price || 0) : 0 }
  if (!group.base_is_free) return { charge: Number(plan.agency_price || 0), label: '需付全額' }
  if (baseIds.includes(plan.id)) return { charge: 0, label: '基礎方案 · 已含' }
  const baseId = plan.plan_type === 'sim' ? group.base_sim_plan_id : group.base_esim_plan_id
  const diff = Math.max(Number(plan.agency_price || 0) - price(baseId), 0)
  return { charge: diff, label: diff === 0 ? '較低方案 · 差額不退' : '升級差額' }
}

export default function TourMemberPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<PlanType>('sim')
  const [selected, setSelected] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [coupon, setCoupon] = useState('')
  const [discount, setDiscount] = useState(0)
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/tour/${token}`)
    if (!res.ok) { setNotFound(true); return }
    const d: Data = await res.json()
    setData(d)
    const init = d.member.chosen_plan_id ?? d.group.base_sim_plan_id ?? d.group.base_esim_plan_id ?? (d.plans[0]?.id ?? null)
    setSelected(init)
    setTab(d.plans.find(p => p.id === init)?.plan_type ?? 'sim')
    if (d.member.email) setEmail(d.member.email)
    if (d.member.is_member) setRegistered(true)
    if (d.member.pay_status !== 'unpaid' && d.member.chosen_plan_id) setDone(true)
  }, [token])
  useEffect(() => { load() }, [load])

  if (notFound) return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center text-gray-500">找不到此連結對應的團員，請向您的旅行社確認。</div>
  if (!data) return null

  const { agency, group, plans, member } = data
  const plansOfTab = plans.filter(p => p.plan_type === tab)
  const plan = plans.find(p => p.id === selected) || null
  const pay = plan ? chargeFor(group, plans, plan) : null
  const payable = pay ? Math.max(pay.charge - discount, 0) : 0
  const discountShown = pay ? Math.min(discount, pay.charge) : 0
  const isEsim = plan?.plan_type === 'esim'
  const emailOk = !isEsim || /^\S+@\S+\.\S+$/.test(email.trim())

  function pickTab(t: PlanType) {
    setTab(t)
    const baseId = t === 'sim' ? group.base_sim_plan_id : group.base_esim_plan_id
    const first = plans.find(p => p.plan_type === t && p.id === baseId) || plans.find(p => p.plan_type === t)
    setSelected(first?.id ?? null)
  }
  function register() { setRegistered(true); setEmail(prev => prev || 'account@flesim.com'); setCoupon('WELCOME50'); setDiscount(50); setAppliedCode('WELCOME50') }
  function login() { setRegistered(true); setEmail(prev => prev || 'account@flesim.com') }
  function applyCoupon() { const c = coupon.trim().toUpperCase(); if (!c) return; setDiscount(50); setAppliedCode(c) }
  function clearCoupon() { setCoupon(''); setDiscount(0); setAppliedCode(null) }

  async function confirm() {
    if (!plan || saving) return
    setSaving(true)
    const d = await fetch(`/api/tour/${token}/select`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: plan.id, email: email.trim() || null, is_member: registered, coupon: appliedCode }),
    }).then(r => r.json()).catch(() => null)
    setSaving(false)
    if (d?.error) { alert(d.error); return }
    await load(); setDone(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-gray-50">
      <div className="max-w-md mx-auto px-5 pb-32">
        <div className="pt-8">
          {agency.logo_url
            ? <img src={agency.logo_url} alt={agency.name} className="h-10 object-contain" />
            : <div className="inline-flex items-center gap-1.5 text-teal-600 text-sm font-medium"><Plane className="w-4 h-4" />{agency.name}</div>}
        </div>

        <h1 className="text-xl font-bold text-gray-800 mt-3">{group.name}</h1>
        <div className="mt-1 text-sm text-gray-500 space-y-0.5">
          <div>團號：{group.code || '—'}</div>
          <div>時間：{group.depart_date || '—'} ~ {group.return_date || '—'}</div>
        </div>

        {done ? (
          <div className="mt-5"><DoneCard plans={plans} member={member} onChange={() => setDone(false)} /></div>
        ) : (
          <>
            <div className="mt-4 rounded-2xl bg-white border border-gray-100 p-4 text-sm text-gray-600 leading-relaxed">
              <div className="text-gray-800 font-medium">您好，{member.name} 👋</div>
              <p className="mt-1">再次感謝您選擇我們為您提供旅遊服務～</p>
              <p>本次旅遊網路服務由 <span className="font-semibold text-teal-600">FLESIM</span> 提供。</p>
              <p className="mt-1">旅行社為您提供了<span className={`font-semibold ${group.base_is_free ? 'text-teal-600' : 'text-amber-600'}`}>{group.base_is_free ? '免費' : '優惠'}</span>基礎方案，您可以在下方選擇更換為 eSIM 或升級方案。</p>
            </div>

            <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 p-4 text-xs text-amber-800 leading-relaxed">
              <div className="flex items-center gap-1.5 font-medium text-amber-700 mb-1"><Info className="w-4 h-4" />寄送注意事項</div>
              <p>・選擇<span className="font-medium">實體卡</span>方案：旅行社人員將於現場發放卡片給您。</p>
              <p>・選擇 <span className="font-medium">eSIM</span> 卡：將於您確認方案後寄送到您的電子信箱。</p>
            </div>

            <div className="mt-3 rounded-2xl bg-white border border-teal-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0"><Gift className="w-5 h-5" /></div>
                <div className="font-medium text-gray-800">註冊 FLESIM 會員，享專屬好康</div>
              </div>
              <ul className="space-y-1.5 text-sm text-gray-600 mb-3">
                <li className="flex items-center gap-2"><Ticket className="w-4 h-4 text-teal-500 shrink-0" />立即領取 <span className="font-medium text-teal-600">NT$50</span> 優惠券</li>
                <li className="flex items-center gap-2"><Activity className="w-4 h-4 text-teal-500 shrink-0" />隨時查看流量使用狀況</li>
                <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-teal-500 shrink-0" />不定期享會員專屬優惠</li>
              </ul>
              {registered ? (
                <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-teal-50 text-teal-700 text-sm font-medium"><Check className="w-4 h-4" />已登入會員 · 優惠已套用</div>
              ) : (
                <>
                  <button onClick={register} className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"><UserPlus className="w-4 h-4" />註冊領取</button>
                  <div className="flex items-center gap-3 my-2 text-xs text-gray-300"><span className="flex-1 h-px bg-gray-100" />或<span className="flex-1 h-px bg-gray-100" /></div>
                  <button onClick={login} className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-teal-300 text-teal-700 text-sm font-medium rounded-lg hover:bg-teal-50"><LogIn className="w-4 h-4" />登入綁定卡號</button>
                </>
              )}
            </div>

            <div className="mt-5">
              <div className="text-sm font-medium text-gray-700 mb-2"><span className="text-teal-600">1</span> · 選擇卡別</div>
              <div className="grid grid-cols-2 gap-3">
                {(['sim', 'esim'] as PlanType[]).map(t => {
                  const on = tab === t
                  return (
                    <button key={t} onClick={() => pickTab(t)} className={`rounded-2xl border p-4 flex flex-col items-center gap-1.5 transition ${on ? 'border-teal-500 bg-white ring-2 ring-teal-200' : 'border-gray-200 bg-white'}`}>
                      {t === 'sim' ? <Smartphone className="w-6 h-6 text-blue-500" /> : <Cpu className="w-6 h-6 text-purple-500" />}
                      <span className="font-medium text-gray-800">{t === 'sim' ? '實體 SIM 卡' : 'eSIM'}</span>
                      <span className="text-[11px] text-gray-400">{t === 'sim' ? '現場領取' : '掃碼安裝'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5">
              <div className="text-sm font-medium text-gray-700 mb-2"><span className="text-teal-600">2</span> · 選擇方案</div>
              <div className="space-y-3">
                {plansOfTab.map(p => {
                  const c = chargeFor(group, plans, p)
                  const isBase = [group.base_sim_plan_id, group.base_esim_plan_id].includes(p.id)
                  const on = selected === p.id
                  return (
                    <button key={p.id} onClick={() => setSelected(p.id)} className={`w-full text-left rounded-2xl border p-4 transition ${on ? 'border-teal-500 bg-white ring-2 ring-teal-200' : 'border-gray-200 bg-white hover:border-teal-300'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium text-gray-800 flex items-center gap-1.5">{p.name}{isBase && <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600"><Gift className="w-3 h-3" />基礎</span>}</div>
                        <div className="text-right shrink-0">
                          <div className={`font-semibold ${c.charge === 0 ? 'text-teal-600' : 'text-gray-800'}`}>{c.charge === 0 ? '免費' : `+NT$${c.charge}`}</div>
                          <div className="text-[11px] text-gray-400">{c.label}</div>
                        </div>
                      </div>
                      {on && <div className="mt-2 flex items-center gap-1 text-xs text-teal-600"><Check className="w-3.5 h-3.5" />已選擇</div>}
                    </button>
                  )
                })}
                {plansOfTab.length === 0 && <div className="text-center text-gray-400 py-8 rounded-2xl bg-white border border-gray-100">此卡別暫無方案</div>}
              </div>
            </div>

            {isEsim && (
              <div className="mt-5">
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Mail className="w-4 h-4 text-teal-600" />接收 eSIM 的電子信箱</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className={`w-full border rounded-lg px-3 py-2 text-sm ${email && !emailOk ? 'border-red-400' : 'border-gray-200'}`} />
                <p className="text-xs text-gray-400 mt-1">{registered ? '已帶入您的會員信箱，可自行修改。' : '確認後 eSIM QR 將寄送至此信箱。'}</p>
              </div>
            )}

            <div className="mt-5">
              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Ticket className="w-4 h-4 text-teal-600" />優惠券 / 優惠碼</div>
              {appliedCode ? (
                <div className="flex items-center justify-between rounded-2xl bg-teal-50 border border-teal-200 p-3">
                  <span className="flex items-center gap-2 text-sm text-teal-700"><Check className="w-4 h-4" />已套用「{appliedCode}」，折抵 NT${discountShown}</span>
                  <button onClick={clearCoupon} className="text-xs text-gray-400 hover:text-red-500">移除</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="輸入優惠碼" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={applyCoupon} disabled={!coupon.trim()} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg disabled:opacity-40">套用</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!done && plan && pay && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-gray-400">應付金額{discountShown > 0 && <span className="ml-1 text-teal-600">（已折 NT${discountShown}）</span>}</div>
              <div className="flex items-baseline gap-2">
                <div className="text-xl font-bold text-gray-800">{payable === 0 ? '免費' : `NT$${payable}`}</div>
                {discountShown > 0 && pay.charge > 0 && <div className="text-sm text-gray-300 line-through">NT${pay.charge}</div>}
              </div>
            </div>
            <button onClick={confirm} disabled={!emailOk || saving} title={!emailOk ? '請填寫正確的電子信箱' : ''} className="flex items-center gap-1.5 px-6 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-40">
              {saving ? '處理中…' : payable === 0 ? '確認選擇' : '前往付款'}<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DoneCard({ plans, member, onChange }: { plans: Plan[]; member: Member; onChange: () => void }) {
  const plan = plans.find(p => p.id === member.chosen_plan_id)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto"><Sparkles className="w-7 h-7" /></div>
      <div className="mt-3 font-semibold text-gray-800">已完成選擇！</div>
      <div className="text-sm text-gray-500 mt-1">{plan?.plan_type === 'esim' ? 'eSIM 將於確認後寄送到您的電子信箱。' : '出團前旅行社人員會於現場為您準備好卡片。'}</div>
      {plan && (
        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-left">
          <div className="flex items-center gap-2 text-gray-800 font-medium"><TypeIcon type={plan.plan_type} />{plan.name}</div>
          <div className="mt-2 flex items-center justify-between text-sm"><span className="text-gray-400">已付金額</span><span className="text-gray-800 font-medium">{member.pay_status === 'free' ? '免費' : `NT$${member.online_charge}`}</span></div>
        </div>
      )}
      <button onClick={onChange} className="mt-4 text-sm text-teal-600 hover:text-teal-700">重新選擇方案</button>
    </div>
  )
}

function TypeIcon({ type }: { type: PlanType }) {
  return type === 'sim'
    ? <span className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Smartphone className="w-4 h-4" /></span>
    : <span className="w-8 h-8 shrink-0 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><Cpu className="w-4 h-4" /></span>
}
