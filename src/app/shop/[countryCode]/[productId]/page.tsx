'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { formatCapacity } from '@/lib/format'

interface CopyPrice {
  copies: string; sell_price: number
}

interface PlanData {
  plan_id: string; bc_sku_id: string; bc_name: string
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
  const { countryCode, productId } = useParams() as { countryCode: string; productId: string }

  const [product, setProduct] = useState<ProductData | null>(null)
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(true)

  // UI State
  const [activeTab, setActiveTab] = useState<'daily' | 'fixed'>('daily')
  const [selectedSpeed, setSelectedSpeed] = useState('')
  const [selectedDays, setSelectedDays] = useState('')
  const [selectedFixedPlan, setSelectedFixedPlan] = useState('')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/shop/product?id=${productId}`)
      if (res.ok) {
        const data = await res.json()
        setProduct(data.product)
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
  }, [productId])

  // 日費套餐：按速度分組
  const dailyPlans = useMemo(() => plans.filter((p) => p.plan_category === 'daily'), [plans])
  const fixedPlans = useMemo(() => plans.filter((p) => p.plan_category === 'fixed'), [plans])

  const speedGroups = useMemo(() => {
    const map = new Map<string, PlanData[]>()
    for (const p of dailyPlans) {
      const speed = formatCapacity(p.high_flow_size ?? p.capacity, true)
      if (!map.has(speed)) map.set(speed, [])
      map.get(speed)!.push(p)
    }
    return map
  }, [dailyPlans])

  const speedOptions = useMemo(() => Array.from(speedGroups.keys()), [speedGroups])

  // 自動選第一個速度
  useEffect(() => {
    if (speedOptions.length > 0 && !selectedSpeed) {
      setSelectedSpeed(speedOptions[0])
    }
  }, [speedOptions, selectedSpeed])

  // 當前速度下可選的天數
  const currentSpeedPlans = useMemo(() => {
    return speedGroups.get(selectedSpeed) || []
  }, [speedGroups, selectedSpeed])

  // 合併所有 copies 選項
  const daysOptions = useMemo(() => {
    const allCopies = new Map<string, { copies: string; sell_price: number; bc_sku_id: string; plan_id: string }>()
    for (const plan of currentSpeedPlans) {
      const unitDays = plan.days ?? 1
      for (const cp of plan.copy_prices) {
        if (cp.sell_price <= 0) continue
        const actualDays = unitDays * parseInt(cp.copies)
        const key = String(actualDays)
        // 取最低價
        if (!allCopies.has(key) || cp.sell_price < allCopies.get(key)!.sell_price) {
          allCopies.set(key, { copies: cp.copies, sell_price: cp.sell_price, bc_sku_id: plan.bc_sku_id, plan_id: plan.plan_id })
        }
      }
    }
    return Array.from(allCopies.entries())
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([days, data]) => ({ days: parseInt(days), ...data }))
  }, [currentSpeedPlans])

  // 自動選第一個天數
  useEffect(() => {
    if (daysOptions.length > 0 && !selectedDays) {
      setSelectedDays(String(daysOptions[0].days))
    }
  }, [daysOptions, selectedDays])

  // 當前選擇的日費價格
  const selectedDayOption = daysOptions.find((d) => String(d.days) === selectedDays)
  const dailyTotalPrice = selectedDayOption ? selectedDayOption.sell_price * quantity : 0

  // 固定套餐選項
  const fixedOptions = useMemo(() => {
    const options: { plan_id: string; bc_sku_id: string; bc_name: string; capacity: string; days: number; sell_price: number; copies: string }[] = []
    for (const plan of fixedPlans) {
      const unitDays = plan.days ?? 1
      for (const cp of plan.copy_prices) {
        if (cp.sell_price <= 0) continue
        options.push({
          plan_id: plan.plan_id,
          bc_sku_id: plan.bc_sku_id,
          bc_name: plan.bc_name,
          capacity: formatCapacity(plan.high_flow_size ?? plan.capacity, false),
          days: unitDays * parseInt(cp.copies),
          sell_price: cp.sell_price,
          copies: cp.copies,
        })
      }
    }
    return options.sort((a, b) => a.sell_price - b.sell_price)
  }, [fixedPlans])

  // 自動選第一個固定套餐
  useEffect(() => {
    if (fixedOptions.length > 0 && !selectedFixedPlan) {
      setSelectedFixedPlan(`${fixedOptions[0].plan_id}_${fixedOptions[0].copies}`)
    }
  }, [fixedOptions, selectedFixedPlan])

  const selectedFixed = fixedOptions.find((f) => `${f.plan_id}_${f.copies}` === selectedFixedPlan)
  const fixedTotalPrice = selectedFixed ? selectedFixed.sell_price * quantity : 0

  const totalPrice = activeTab === 'daily' ? dailyTotalPrice : fixedTotalPrice
  const hasDailyPlans = dailyPlans.length > 0
  const hasFixedPlans = fixedPlans.length > 0

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

          {/* Tabs */}
          {hasDailyPlans && hasFixedPlans && (
            <div className="mt-6 flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => { setActiveTab('daily'); setQuantity(1) }}
                className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${activeTab === 'daily' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}
              >
                日費套餐
              </button>
              <button
                onClick={() => { setActiveTab('fixed'); setQuantity(1) }}
                className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${activeTab === 'fixed' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'}`}
              >
                固定套餐
              </button>
            </div>
          )}

          {/* Daily Plan UI */}
          {activeTab === 'daily' && hasDailyPlans && (
            <div className="mt-6 space-y-5">
              {/* Select Speed */}
              <div>
                <label className="text-sm font-medium">選擇手機套餐</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {speedOptions.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => { setSelectedSpeed(speed); setSelectedDays('') }}
                      className={`px-4 py-2.5 border rounded-lg text-sm font-medium transition-all ${
                        selectedSpeed === speed ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {speed}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select Days */}
              <div>
                <label className="text-sm font-medium">選擇天數</label>
                <div className="mt-2 grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {daysOptions.map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => setSelectedDays(String(opt.days))}
                      className={`px-3 py-2 border rounded-lg text-center transition-all ${
                        selectedDays === String(opt.days) ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.days}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Fixed Plan UI */}
          {activeTab === 'fixed' && hasFixedPlans && (
            <div className="mt-6">
              <label className="text-sm font-medium">選擇手機套餐</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {fixedOptions.map((opt) => {
                  const key = `${opt.plan_id}_${opt.copies}`
                  const isSelected = selectedFixedPlan === key
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedFixedPlan(key)}
                      className={`p-4 border rounded-xl text-left transition-all ${
                        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{opt.capacity}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{opt.days} 天</div>
                        </div>
                        <div className="font-semibold text-primary">{formatPrice(opt.sell_price)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="mt-5">
            <label className="text-sm font-medium">數量</label>
            <div className="mt-2 inline-flex items-center border border-border rounded-lg">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2.5 hover:bg-muted transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-5 font-medium text-center min-w-[40px]">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="p-2.5 hover:bg-muted transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Total + Buy */}
          <div className="mt-6 p-5 bg-muted rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">總計</div>
                <div className="text-3xl font-bold text-primary">{formatPrice(totalPrice)}</div>
              </div>
              <Link
                href={`/checkout?product=${productId}&planId=${activeTab === 'daily' ? selectedDayOption?.plan_id : selectedFixed?.plan_id}&copies=${activeTab === 'daily' ? selectedDayOption?.copies : selectedFixed?.copies}&qty=${quantity}&price=${totalPrice}`}
                className={`inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors ${totalPrice <= 0 ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <ShoppingBag className="w-5 h-5" />
                立即購買
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
