'use client'

import { useEffect, useState } from 'react'
import { Save, Pencil, X, Award, Percent, DollarSign, Clock, Settings2, Trophy } from 'lucide-react'

interface Tier {
  id: string
  name: string
  l1_rate: number
  l2_rate: number
  sort_order: number
}

interface Setting {
  key: string
  value: string
  description: string
}

export default function AdminReferralSettingsPage() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<any>(null)

  async function load() {
    const [tiersRes, settingsRes] = await Promise.all([
      fetch('/api/admin/params/tiers'),
      fetch('/api/admin/params/referral')
    ])
    if (tiersRes.ok) setTiers(await tiersRes.json())
    if (settingsRes.ok) setSettings(await settingsRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveTier(id: string) {
    const res = await fetch('/api/admin/params/tiers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editValue }),
    })
    if (res.ok) {
      setEditingTierId(null)
      load()
    }
  }

  async function saveSetting(key: string) {
    const res = await fetch('/api/admin/params/referral', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(editValue) }),
    })
    if (res.ok) {
      setEditingKey(null)
      load()
    }
  }

  return (
    <div className="max-w-4xl space-y-8 pb-32">
      <div>
        <h1 className="text-2xl font-bold">聯盟行銷與階級規則設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">在此設定不同階級的分潤比例與全站獎勵門檻。</p>
      </div>

      {/* Tiers Table */}
      <section className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="bg-muted/30 px-6 py-4 flex items-center gap-2 border-b border-border">
          <Trophy size={18} className="text-yellow-600" />
          <h2 className="text-sm font-bold">階級級差分潤 (Commission Rates)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left">會員等級名稱</th>
              <th className="px-6 py-4 text-left">一級分潤上限 (L1)</th>
              <th className="px-6 py-4 text-left">二級分潤上限 (L2)</th>
              <th className="px-6 py-4 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tiers.map((t) => {
              const isEditing = editingTierId === t.id
              return (
                <tr key={t.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                       t.name.includes('鑽石') ? 'bg-blue-50 text-blue-600' :
                       t.name.includes('黃金') ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-50 text-gray-600'
                    }`}>{t.name}</span>
                  </td>
                  <td className="px-6 py-4">
                     {isEditing ? (
                        <input type="number" step="0.01" value={editValue.l1_rate} onChange={(e) => setEditValue({ ...editValue, l1_rate: e.target.value })}
                          className="w-24 px-2 py-1 border border-primary rounded text-sm focus:outline-none ring-2 ring-primary/20" />
                     ) : <span className="font-mono font-bold">{(t.l1_rate * 100).toFixed(0)}%</span>}
                  </td>
                  <td className="px-6 py-4">
                     {isEditing ? (
                        <input type="number" step="0.01" value={editValue.l2_rate} onChange={(e) => setEditValue({ ...editValue, l2_rate: e.target.value })}
                          className="w-24 px-2 py-1 border border-primary rounded text-sm focus:outline-none ring-2 ring-primary/20" />
                     ) : <span className="font-mono font-bold">{(t.l2_rate * 100).toFixed(0)}%</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                     {isEditing ? (
                         <div className="flex items-center gap-2">
                             <button onClick={() => saveTier(t.id)} className="p-1.5 bg-green-600 text-white rounded"><Save size={14} /></button>
                             <button onClick={() => setEditingTierId(null)} className="p-1.5 bg-gray-400 text-white rounded"><X size={14} /></button>
                         </div>
                     ) : (
                         <button onClick={() => { setEditingTierId(t.id); setEditValue({ l1_rate: t.l1_rate, l2_rate: t.l2_rate }); }} className="text-muted-foreground hover:text-primary"><Pencil size={14} /></button>
                     )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* Global Settings */}
      <section className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="bg-muted/30 px-6 py-4 flex items-center gap-2 border-b border-border">
          <Settings2 size={18} className="text-primary" />
          <h2 className="text-sm font-bold">全站基礎設定 (F Point 規則)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-bold border-b border-border">
             <tr>
                <th className="px-6 py-4 text-left w-64">設定項目</th>
                <th className="px-6 py-4 text-left">數值</th>
                <th className="px-6 py-4 text-center w-24">操作</th>
             </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {settings.filter(s => !s.key.includes('percent')).map(s => {
                const isEditing = editingKey === s.key
                return (
                    <tr key={s.key} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4 font-bold">{s.description || s.key}</td>
                        <td className="px-6 py-4 font-mono">
                            {isEditing ? (
                                <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus
                                    className="w-full max-w-[200px] px-2 py-1 border border-primary rounded text-sm focus:outline-none ring-2 ring-primary/20" />
                            ) : s.value}
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground">
                            {isEditing ? (
                                <div className="flex items-center gap-2 justify-center">
                                    <button onClick={() => saveSetting(s.key)} className="p-1.5 bg-green-600 text-white rounded"><Save size={14} /></button>
                                    <button onClick={() => setEditingKey(null)} className="p-1.5 bg-gray-400 text-white rounded"><X size={14} /></button>
                                </div>
                            ) : (
                                <button onClick={() => { setEditingKey(s.key); setEditValue(s.value); }}><Pencil size={14} /></button>
                            )}
                        </td>
                    </tr>
                )
            })}
          </tbody>
        </table>
      </section>

      <div className="mt-6 p-4 bg-purple-50 border border-purple-100 rounded-lg space-y-2">
        <h4 className="text-xs font-black text-purple-700 flex items-center gap-2 uppercase tracking-widest">
          <Award size={14} /> 級差邏輯說明
        </h4>
        <ul className="text-xs text-purple-700/80 list-disc pl-4 space-y-1 font-medium">
          <li>系統支援最高 6% 的累計撥出額。當低等級會員產出業績時，剩餘的差額會逐級往上遞補給對應等的高級主管。</li>
          <li>一級獎金與二級獎金彼此獨立計算，皆遵循差額遞補原則。</li>
          <li>鎖定期結束後，F Point 會自動撥入對應錢包帳戶。</li>
        </ul>
      </div>
    </div>
  )
}
