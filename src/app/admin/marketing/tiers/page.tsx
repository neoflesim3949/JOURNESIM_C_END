'use client'

import { useEffect, useState } from 'react'
import { Save, Pencil, X, Trophy, TrendingUp, DollarSign, ListOrdered } from 'lucide-react'

interface Tier {
  id: string
  name: string
  l1_rate: number
  l2_rate: number
  min_order_count: number
  min_yearly_spend: number
  sort_order: number
}

export default function AdminTiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Tier>>({})

  async function load() {
    const res = await fetch('/api/admin/params/tiers')
    if (res.ok) setTiers(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(id: string) {
    const res = await fetch('/api/admin/params/tiers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    if (res.ok) {
      setEditingId(null)
      load()
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">會員等級管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">設定會員等級的晉升門檻與對應的分潤比例。</p>
        </div>
        <Trophy className="w-8 h-8 text-yellow-500" />
      </div>

      <div className="mt-8 bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left">等級名稱</th>
              <th className="px-6 py-4 text-left">一級分潤上限</th>
              <th className="px-6 py-4 text-left">二級分潤上限</th>
              <th className="px-6 py-4 text-left">晉升：累積訂單</th>
              <th className="px-6 py-4 text-left">晉升：年消費額</th>
              <th className="px-6 py-4 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tiers.map((t) => {
              const isEditing = editingId === t.id
              return (
                <tr key={t.id} className="hover:bg-muted/5 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        t.name.includes('鑽石') ? 'bg-blue-400' :
                        t.name.includes('黃金') ? 'bg-yellow-400' : 'bg-gray-300'
                      }`} />
                      <span className="font-bold text-foreground">{t.name}</span>
                    </div>
                  </td>
                  
                  <td className="px-6 py-5">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" value={editForm.l1_rate} onChange={(e) => setEditForm({...editForm, l1_rate: Number(e.target.value)})}
                          className="w-20 px-2 py-1 border border-primary rounded text-sm outline-none" />
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-primary">{(t.l1_rate * 100).toFixed(0)}%</span>
                    )}
                  </td>

                  <td className="px-6 py-5">
                    {isEditing ? (
                      <input type="number" step="0.01" value={editForm.l2_rate} onChange={(e) => setEditForm({...editForm, l2_rate: Number(e.target.value)})}
                        className="w-20 px-2 py-1 border border-primary rounded text-sm outline-none" />
                    ) : (
                      <span className="font-mono font-bold text-muted-foreground">{(t.l2_rate * 100).toFixed(0)}%</span>
                    )}
                  </td>

                  <td className="px-6 py-5">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <ListOrdered size={14} className="text-muted-foreground" />
                        <input type="number" value={editForm.min_order_count} onChange={(e) => setEditForm({...editForm, min_order_count: Number(e.target.value)})}
                          className="w-20 px-2 py-1 border border-primary rounded text-sm outline-none" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-medium">
                        滿 {t.min_order_count} 筆
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-5">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <DollarSign size={14} className="text-muted-foreground" />
                        <input type="number" value={editForm.min_yearly_spend} onChange={(e) => setEditForm({...editForm, min_yearly_spend: Number(e.target.value)})}
                          className="w-32 px-2 py-1 border border-primary rounded text-sm outline-none" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-medium text-green-600">
                        NT$ {(t.min_yearly_spend || 0).toLocaleString()}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-5">
                    {isEditing ? (
                      <div className="flex items-center gap-2 justify-center">
                        <button onClick={() => save(t.id)} className="p-1.5 bg-primary text-white rounded hover:opacity-90"><Save size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-400 text-white rounded hover:bg-gray-500"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { 
                        setEditingId(t.id); 
                        setEditForm({
                          l1_rate: t.l1_rate || 0,
                          l2_rate: t.l2_rate || 0,
                          min_order_count: t.min_order_count || 0,
                          min_yearly_spend: t.min_yearly_spend || 0
                        }); 
                      }} className="mx-auto block p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                        <Pencil size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4">
        <TrendingUp className="w-6 h-6 text-blue-600 mt-1" />
        <div>
           <h4 className="font-black text-blue-800 uppercase tracking-widest text-xs">晉升邏輯說明</h4>
           <p className="mt-2 text-sm text-blue-700/80 leading-relaxed">
             當會員進行消費時，系統會自動檢查其年度消費總額及訂單次數。
             若達到門檻，下次分潤計算將採用更高等級的比例。
             一級與二級分潤上限決定了該訂單最高撥出的佣金比例，剩餘差額將由上級聯盟主管遞補。
           </p>
        </div>
      </div>
    </div>
  )
}
