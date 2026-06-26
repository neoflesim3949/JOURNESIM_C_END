'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, CreditCard, Package, Trash2, Save, Pencil } from 'lucide-react'

interface Member {
  id: string; email: string; display_name: string | null; avatar_url: string | null
  auth_provider: string; created_at: string
  line_user_id: string | null; google_user_id: string | null
  apple_user_id: string | null; facebook_user_id: string | null
}

interface Card { id: string; last_four: string; card_type: string; issuer: string; bin_code: string; created_at: string }
interface Order { id: string; order_number: string; total_amount: number; status: string; payment_method: string; created_at: string }

export default function AdminMemberDetailPage() {
  const { id } = useParams() as { id: string }
  const [member, setMember] = useState<Member | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ display_name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)

  async function loadData() {
    const res = await fetch(`/api/admin/members/${id}`)
    if (res.ok) {
      const data = await res.json()
      setMember(data.member)
      setCards(data.cards || [])
      setOrders(data.orders || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  function startEdit() {
    if (!member) return
    setEditForm({ display_name: member.display_name || '', email: member.email, password: '' })
    setEditing(true)
  }

  async function handleSave() {
    if (editForm.password && editForm.password.length < 6) { alert('密碼至少 6 碼'); return }
    setSaving(true)
    const body: Record<string, unknown> = { display_name: editForm.display_name, email: editForm.email }
    if (editForm.password) body.password = editForm.password // 留空＝不改密碼
    const res = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '儲存失敗'); return }
    setEditing(false)
    await loadData()
  }

  async function handleUnbind(provider: string) {
    if (!confirm(`確定要解除 ${provider} 綁定？解除後用戶將無法用 ${provider} 登入。`)) return
    await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [`${provider}_user_id`]: null }),
    })
    await loadData()
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm('確定要刪除此卡片？')) return
    await fetch(`/api/admin/members/${id}/cards`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    })
    await loadData()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>
  if (!member) return <div>找不到此會員</div>

  const socialIds = [
    { label: 'LINE', key: 'line', value: member.line_user_id, color: 'bg-green-500' },
    { label: 'Google', key: 'google', value: member.google_user_id, color: 'bg-blue-500' },
    { label: 'Apple', key: 'apple', value: member.apple_user_id, color: 'bg-black' },
    { label: 'Facebook', key: 'facebook', value: member.facebook_user_id, color: 'bg-blue-600' },
  ].filter((s) => s.value)

  return (
    <div>
      <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回會員列表
      </Link>

      {/* Profile */}
      <div className="mt-4 bg-white p-6 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-7 h-7 text-blue-600" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold">{member.display_name || member.email}</h1>
              <p className="text-sm text-gray-500">{member.email}</p>
            </div>
          </div>
          <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            <Pencil className="w-4 h-4" /> 編輯
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">名稱</label>
                <input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Email</label>
                <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">重設密碼（留空＝不改）</label>
                <input type="text" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="輸入新密碼（至少 6 碼）"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {saving ? '儲存中...' : '儲存'}
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">登入方式</div>
            <div className="font-medium">{member.auth_provider}</div>
          </div>
          <div>
            <div className="text-gray-500">註冊時間</div>
            <div className="font-medium">{new Date(member.created_at).toLocaleString('zh-TW')}</div>
          </div>
          <div className="col-span-2">
            <div className="text-gray-500">會員 ID</div>
            <div className="font-mono text-xs">{member.id}</div>
          </div>
        </div>

        {/* Social IDs */}
        {socialIds.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="text-xs font-medium text-gray-500 mb-2">已綁定的社群帳號</div>
            <div className="space-y-2">
              {socialIds.map((s) => (
                <div key={s.label} className="flex items-center gap-3 text-sm">
                  <span className={`w-6 h-6 ${s.color} text-white rounded flex items-center justify-center text-xs font-bold`}>
                    {s.label[0]}
                  </span>
                  <span className="font-medium">{s.label}</span>
                  <span className="font-mono text-xs text-gray-400 truncate flex-1">{s.value}</span>
                  <button onClick={() => handleUnbind(s.key)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded transition-colors">
                    解除綁定
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Saved Cards */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="w-5 h-5" /> 已儲存的卡片（{cards.length}）
        </h2>
        {cards.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">此會員尚未儲存卡片</p>
        ) : (
          <div className="mt-3 space-y-2">
            {cards.map((card) => (
              <div key={card.id} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CreditCard className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="font-medium">•••• •••• •••• {card.last_four}</div>
                    <div className="text-xs text-gray-500">{card.issuer || '信用卡'}{card.bin_code && ` · BIN ${card.bin_code}`}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(card.created_at).toLocaleString('zh-TW')}</span>
                  <button onClick={() => handleDeleteCard(card.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Package className="w-5 h-5" /> 訂單記錄（{orders.length}）
        </h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">此會員尚無訂單</p>
        ) : (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">訂單編號</th>
                  <th className="text-left px-4 py-2 font-medium">金額</th>
                  <th className="text-left px-4 py-2 font-medium">狀態</th>
                  <th className="text-left px-4 py-2 font-medium">付款</th>
                  <th className="text-left px-4 py-2 font-medium">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-blue-600 hover:underline">{order.order_number}</Link>
                    </td>
                    <td className="px-4 py-2 font-medium">NT$ {order.total_amount}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${order.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{order.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{order.payment_method || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(order.created_at).toLocaleString('zh-TW')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
