'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  ArrowLeft, Wifi, CreditCard, RefreshCw, Smartphone, Signal, 
  Calendar, Database, Search, AlertCircle, Plus, X, Trash2, 
  Zap, ChevronRight, Sparkles, CreditCard as CardIcon, ChevronDown, Package, Activity
} from 'lucide-react'

interface CardItem {
  iccid: string; type: 'esim' | 'sim'; is_manual: boolean
  product_name: string | null; display_name: string | null; nickname: string | null
  bc_sku_id: string; copies: string; days: number | null
  lpa_code: string | null; qr_code_url: string | null; status: string
}

interface UniqueCard {
  iccid: string; type: 'esim' | 'sim'; expired: boolean; is_manual: boolean; nickname: string | null
}

interface CardDetail {
  iccid: string
  is_manual: boolean
  expiry: {
    iccid: string; type: string; status: string; expirationDate: string
    postponedMonth: string; maxDelayMonth: string; usageCount: string
    supportUpgradeMultiCard?: string
  } | null
  service_status: {
    status?: string; esimStatus?: string; profileStatus?: string
    recordTime?: string; eid?: string
  } | null
  usage?: {
    orderId: string; channelOrderId: string
    subOrderList: {
      skuName: string; planStatus: string; planStartTime?: string; planEndTime?: string
      totalDays?: string; remainingDays?: string; totalTraffic?: string; remainingTraffic?: string
      highFlowSize?: string; planType?: string
    }[]
  } | null
  verify?: { iccid: string; iccidStatus?: string; iccidType?: string; rechargeableProduct?: string } | null
  recharge_products?: { iccidValidity?: string; skuId?: string[] } | null
}

