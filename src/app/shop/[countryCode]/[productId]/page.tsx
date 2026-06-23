'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Minus, Plus, ShoppingBag, ShoppingCart, Check, Zap, Wifi, Headphones, Globe, ShieldCheck, Smartphone, ChevronDown, QrCode, CreditCard, Signal } from 'lucide-react'
import { useCurrency } from '@/lib/currency'
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
  operators?: string[] | null; apns?: string[] | null; countries?: string[] | null
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
  const { format, currency } = useCurrency()
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
  const [openFaq, setOpenFaq] = useState<number | null>(0)

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

  const isEsim = product.product_type !== 'sim'
  const faqs = isEsim ? [
    { q: '什麼是 eSIM？', a: 'eSIM 是內建於手機的虛擬 SIM 卡，免插實體卡，掃描我們提供的 QR Code 即可安裝使用。' },
    { q: '我的手機支援 eSIM 嗎？', a: '多數近年的 iPhone、Google Pixel、三星旗艦等機型支援 eSIM。建議於手機設定中確認，或聯繫客服協助確認。' },
    { q: '何時安裝、何時生效？', a: '建議出發前先完成安裝；抵達當地開啟「數據漫遊」即可連線。流量與天數自首次連線啟用後開始計算。' },
    { q: '可以分享個人熱點嗎？', a: '一般支援個人熱點分享，實際依方案與當地電信商規範為準。' },
    { q: '用完可以加購嗎？', a: '可隨時再購買新方案。eSIM 一經安裝啟用後屬一次性數位商品，不適用退款。' },
  ] : [
    { q: '如何使用實體 SIM 卡？', a: '收到卡片後插入手機，開啟「數據漫遊」即可使用。' },
    { q: '卡片何時寄出？', a: '訂單成立後依物流時程寄送，請預留收件時間，建議提前下單。' },
    { q: '流量何時開始計算？', a: '自首次連線啟用後，依方案天數開始計算。' },
    { q: '可以分享個人熱點嗎？', a: '一般支援個人熱點分享，實際依方案與當地電信商規範為準。' },
  ]

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
                <div className="text-3xl font-bold text-primary">{format(totalPrice)}</div>
                {currency !== 'TWD' && <div className="text-xs text-muted-foreground mt-0.5">結帳以新台幣計價 NT$ {totalPrice.toLocaleString()}</div>}
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

      {/* ===== 商品介紹區 ===== */}
      <div className="mt-14 space-y-12">
        {/* 優勢 */}
        <section>
          <h2 className="text-xl font-bold text-center">為什麼選擇 FLESIM</h2>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: Zap, title: '即時開通', desc: '付款後立即取得，免等待寄送。' },
              { icon: Signal, title: '高速網路', desc: '當地電信商 4G/5G 高速連線。' },
              { icon: isEsim ? QrCode : CreditCard, title: isEsim ? '掃碼即用' : '隨插即用', desc: isEsim ? '掃描 QR Code 安裝，免換實體卡。' : '插入手機即可使用，操作簡單。' },
              { icon: Globe, title: '無漫遊費', desc: '透明定價，無隱藏費用與帳單驚喜。' },
              { icon: ShieldCheck, title: '安全付款', desc: '支援多種安全的付款方式。' },
              { icon: Headphones, title: '客服支援', desc: '購買與使用問題隨時為您協助。' },
            ].map((f) => (
              <div key={f.title} className="bg-white border border-border rounded-2xl p-5 hover:shadow-sm transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 方案重點 / 規格 */}
        <section>
          <h2 className="text-xl font-bold">方案重點</h2>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '商品類型', value: isEsim ? 'eSIM' : '實體 SIM 卡' },
              { label: '適用地區', value: product.country_name || '—' },
              { label: '方案型態', value: [hasDailyPlans && '日費', hasFixedPlans && '總量'].filter(Boolean).join(' / ') || '—' },
              { label: '開通方式', value: isEsim ? '掃碼安裝' : '插卡即用' },
            ].map((s) => (
              <div key={s.label} className="bg-muted/50 rounded-xl p-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="mt-1 font-semibold">{s.value}</div>
              </div>
            ))}
          </div>
          {(product.operators?.length || product.apns?.length) ? (
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {product.operators?.length ? (
                <div className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Signal className="w-4 h-4 text-primary" /> 適用電信商</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {product.operators.map((op) => <span key={op} className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">{op}</span>)}
                  </div>
                </div>
              ) : null}
              {product.apns?.length ? (
                <div className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Wifi className="w-4 h-4 text-primary" /> APN 設定</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {product.apns.map((a) => <span key={a} className="px-2 py-0.5 text-xs rounded-full bg-muted font-mono">{a}</span>)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 使用步驟 */}
        <section>
          <h2 className="text-xl font-bold text-center">三步驟輕鬆上網</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-4">
            {[
              { icon: ShoppingBag, title: '1. 選擇方案', desc: '挑選數據量與天數，完成結帳。' },
              isEsim
                ? { icon: QrCode, title: '2. 掃碼安裝', desc: '掃描取得的 QR Code 安裝 eSIM。' }
                : { icon: CreditCard, title: '2. 插入卡片', desc: '收到實體 SIM 卡後插入手機。' },
              { icon: Signal, title: '3. 開始上網', desc: '開啟數據漫遊，抵達當地即可連線。' },
            ].map((s) => (
              <div key={s.title} className="bg-white border border-border rounded-2xl p-5 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <s.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-bold">常見問題</h2>
          <div className="mt-5 space-y-2">
            {faqs.map((f, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium hover:bg-muted/50">
                  {f.q}
                  <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{f.a}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* 安心保障 */}
        <section className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> 安全付款</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="w-4 h-4 text-primary" /> 即時開通</span>
          <span className="inline-flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-primary" /> 免綁約</span>
          <span className="inline-flex items-center gap-1.5"><Headphones className="w-4 h-4 text-primary" /> 客服支援</span>
        </section>
      </div>
    </div>
  )
}
