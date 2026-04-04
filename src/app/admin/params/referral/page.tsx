'use client'

import { useEffect, useState } from 'react'
import { Save, Pencil, X, Award, Percent, DollarSign, Clock, Settings2 } from 'lucide-react'

interface Setting {
  key: string
  value: string
  description: string
  updated_at?: string
}

export default function AdminReferralSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  async function load() {
    const res = await fetch('/api/admin/params/referral')
    if (res.ok) setSettings(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveSetting(key: string) {
    const res = await fetch('/api/admin/params/referral', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: editValue }),
    })
    if (res.ok) {
      setEditingKey(null)
      load()
    } else {
      alert('更新失敗')
    }
  }

  const getIcon = (key: string) => {
    if (key.includes('percent')) return <Percent className="w-4 h-4 text-primary" />
    if (key.includes('bonus')) return <Award className="w-4 h-4 text-orange-500" />
    if (key.includes('min_spend')) return <DollarSign className="w-4 h-4 text-green-600" />
    if (key.includes('lock_days')) return <Clock className="w-4 h-4 text-blue-600" />
    return <Settings2 className="w-4 h-4 text-gray-500" />
  }

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">聯盟行銷與點數規則設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">在此設定推薦分潤比例、獎勵門檻與解凍天數。</p>
      </div>

      <div className="mt-8 bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left w-64">設定項目</th>
              <th className="px-6 py-4 text-left">當前設定數值</th>
              <th className="px-6 py-4 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {settings.map((s) => (
              <tr key={s.key} className="hover:bg-muted/10 transition-colors">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    {getIcon(s.key)}
                    {s.key}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                </td>
                <td className="px-6 py-5">
                  {editingKey === s.key ? (
                    <div className="flex items-center gap-2">
                       <input
                         type="text"
                         value={editValue}
                         onChange={(e) => setEditValue(e.target.value)}
                         className="flex-1 max-w-[200px] px-3 py-2 border border-primary rounded-lg text-sm focus:outline-none ring-2 ring-primary/20"
                         autoFocus
                       />
                       {s.key.includes('percent') && <span className="text-xs text-muted-foreground font-mono"> (例如 0.05 代表 5%)</span>}
                    </div>
                  ) : (
                    <div className="text-lg font-mono font-black text-primary">
                      {s.key.includes('percent') ? `${(Number(s.value) * 100).toFixed(0)}%` : s.value}
                      <span className="text-xs text-muted-foreground ml-1 font-sans font-medium">
                        {s.key.includes('days') ? ' 天' : s.key.includes('percent') ? '' : ' 點/元'}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-5 text-center">
                   {editingKey === s.key ? (
                      <div className="flex items-center gap-2 justify-center">
                        <button onClick={() => saveSetting(s.key)} className="p-2 bg-primary text-white rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-sm shadow-primary/20">
                          <Save size={16} />
                        </button>
                        <button onClick={() => setEditingKey(null)} className="p-2 border border-border bg-white text-muted-foreground rounded-lg hover:bg-muted transition-all">
                          <X size={16} />
                        </button>
                      </div>
                   ) : (
                      <button onClick={() => { setEditingKey(s.key); setEditValue(s.value); }} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-all">
                        <Pencil size={16} />
                      </button>
                   )}
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={3} className="py-12 text-center text-muted-foreground">載入設定中...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2">
          <Settings2 size={16} /> 設定說明
        </h4>
        <ul className="text-xs text-blue-700/80 space-y-1.5 list-disc pl-4 leading-relaxed">
          <li><strong>分潤比例</strong>：請輸入小數點，例如 0.05 代表訂單實付金額的 5% 作為推薦獎勵。</li>
          <li><strong>首購加碼</strong>：當推薦的好友完成第一筆訂單時，發放給推薦人的額外固定點數。</li>
          <li><strong>鎖定期</strong>：訂單進入 Completed 後，點數會標記為 Pending，需經過此天數後排程才會將其解凍為可用點數，以防止退款套利。</li>
        </ul>
      </div>
    </div>
  )
}
