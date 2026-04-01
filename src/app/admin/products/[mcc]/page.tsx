'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Plus, Pencil, Trash2, Package } from 'lucide-react'

interface Country {
  mcc: string
  name: string
  continent: string
  flag_url: string | null
}

interface Product {
  id: string
  name: string
  description: string | null
  product_type: string
  is_active: boolean
  sort_order: number
  _plan_count?: number
}

export default function AdminCountryProductsPage() {
  const { mcc } = useParams() as { mcc: string }
  const [country, setCountry] = useState<Country | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', product_type: 'esim' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', product_type: 'esim' })

  async function loadData() {
    const res = await fetch(`/api/admin/products/countries/${mcc}`)
    if (res.ok) {
      const data = await res.json()
      setCountry(data.country)
      setProducts(data.products)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [mcc])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        country_code: mcc,
        country_name: country?.name || '',
      }),
    })
    if (res.ok) {
      setShowCreate(false)
      setForm({ name: '', description: '', product_type: 'esim' })
      loadData()
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id)
    setEditForm({ name: p.name, description: p.description || '', product_type: p.product_type })
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, name: editForm.name, description: editForm.description || null }),
    })
    setEditingId(null)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此方案？綁定的套餐也會一併刪除。')) return
    await fetch('/api/admin/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    loadData()
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    })
    loadData()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="w-4 h-4" /> 返回國家列表
      </Link>

      {/* Country Header */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {country?.flag_url ? (
            <Image src={country.flag_url} alt={country.name} width={48} height={36} className="rounded shadow" />
          ) : (
            <div className="w-12 h-9 bg-gray-100 rounded" />
          )}
          <div>
            <h1 className="text-2xl font-bold">{country?.name || mcc}</h1>
            <p className="text-sm text-gray-500">{country?.continent} · {mcc}</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新增方案
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 bg-white p-6 rounded-xl border border-gray-200 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">方案名稱</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={`例：${country?.name || ''} eSIM`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">類型</label>
              <select
                value={form.product_type}
                onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="esim">eSIM</option>
                <option value="sim">SIM 卡</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">描述（選填）</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="方案描述"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">建立</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
          </div>
        </form>
      )}

      {/* Product List */}
      {products.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無方案，點擊「新增方案」開始建立</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {products.map((p) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all">
              {editingId === p.id ? (
                <form onSubmit={handleSaveEdit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">方案名稱</label>
                      <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium">類型</label>
                      <select value={editForm.product_type} onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="esim">eSIM</option>
                        <option value="sim">SIM 卡</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium">描述</label>
                      <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="方案描述" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">儲存</button>
                    <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-gray-50">取消</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{p.name}</h3>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{p.product_type}</span>
                      <button
                        onClick={() => handleToggle(p.id, p.is_active)}
                        className={`px-2 py-0.5 text-xs rounded-full ${p.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {p.is_active ? '上架中' : '已下架'}
                      </button>
                    </div>
                    {p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {p._plan_count ? `已綁定 ${p._plan_count} 個套餐` : '尚未綁定套餐'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(p)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <Link href={`/admin/products/${mcc}/${p.id}`}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100">
                      管理套餐
                    </Link>
                    <button onClick={() => handleDelete(p.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
