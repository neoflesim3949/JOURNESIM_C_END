'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Minus, Plus, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { formatCapacity } from '@/lib/format'
import { useCart } from '@/lib/cart'
import { trackAddToCart } from '@/components/tracking/analytics'

interface CopyPrice {
  copies: string; sell_price: number
}

interface PlanData {
  plan_id: string; bc_sku_id: string; bc_name: string
  display_name: string | null; sort_order: number
  plan_category: 'daily' | 'fixed'; plan_type: string | null
  days: number | null; capacity: string | null; high_flow_size: string | null
  limit_flow_speed: string | null; copy_prices: CopyPrice[]
}

interface ProductData {
  id: string; name: string; description: string | null
  country_code: string; country_name: string; product_type: string
  country_flag: string | null
}

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>}>
      <ProductDetailContent />
    </Suspense>
  )
}

function ProductDetailContent() {
  const { countryCode, productId: packageId } = useParams() as { countryCode: string; productId: string }

  const router = useRouter()
  const { addItem } = useCart()
  const [product, setProduct] = useState<ProductData | null>(null)
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(true)
  const [addedToCart, setAddedToCart] = useState(false)

  // UI State
  const [activeTab, setActiveTab] = useState<'daily' | 'fixed'>('daily')
  const [selectedSpeed, setSelectedSpeed] = useState('')
  const [selectedDays, setSelectedDays] = useState('')
  const [selectedFixedPlan, setSelectedFixedPlan] = useState('')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/shop/product?id=${packageId}&country=${countryCode}`)
      if (res.ok) {
        const data = await res.json()
        setProduct(data.package)
        setPlans(data.plans || [])

        // 自動選第一個 tab
        const daily = (data.plans || []).filter((p: PlanData) => p.plan_category === 'daily')
        const fixed = (data.plans || []).filter((p: PlanData) => p.plan_category === 'fixed')
        if (daily.length > 0) {
          setActiveTab('daily')
        } else if (fixed.length > 0) {
          setActiveTab('fixed')
        }
      }
      setLoading(false)
    }
    load()
  }, [packageId])

  // 日費套餐：按速度分組
  const dailyPlans = useMemo(() => plans.filter((p) => p.plan_category === 'daily'), [plans])
  const fixedPlans = useMemo(() => plans.filter((p) => p.plan_category === 'fixed'), [plans])

  // 每個 SKU 是獨立方案選項，用 display_name 或 speed 顯示
  const dailyPlanOptions = useMemo(() => {
    return dailyPlans.map((p) => {
      const speed = formatCapacity(p.high_flow_size ?? p.capacity, true)
      return {
        key: p.plan_id,
        label: p.display_name || speed,
        sortOrder: p.sort_order || 0,
        rawSize: parseFloat(p.high_flow_size ?? p.capacity ?? '0'),
        plan: p,
      }
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.rawSize - b.rawSize)
  }, [dailyPlans])

  const speedOptions = useMemo(() => dailyPlanOptions.map((o) => o.key), [dailyPlanOptions])

  // 自動選第一個速度
  useEffect(() => {
    if (speedOptions.length > 0 && !selectedSpeed) {
      setSelectedSpeed(speedOptions[0])
    }
  }, [speedOptions, selectedSpeed])

  // 當前選中的方案
  const currentPlanOption = useMemo(() => {
    return dailyPlanOptions.find((o) => o.key === selectedSpeed) || null
  }, [dailyPlanOptions, selectedSpeed])

  // 天數選項（從選中方案的 copies 計算）
  const daysOptions = useMemo(() => {
    if (!currentPlanOption) return []
    const plan = currentPlanOption.plan
    const unitDays = plan.days ?? 1
    return plan.copy_prices
      .filter((cp) => cp.sell_price > 0)
      .map((cp) => ({
        days: unitDays * parseInt(cp.copies),
        copies: cp.copies,
        sell_price: cp.sell_price,
        bc_sku_id: plan.bc_sku_id,
        plan_id: plan.plan_id,
      }))
      .sort((a, b) => a.days - b.days)
  }, [currentPlanOption])

  // 自動選第一個天數
  useEffect(() => {
    if (daysOptions.length > 0 && !selectedDays) {
      setSelectedDays(String(daysOptions[0].days))
    }
  }, [daysOptions, selectedDays])

  // 當前選擇的日費價格
  const selectedDayOption = daysOptions.find((d) => String(d.days) === selectedDays)
  const dailyTotalPrice = selectedDayOption ? selectedDayOption.sell_price * quantity : 0

  // 固定套餐：按容量分組
  const fixedGroups = useMemo(() => {
    const groups = new Map<string, { key: string; capacity: string; label: string; rawSize: number; sortOrder: number; plan_id: string; bc_sku_id: string; days: { day: number; sell_price: number; copies: string }[] }>()
    for (const plan of fixedPlans) {
      const raw = formatCapacity(plan.high_flow_size ?? plan.capacity, false)
      const capacity = raw === '不限量' ? raw : `總量${raw}`
      const rawSize = parseFloat(plan.high_flow_size ?? plan.capacity ?? '0')
      const unitDays = plan.days ?? 1
      if (!groups.has(plan.plan_id)) groups.set(plan.plan_id, { key: plan.plan_id, capacity, label: plan.display_name || capacity, rawSize, sortOrder: plan.sort_order || 0, plan_id: plan.plan_id, bc_sku_id: plan.bc_sku_id, days: [] })
      for (const cp of plan.copy_prices) {
        if (cp.sell_price <= 0) continue
        groups.get(plan.plan_id)!.days.push({ day: unitDays * parseInt(cp.copies), sell_price: cp.sell_price, copies: cp.copies })
      }
    }
    return Array.from(groups.values())
      .filter((g) => g.days.length > 0)
      .map((g) => ({ ...g, days: g.days.sort((a, b) => a.day - b.day) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.rawSize - b.rawSize)
  }, [fixedPlans])

  // 自動選第一個固定方案
  useEffect(() => {
    if (fixedGroups.length > 0 && !selectedFixedPlan) {
      setSelectedFixedPlan(fixedGroups[0].key)
    }
  }, [fixedGroups, selectedFixedPlan])

  const currentFixedGroup = fixedGroups.find((g) => g.key === selectedFixedPlan)

  // 固定套餐天數選項
  const fixedDaysOptions = currentFixedGroup?.days || []

  // 自動選第一個天數
  const [selectedFixedDay, setSelectedFixedDay] = useState('')
  useEffect(() => {
    if (fixedDaysOptions.length > 0 && !selectedFixedDay) {
      setSelectedFixedDay(String(fixedDaysOptions[0].day))
    }
  }, [fixedDaysOptions, selectedFixedDay])

  const selectedFixedDayOption = fixedDaysOptions.find((d) => String(d.day) === selectedFixedDay)
  const fixedTotalPrice = selectedFixedDayOption ? selectedFixedDayOption.sell_price * quantity : 0

  const totalPrice = activeTab === 'daily' ? dailyTotalPrice : fixedTotalPrice
  const hasDailyPlans = dailyPlans.length > 0
  const hasFixedPlans = fixedPlans.length > 0

  function handleAddToCart() {
    if (!product) return
    const pType = product.product_type === 'sim' ? 'sim' as const : 'esim' as const
    if (activeTab === 'daily' && currentPlanOption && selectedDayOption) {
      addItem({
        packageId, packageName: product.name,
        planId: selectedDayOption.plan_id,
        bcSkuId: selectedDayOption.bc_sku_id,
        bcSkuName: currentPlanOption.label,
        displayName: `${currentPlanOption.label} · ${selectedDayOption.days}天`,
        copies: selectedDayOption.copies,
        days: selectedDayOption.days,
        planCategory: 'daily', productType: pType,
        unitPrice: selectedDayOption.sell_price,
        countryCode, countryName: product.country_name || '',
      }, quantity)
    } else if (activeTab === 'fixed' && currentFixedGroup && selectedFixedDayOption) {
      addItem({
        packageId, packageName: product.name,
        planId: currentFixedGroup.plan_id,
        bcSkuId: currentFixedGroup.bc_sku_id,
        bcSkuName: currentFixedGroup.label,
        displayName: `${currentFixedGroup.label} · ${selectedFixedDayOption.day}天`,
        copies: selectedFixedDayOption.copies,
        days: selectedFixedDayOption.day,
        planCategory: 'fixed', productType: pType,
        unitPrice: selectedFixedDayOption.sell_price,
        countryCode, countryName: product.country_name || '',
      }, quantity)
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">找不到商品</h1>
        <Link href="/shop" className="mt-4 inline-block text-primary hover:underline">&larr; 返回</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href={`/shop/${countryCode}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回 {product.country_name}
      </Link>

      <div className="mt-6 flex flex-col md:flex-row gap-8">
        {/* Left: Image placeholder */}
        <div className="md:w-[360px] flex-shrink-0">
          <div className="aspect-square bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl flex items-center justify-center">
            {product.country_flag ? (
              <Image src={product.country_flag} alt={product.country_name} width={120} height={90} className="rounded-lg shadow-lg" />
            ) : (
              <div className="text-6xl font-bold text-blue-200">{product.country_name.charAt(0)}</div>
            )}
          </div>
        </div>

        {/* Right: Product info */}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {product.description && <p className="mt-2 text-muted-foreground">{product.description}</p>}

          {/* Tabs — 日費套餐 / 固定套餐 */}
          <div className="mt-6 flex rounded-xl overflow-hidden border border-border">
            <button
              onClick={() => { setActiveTab('daily'); setSelectedDays(''); setQuantity(1) }}
              className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${activeTab === 'daily' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}
            >
              日費套餐
            </button>
            <button
              onClick={() => { setActiveTab('fixed'); setSelectedFixedPlan(''); setQuantity(1) }}
              className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${activeTab === 'fixed' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}
            >
              固定套餐
            </button>
          </div>

          {/* Daily Plan UI */}
          {activeTab === 'daily' && (
            hasDailyPlans ? (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-sm font-medium">選擇方案</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dailyPlanOptions.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => { setSelectedSpeed(opt.key); setSelectedDays('') }}
                        className={`px-4 py-2.5 border rounded-xl text-sm font-medium transition-all ${
                          selectedSpeed === opt.key ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">選擇天數</label>
                    <select
                      value={selectedDays}
                      onChange={(e) => setSelectedDays(e.target.value)}
                      className="mt-2 w-full px-4 py-3 border border-border rounded-xl text-sm bg-white cursor-pointer"
                    >
                      {daysOptions.map((opt) => (
                        <option key={opt.days} value={String(opt.days)}>{opt.days} 天</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">數量</label>
                    <div className="mt-2 flex items-center border border-border rounded-xl">
                      <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-3 py-3 hover:bg-muted transition-colors rounded-l-xl">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="flex-1 text-center text-sm font-medium">{quantity}</span>
                      <button onClick={() => setQuantity(quantity + 1)} className="px-3 py-3 hover:bg-muted transition-colors rounded-r-xl">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 py-8 text-center text-muted-foreground text-sm">此套餐無日費方案</div>
            )
          )}

          {/* Fixed Plan UI */}
          {activeTab === 'fixed' && (
            hasFixedPlans ? (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-sm font-medium">選擇方案</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fixedGroups.map((g) => (
                      <button key={g.key}
                        onClick={() => { setSelectedFixedPlan(g.key); setSelectedFixedDay('') }}
                        className={`px-4 py-2.5 border rounded-xl text-sm font-medium transition-all ${
                          selectedFixedPlan === g.key ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50'
                        }`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">選擇天數</label>
                    <select value={selectedFixedDay}
                      onChange={(e) => setSelectedFixedDay(e.target.value)}
                      className="mt-2 w-full px-4 py-3 border border-border rounded-xl text-sm bg-white cursor-pointer">
                      {fixedDaysOptions.map((d) => (
                        <option key={d.day} value={String(d.day)}>{d.day} 天</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">數量</label>
                    <div className="mt-2 flex items-center border border-border rounded-xl">
                      <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-3 py-3 hover:bg-muted transition-colors rounded-l-xl">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="flex-1 text-center text-sm font-medium">{quantity}</span>
                      <button onClick={() => setQuantity(quantity + 1)} className="px-3 py-3 hover:bg-muted transition-colors rounded-r-xl">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 py-8 text-center text-muted-foreground text-sm">此套餐無固定方案</div>
            )
          )}

          {/* Total + Actions */}
          <div className="mt-6 p-5 bg-muted rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">總計</div>
                <div className="text-3xl font-bold text-primary">{formatPrice(totalPrice)}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (totalPrice <= 0 || !product) return
                  handleAddToCart()
                  trackAddToCart({ name: product.name, price: totalPrice / quantity, quantity })
                  setAddedToCart(true)
                  setTimeout(() => setAddedToCart(false), 2000)
                }}
                disabled={totalPrice <= 0}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-primary font-semibold rounded-lg transition-colors ${
                  addedToCart ? 'bg-green-500 border-green-500 text-white' : 'text-primary hover:bg-primary/5'
                } ${totalPrice <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {addedToCart ? <><Check className="w-5 h-5" /> 已加入</> : <><ShoppingCart className="w-5 h-5" /> 加入購物車</>}
              </button>
              <button
                onClick={() => {
                  if (totalPrice <= 0 || !product) return
                  handleAddToCart()
                  router.push('/cart')
                }}
                disabled={totalPrice <= 0}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors ${totalPrice <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ShoppingBag className="w-5 h-5" /> 立即購買
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