export default function MyCardsPage() {
  const [cards, setCards] = useState<CardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIccid, setExpandedIccid] = useState<string | null>(null)
  
  const [detailsCache, setDetailsCache] = useState<Record<string, CardDetail>>({})
  const [loadingIccid, setLoadingIccid] = useState<string | null>(null)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addIccid, setAddIccid] = useState('')
  const [addType, setAddType] = useState<'esim' | 'sim'>('esim')
  const [addNickname, setAddNickname] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  async function loadCards() {
    const data = await fetch('/api/shop/cards?action=list').then((r) => r.json()).catch(() => [])
    setCards(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { loadCards() }, [])

  const uniqueCards: UniqueCard[] = (() => {
    const map = new Map<string, UniqueCard>()
    for (const c of cards) {
      if (!map.has(c.iccid)) {
        map.set(c.iccid, {
          iccid: c.iccid, type: c.type,
          expired: c.status === 'expired',
          is_manual: c.is_manual,
          nickname: c.nickname,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => {
        if (a.expired === b.expired) return 0;
        return a.expired ? 1 : -1;
    })
  })()

  const activeCardsCount = uniqueCards.filter(c => !c.expired).length

  async function toggleExpand(iccid: string, isManual: boolean) {
    if (expandedIccid === iccid) {
      setExpandedIccid(null)
      return
    }

    setExpandedIccid(iccid)
    
    if (!detailsCache[iccid]) {
      setLoadingIccid(iccid)
      // 同時獲取一般詳情與套餐用量 (F012)
      const [resDetail, resUsage] = await Promise.all([
        fetch(`/api/shop/cards?action=detail&iccid=${iccid}${isManual ? '&manual=1' : ''}`).then(r => r.json()).catch(() => null),
        fetch(`/api/shop/cards?action=usage&iccid=${iccid}`).then(r => r.json()).catch(() => null)
      ])
      
      const merged: CardDetail = {
          ...(resDetail || {}),
          usage: resUsage?.usage || null,
          iccid,
          is_manual: isManual
      }
      
      if (merged) {
        setDetailsCache(prev => ({ ...prev, [iccid]: merged }))
      }
      setLoadingIccid(null)
    }
  }

  async function handleAddCard() {
    if (!addIccid.trim()) { setAddError('請輸入 ICCID'); return }
    setAdding(true); setAddError('')
    const res = await fetch('/api/shop/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iccid: addIccid.trim(), card_type: addType, nickname: addNickname }),
    }).then((r) => r.json()).catch(() => ({ error: '新增失敗' }))
    setAdding(false)
    if (res.error) { setAddError(res.error); return }
    setShowAddModal(false)
    setAddIccid(''); setAddNickname(''); setAddType('esim')
    await loadCards()
  }

  async function handleRemoveManual(iccid: string) {
    if (!confirm(`確定要移除卡號 ${iccid}？`)) return
    await fetch('/api/shop/cards', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iccid }),
    })
    await loadCards()
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-32 text-center text-muted-foreground animate-pulse italic">載入卡匣中...</div>

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/account" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 group">
           <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> 
           <span className="text-sm font-medium">返回會員中心</span>
        </Link>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 text-primary text-xs font-black uppercase tracking-widest rounded-full hover:bg-primary hover:text-white transition-all active:scale-95"
        >
          <Plus className="w-3 h-3" /> 新增卡號
        </button>
      </div>

      <div className="mt-8 mb-10">
         <h1 className="text-4xl font-black tracking-tighter italic">我的卡片</h1>
         <p className="mt-2 text-sm text-muted-foreground font-medium italic">您總共有 {activeCardsCount} 張有效卡片</p>
      </div>

      <div className="space-y-6">
        {uniqueCards.map((c) => (
            <div key={c.iccid} className="space-y-4">
                <PocketCard 
                  card={c} 
                  isSelected={expandedIccid === c.iccid}
                  onToggle={() => toggleExpand(c.iccid, c.is_manual)}
                  detail={detailsCache[c.iccid]}
                />
                
                {/* Accordion Detail View */}
                {expandedIccid === c.iccid && (
                    <div className="mx-2 p-6 bg-white border border-border shadow-2xl rounded-[2.5rem] overflow-hidden animate-in slide-in-from-top-4 duration-500">
                        {loadingIccid === c.iccid ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <RefreshCw className="w-10 h-10 text-primary animate-spin mb-4" />
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest italic">正在獲取實時數據與用量分析...</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-3xl bg-orange-50/50 border border-orange-100 flex flex-col gap-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Calendar size={14} className="text-orange-600" />
                                            <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest">有效期至</span>
                                        </div>
                                        <p className="text-sm font-black text-orange-900 leading-tight">
                                            {detailsCache[c.iccid]?.expiry?.expirationDate?.split(' ')[0] || '永久有效'}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-3xl bg-blue-50/50 border border-blue-100 flex flex-col gap-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Signal size={14} className="text-blue-600" />
                                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">服務狀態</span>
                                        </div>
                                        <p className="text-sm font-black text-blue-900 leading-tight">
                                            {detailsCache[c.iccid]?.service_status?.status || detailsCache[c.iccid]?.service_status?.esimStatus || '正常'}
                                        </p>
                                    </div>
                                </div>

                                <TrafficQueryCard iccid={c.iccid} />

                                <div className="space-y-4">
                                   <div className="flex items-center gap-2 px-1">
                                      <Package size={14} className="text-muted-foreground" />
                                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">關聯訂單紀錄與即時套餐</span>
                                   </div>
                                   <div className="space-y-3">
                                      {cards.filter(o => o.iccid === c.iccid).map((order, idx) => (
                                          <OrderHistoryItem 
                                            key={idx} 
                                            order={order} 
                                            usageList={(detailsCache[c.iccid]?.usage as any)?.subOrderList || []} 
                                          />
                                      ))}
                                   </div>
                                </div>

                                {c.is_manual && (
                                    <button 
                                        onClick={() => handleRemoveManual(c.iccid)}
                                        className="w-full py-4 rounded-2xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={16} /> 將此卡從卡包移除
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        ))}
      </div>

      {/* 手動新增 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-black italic text-primary mb-8">快速收納卡片</h2>
            <div className="space-y-6">
              <div className="flex gap-2">
                <button onClick={() => setAddType('esim')} className={`flex-1 py-4 rounded-2xl border font-bold ${addType === 'esim' ? 'bg-primary text-white' : ''}`}>eSIM</button>
                <button onClick={() => setAddType('sim')} className={`flex-1 py-4 rounded-2xl border font-bold ${addType === 'sim' ? 'bg-primary text-white' : ''}`}>SIM</button>
              </div>
              <input type="text" value={addIccid} onChange={(e) => setAddIccid(e.target.value)} className="w-full p-5 bg-muted rounded-[1.25rem] text-lg font-mono outline-none" placeholder="輸入 ICCID 序號" />
              {addError && <p className="text-xs text-red-500 font-bold">{addError}</p>}
            </div>
            <div className="mt-8">
               <button onClick={handleAddCard} disabled={adding} className="w-full py-4 bg-primary text-white font-black rounded-[1.5rem] italic text-lg">{adding ? '處理中' : '確認入庫'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 📊 Order History Item with Circular Gauges
 */
function OrderHistoryItem({ order, usageList }: { order: CardItem, usageList: any[] }) {
    const [expanded, setExpanded] = useState(false)
    
    // 試圖匹配 F012 的子訂單資訊 (透過 bc_sku_id 匹配)
    const usage = usageList?.find((u: any) => u.skuId === order.bc_sku_id || u.skuName.includes(order.product_name || ''))
    
    const formatTraffic = (kb: string | undefined) => {
        if (!kb) return '0MB'
        const kbNum = parseInt(kb)
        if (kbNum >= 1024 * 1024) return `${(kbNum / 1024 / 1024).toFixed(1)}GB`
        return `${(kbNum / 1024).toFixed(0)}MB`
    }

    return (
        <div className="bg-gray-50 rounded-[2rem] border border-gray-100 overflow-hidden group hover:border-primary/20 transition-all">
            <div className="p-5 flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-4">
                    <p className="text-xs font-black text-gray-900 leading-tight">
                        {order.product_name || order.display_name}
                    </p>
                    <p className="mt-1 text-[9px] text-muted-foreground uppercase font-bold tracking-widest">{order.status}</p>
                </div>
                <button 
                  onClick={() => setExpanded(!expanded)}
                  className="px-4 py-2 bg-white rounded-xl border border-gray-200 text-[10px] font-black uppercase text-primary hover:bg-primary hover:text-white transition-all shadow-sm flex items-center gap-1 active:scale-95"
                >
                  詳情 {expanded ? <X size={10} /> : <ChevronRight size={10} />}
                </button>
            </div>

            {expanded && (
                <div className="px-5 pb-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="pt-4 border-t border-gray-200/50 flex justify-around gap-8">
                        {/* Gauge 1: Days */}
                        <div className="text-center space-y-4">
                            <UsageCircle 
                                percent={usage ? (parseInt(usage.remainingDays || '0') / parseInt(usage.totalDays || '1')) * 100 : 0} 
                                color="#f97316"
                                subLabel="天數預估"
                            />
                            <div>
                                <p className="text-sm font-black text-orange-600">
                                    {usage?.remainingDays || '0'} <span className="opacity-50">/ {usage?.totalDays || '0'}</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground uppercase font-black tracking-widest mt-1">剩餘天數</p>
                            </div>
                        </div>

                        {/* Gauge 2: Traffic */}
                        <div className="text-center space-y-4">
                             <UsageCircle 
                                percent={usage ? (parseInt(usage.remainingTraffic || '0') / parseInt(usage.totalTraffic || '1')) * 100 : 0} 
                                color="#3b82f6"
                                subLabel="流量分析"
                            />
                            <div>
                                <p className="text-sm font-black text-blue-600">
                                    {formatTraffic(usage?.remainingTraffic)} <span className="opacity-50">/ {formatTraffic(usage?.totalTraffic)}</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground uppercase font-black tracking-widest mt-1">剩餘流量</p>
                            </div>
                        </div>
                    </div>
                    {usage?.planStartTime && (
                        <div className="mt-8 p-4 bg-white rounded-2xl border border-gray-100 flex justify-between items-center text-[10px] font-bold text-muted-foreground">
                            <span>啟用時間：{usage.planStartTime}</span>
                            <span>至 {usage.planEndTime || '未激活'}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * ⭕ Circular Progress SVG
 */
function UsageCircle({ percent, color, subLabel }: { percent: number, color: string, subLabel: string }) {
    const radius = 60;
    const stroke = 10;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg height={radius * 2} width={radius * 2}>
                <circle stroke="#f3f4f6" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
                <circle
                    stroke={color}
                    fill="transparent"
                    strokeWidth={stroke}
                    strokeDasharray={circumference + ' ' + circumference}
                    style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease-out' }}
                    strokeLinecap="round"
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className="text-xl font-black tracking-tighter" style={{ color }}>{Math.round(percent)}<small className="text-xs ml-0.5">%</small></span>
            </div>
        </div>
    )
}

function PocketCard({ card, isSelected, onToggle, detail }: {
  card: UniqueCard
  isSelected: boolean
  onToggle: () => void
  detail?: CardDetail
}) {
  const isRechargeable = detail?.verify?.rechargeableProduct === '1' || (detail?.recharge_products?.skuId?.length ?? 0) > 0;
  let displayName = '';
  if (card.type === 'sim') {
      displayName = isRechargeable ? 'Multi SIM｜多次充值卡' : 'Single SIM｜單次卡';
  } else {
      displayName = isRechargeable ? 'Reload eSIM｜儲值eSIM' : 'Global eSIM｜全球eSIM';
  }

  const theme = card.type === 'esim' 
    ? { bg: 'from-[#1e40af] via-[#3b82f6] to-[#60a5fa]', shadow: 'shadow-blue-500/20', icon: <Wifi className="w-5 h-5 text-white/30" /> }
    : { bg: 'from-[#064e3b] via-[#10b981] to-[#6ee7b7]', shadow: 'shadow-green-500/20', icon: <CardIcon className="w-5 h-5 text-white/30" /> };

  return (
    <button 
      onClick={onToggle}
      className={`relative w-full h-44 rounded-[2.5rem] overflow-hidden transition-all duration-500 group text-left ${isSelected ? 'shadow-2xl translate-y-[-4px]' : 'hover:scale-[1.01] shadow-lg'} ${theme.shadow} ${card.expired ? 'grayscale opacity-70' : ''}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${theme.bg}`}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 2px, transparent 2px, transparent 4px)' }} />
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/20 rounded-full blur-[100px]" />
      </div>

      <div className="relative h-full p-8 flex flex-col justify-between text-white">
        <div className="flex justify-between items-start">
            <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-80">FLESIM CARD</p>
                <h3 className="text-2xl font-black italic tracking-tighter drop-shadow-md">
                   {card.nickname || displayName}
                </h3>
            </div>
            <div className="p-3 bg-white/10 rounded-full backdrop-blur-md">
                {theme.icon}
            </div>
        </div>

        <div className="mt-auto flex items-end justify-between">
            <div>
                <p className="text-[9px] font-mono opacity-60 mb-2 uppercase tracking-[0.2em]">Card Number</p>
                <p className="font-mono text-lg font-medium tracking-[0.1em] leading-none">
                    {card.iccid}
                </p>
            </div>
            <div className={`p-2 transition-transform duration-500 ${isSelected ? 'rotate-180 bg-white/20' : 'bg-white/10'} rounded-full`}>
                <ChevronDown size={18} />
            </div>
        </div>
      </div>
    </button>
  )
}

function TrafficQueryCard({ iccid }: { iccid: string }) {
  const [beginDate, setBeginDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [traffic, setTraffic] = useState<{ usedDate: string; country: string; usedAmountKB: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [queried, setQueried] = useState(false)

  async function query() {
    setLoading(true)
    const res = await fetch(`/api/shop/cards?action=traffic&iccid=${iccid}&beginDate=${beginDate}&endDate=${endDate}`).then((r) => r.json()).catch(() => ({ traffic: [] }))
    setTraffic(res.traffic || [])
    setQueried(true)
    setLoading(false)
  }

  function formatKB(kb: number): string {
    if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)}GB`
    if (kb >= 1024) return `${(kb / 1024).toFixed(0)}MB`
    return `${kb}KB`
  }

  const countryStats = (() => {
    const map = new Map<string, number>()
    let total = 0
    for (const t of traffic) {
      map.set(t.country, (map.get(t.country) || 0) + t.usedAmountKB)
      total += t.usedAmountKB
    }
    return { countries: Array.from(map.entries()).sort((a, b) => b[1] - a[1]), totalKB: total }
  })()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity size={14} className="text-purple-500" /> 流量查詢
        </h4>
      </div>

      <div className="flex gap-2 p-1.5 bg-muted rounded-2xl">
        <input type="date" value={beginDate} onChange={(e) => setBeginDate(e.target.value)} className="flex-1 px-3 py-2 bg-white rounded-xl text-[10px] font-bold outline-none" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1 px-3 py-2 bg-white rounded-xl text-[10px] font-bold outline-none" />
        <button onClick={query} disabled={loading} className="p-3 bg-primary text-white rounded-xl active:scale-95 transition-all"><Search size={14} /></button>
      </div>

      {queried && countryStats.countries.length > 0 && (
        <div className="p-5 bg-muted/40 rounded-[2rem] border border-border/50">
          <div className="flex justify-between items-center mb-4">
              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Consumption Totals</span>
              <span className="text-sm font-black text-primary">{formatKB(countryStats.totalKB)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {countryStats.countries.map(([c, v]) => (
                <div key={c} className="p-3 bg-white rounded-2xl border border-gray-100 text-center">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase">{c}</p>
                    <p className="text-xs font-black text-blue-600 mt-0.5">{formatKB(v)}</p>
                </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
