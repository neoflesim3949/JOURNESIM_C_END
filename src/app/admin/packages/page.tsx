'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Package as PackageIcon } from 'lucide-react'

interface Pkg {
  id: string; name: string; description: string | null; product_type: string
  is_active: boolean; _plan_count: number; _product_count: number
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', product_type: 'esim' })

  async function load() {
    const res = await fetch('/api/admin/packages')
    if (res.ok) setPackages(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowCreate(false)
    setForm({ name: '', description: '', product_type: 'esim' })
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此套餐？')) return
    await fetch('/api/admin/packages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch('/api/admin/packages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    })
    load()
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">套餐管理</h1>
          <p className="mt-1 text-sm text-gray-500">建立套餐並組合 BC 商品，套餐可被多個方案共用</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> 新增套餐
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 bg-white p-6 rounded-xl border border-gray-200 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">套餐名稱</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="例：東南亞 10 國 eSIM 日費" />
            </div>
            <div>
              <label className="text-sm font-medium">類型</label>
              <select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="esim">eSIM</option>
                <option value="sim">SIM 卡</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">描述（選填）</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="套餐描述" />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">建立</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">取消</button>
          </div>
        </form>
      )}

      {packages.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <PackageIcon className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無套餐，點擊「新增套餐」開始建立</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{pkg.name}</h3>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">{pkg.product_type}</span>
                    <button onClick={() => handleToggle(pkg.id, pkg.is_active)}
                      className={`px-2 py-0.5 text-xs rounded-full ${pkg.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {pkg.is_active ? '上架中' : '已下架'}
                    </button>
                  </div>
                  {pkg.description && <p className="mt-1 text-sm text-gray-500">{pkg.description}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    {pkg._plan_count} 個 BC 商品 · 被 {pkg._product_count} 個方案使用
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/packages/${pkg.id}`}
                    className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100">
                    管理內容
                  </Link>
                  <button onClick={() => handleDelete(pkg.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
