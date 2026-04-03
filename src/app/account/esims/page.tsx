'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Wifi, CreditCard, RefreshCw, Smartphone, Signal, Calendar, Database, Search, AlertCircle, Plus, X, Trash2, Zap } from 'lucide-react'

interface CardItem {
  iccid: string; type: 'esim' | 'sim'; is_manual: boolean
  product_name: string | null; display_name: string | null; nickname: string | null
  bc_sku_id: string; copies: string; days: number | null
  lpa_code: string | null; qr_code_url: string | null; status: string
}

interface UniqueCard {
  iccid: string; type: 'esim' | 'sim'; expired: boolean; is_manual: boolean; nickname: string | null
}

interface TodayTrafficItem {
  usedDate: string; type: string; usedAmount: string; country: string
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
  today_traffic?: TodayTrafficItem[]
  // 訂單卡才有
  usage?: {
    orderId: string; channelOrderId: string
    subOrderList: {
      skuName: string; planStatus: string; planStartTime?: string; planEndTime?: string
      totalDays?: string; remainingDays?: string; totalTraffic?: string; remainingTraffic?: string
      highFlowSize?: string; planType?: string
      usageInfoList?: { useDate: string; useageAmt: string }[]
    }[]
  } | null
  traffic?: { usedDate: string; type: string; usedAmount: string; country: string }[]
  verify?: { iccid: string; iccidStatus?: string; iccidType?: string; rechargeableProduct?: string } | null
  real_name?: { iccid: string; realNameStatus?: string; realNameType?: string } | null
  recharge_products?: { iccidValidity?: string; skuId?: string[] } | null
}

export default function MyCardsPage() {
  const [cards, setCards] = useState<CardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIccid, setSelectedIccid] = useState<string | null>(null)
  const [selectedCardType, setSelectedCardType] = useState<'esim' | 'sim' | null>(null)
  const [selectedIsManual, setSelectedIsManual] = useState(false)
  const [detail, setDetail] = useState<CardDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 手動新增
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

  // 去重：同一張 ICCID 只顯示一次
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
    return Array.from(map.values())
  })()

  const esimCards = uniqueCards.filter((c) => c.type === 'esim' && !c.expired)
  const simCards = uniqueCards.filter((c) => c.type === 'sim' && !c.expired)
  const expiredCards = uniqueCards.filter((c) => c.expired)

  const iccidOrders = selectedIccid ? cards.filter((c) => c.iccid === selectedIccid) : []

  async function selectCard(iccid: string, type: 'esim' | 'sim', isManual: boolean) {
    setSelectedIccid(iccid)
    setSelectedCardType(type)
    setSelectedIsManual(isManual)
    setDetail(null)
    setLoadingDetail(true)
    const url = `/api/shop/cards?action=detail&iccid=${iccid}${isManual ? '&manual=1' : ''}`
    const res = await fetch(url).then((r) => r.json()).catch(() => null)
    setDetail(res)
    setLoadingDetail(false)
  }

  async function handleAddCard() {
    if (!addIccid.trim()) { setAddError('請輸入 ICCID'); return }
    if (addIccid.trim().length < 10) { setAddError('ICCID 格式不正確'); return }
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
    if (selectedIccid === iccid) { setSelectedIccid(null); setDetail(null) }
    await loadCards()
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回會員中心
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="mt-4 text-2xl font-bold">我的卡片</h1>
          <p className="mt-1 text-muted-foreground">查看所有已購買的 eSIM 和 SIM 卡</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> 手動新增卡號
        </button>
      </div>

      {uniqueCards.length === 0 ? (
        <div className="mt-12 text-center py-16">
          <Smartphone className="mx-auto w-16 h-16 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">尚無卡片</p>
          <p className="mt-1 text-muted-foreground">購買後將在此顯示，或點右上角手動新增</p>
          <Link href="/shop" className="mt-6 inline-block px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover">前往選購</Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col lg:flex-row gap-6">
          {/* 左側：卡片列表 */}
          <div className="lg:w-72 flex-shrink-0 space-y-4">
            {/* eSIM */}
            {esimCards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Wifi className="w-4 h-4 text-blue-500" /> eSIM（{esimCards.length}）
                </div>
                <div className="space-y-1">
                  {esimCards.map((c) => (
                    <CardListItem key={c.iccid} card={c}
                      isSelected={selectedIccid === c.iccid}
                      onSelect={() => selectCard(c.iccid, 'esim', c.is_manual)}
                      onRemove={c.is_manual ? () => handleRemoveManual(c.iccid) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SIM */}
            {simCards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <CreditCard className="w-4 h-4 text-green-500" /> SIM 卡（{simCards.length}）
                </div>
                <div className="space-y-1">
                  {simCards.map((c) => (
                    <CardListItem key={c.iccid} card={c}
                      isSelected={selectedIccid === c.iccid}
                      onSelect={() => selectCard(c.iccid, 'sim', c.is_manual)}
                      onRemove={c.is_manual ? () => handleRemoveManual(c.iccid) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 失效卡 */}
            {expiredCards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <AlertCircle className="w-4 h-4 text-gray-400" /> 失效卡（{expiredCards.length}）
                </div>
                <div className="space-y-1">
                  {expiredCards.map((c) => (
                    <div key={c.iccid} className="px-3 py-2 rounded-lg text-xs font-mono text-gray-400 bg-gray-50 border border-gray-100">
                      {c.iccid}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右側：卡片詳情 */}
          <div className="flex-1 min-w-0">
            {!selectedIccid ? (
              <div className="text-center py-16 bg-muted rounded-xl">
                <Signal className="mx-auto w-12 h-12 text-muted-foreground/30" />
                <p className="mt-4 text-muted-foreground">選擇一張卡片查看詳情</p>
              </div>
            ) : loadingDetail ? (
              <div className="text-center py-16">
                <RefreshCw className="mx-auto w-8 h-8 text-primary animate-spin" />
                <p className="mt-4 text-muted-foreground">查詢中...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 卡片基本資訊 */}
                <div className="bg-white border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-mono text-muted-foreground">ICCID: {selectedIccid}</div>
                    {selectedIsManual && (
                      <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-600 rounded-full">手動新增</span>
                    )}
                  </div>
                </div>

                {/* 卡片有效期 F010 */}
                {detail?.expiry && (
                  <div className="bg-white border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Calendar className="w-4 h-4 text-orange-500" /> 卡片有效期
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">到期日：</span>{detail.expiry.expirationDate || '-'}</div>
                      <div><span className="text-muted-foreground">狀態：</span>{detail.expiry.status || '-'}</div>
                      <div><span className="text-muted-foreground">類型：</span>{detail.expiry.type || '-'}</div>
                      <div><span className="text-muted-foreground">已延期月數：</span>{detail.expiry.postponedMonth || '0'}</div>
                      <div><span className="text-muted-foreground">最大可延期：</span>{detail.expiry.maxDelayMonth || '-'} 月</div>
                      <div><span className="text-muted-foreground">使用次數：</span>{detail.expiry.usageCount || '-'}</div>
                      {detail.expiry.supportUpgradeMultiCard && (
                        <div><span className="text-muted-foreground">多卡升級：</span>{detail.expiry.supportUpgradeMultiCard === '1' ? '支持' : '不支持'}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* eSIM 服務狀態 F042 — 僅 eSIM 卡顯示 */}
                {selectedCardType === 'esim' && detail?.service_status && (
                  <div className="bg-white border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Signal className="w-4 h-4 text-blue-500" /> eSIM 服務狀態
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">狀態：</span>{detail.service_status.status || detail.service_status.esimStatus || '-'}</div>
                      <div><span className="text-muted-foreground">Profile：</span>{detail.service_status.profileStatus || '-'}</div>
                      {detail.service_status.eid && <div><span className="text-muted-foreground">EID：</span><span className="font-mono text-xs">{detail.service_status.eid}</span></div>}
                      {detail.service_status.recordTime && <div><span className="text-muted-foreground">記錄時間：</span>{detail.service_status.recordTime}</div>}
                    </div>
                  </div>
                )}

                {/* 流量查詢 F023 */}
                <TrafficQueryCard iccid={selectedIccid} />

                {/* 以下僅訂單卡片顯示 */}
                {!selectedIsManual && (
                  <>
                    {/* ICCID 資訊 F013 */}
                    {detail?.verify && (
                      <div className="bg-white border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Smartphone className="w-4 h-4 text-gray-500" /> ICCID 資訊
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="text-muted-foreground">狀態：</span>{detail.verify.iccidStatus || '-'}</div>
                          <div><span className="text-muted-foreground">類型：</span>{detail.verify.iccidType || '-'}</div>
                          <div><span className="text-muted-foreground">可複充：</span>{detail.verify.rechargeableProduct === '1' ? '是' : '否'}</div>
                        </div>
                      </div>
                    )}

                    {/* 實名認證 F054 */}
                    {detail?.real_name && (
                      <div className="bg-white border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 text-sm font-medium mb-3">
                          <CreditCard className="w-4 h-4 text-red-500" /> 實名認證
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="text-muted-foreground">狀態：</span>{detail.real_name.realNameStatus || '-'}</div>
                          <div><span className="text-muted-foreground">類型：</span>{detail.real_name.realNameType || '-'}</div>
                        </div>
                      </div>
                    )}

                    {/* 可充值商品 F052 */}
                    {detail?.recharge_products?.skuId && detail.recharge_products.skuId.length > 0 && (
                      <div className="bg-white border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 text-sm font-medium mb-3">
                          <RefreshCw className="w-4 h-4 text-orange-500" /> 可充值方案
                        </div>
                        <div className="text-xs text-muted-foreground">卡片有效期至：{detail.recharge_products.iccidValidity || '-'}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {detail.recharge_products.skuId.map((sku) => (
                            <span key={sku} className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{sku}</span>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* 相關訂單 */}
                    <div className="bg-white border border-border rounded-xl p-5">
                      <div className="flex items-center gap-2 text-sm font-medium mb-3">
                        <Search className="w-4 h-4 text-gray-500" /> 相關訂單（{iccidOrders.length}）
                      </div>
                      {iccidOrders.length === 0 ? (
                        <p className="text-xs text-muted-foreground">無訂單記錄</p>
                      ) : (
                        <div className="space-y-2">
                          {iccidOrders.map((order, i) => (
                            <OrderUsageCard key={i} order={order} iccid={selectedIccid} />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 手動新增 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">手動新增卡號</h2>
              <button onClick={() => { setShowAddModal(false); setAddError('') }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">卡片類型</label>
                <div className="mt-1.5 flex gap-2">
                  <button onClick={() => setAddType('esim')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${addType === 'esim' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-gray-500 hover:border-primary/50'}`}>
                    <Wifi className="w-4 h-4 inline mr-1" /> eSIM
                  </button>
                  <button onClick={() => setAddType('sim')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${addType === 'sim' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-gray-500 hover:border-primary/50'}`}>
                    <CreditCard className="w-4 h-4 inline mr-1" /> SIM 卡
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">ICCID <span className="text-red-500">*</span></label>
                <input
                  type="text" value={addIccid} onChange={(e) => setAddIccid(e.target.value)}
                  placeholder="輸入 ICCID（至少 10 碼）" autoFocus
                  className="mt-1.5 w-full px-3 py-2.5 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">備註名稱 <span className="text-gray-400 font-normal">（選填）</span></label>
                <input
                  type="text" value={addNickname} onChange={(e) => setAddNickname(e.target.value)}
                  placeholder="例：日本旅遊用、泰國備用"
                  className="mt-1.5 w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {addError && <p className="text-sm text-red-500">{addError}</p>}
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={handleAddCard} disabled={adding}
                className="flex-1 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50">
                {adding ? '新增中...' : '新增卡號'}
              </button>
              <button onClick={() => { setShowAddModal(false); setAddError('') }}
                className="px-4 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 卡片列表項目（含充值預留按鈕）
function CardListItem({ card, isSelected, onSelect, onRemove }: {
  card: UniqueCard
  isSelected: boolean
  onSelect: () => void
  onRemove?: () => void
}) {
  return (
    <div className={`group flex items-center gap-1 rounded-lg border transition-all ${isSelected ? 'bg-primary/10 border-primary' : 'bg-white border-border hover:border-primary/50'}`}>
      <button onClick={onSelect} className="flex-1 text-left px-3 py-2 min-w-0">
        <div className={`text-xs font-mono truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
          {card.iccid}
        </div>
        {card.nickname && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{card.nickname}</div>
        )}
        {card.is_manual && (
          <div className="text-xs text-orange-500 mt-0.5">手動新增</div>
        )}
      </button>

      {/* 預留充值按鈕 */}
      <button
        title="充值（即將開放）"
        disabled
        className="p-1.5 text-gray-300 cursor-not-allowed opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Zap className="w-3.5 h-3.5" />
      </button>

      {/* 手動卡片：刪除按鈕 */}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="移除卡號"
          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 mr-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// 流量查詢（F023 日流量，可選日期範圍，按國家分組）
function TrafficQueryCard({ iccid }: { iccid: string }) {
  const [beginDate, setBeginDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [traffic, setTraffic] = useState<{ usedDate: string; type: string; usedAmount: string; country: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [queried, setQueried] = useState(false)

  async function query() {
    setLoading(true)
    const res = await fetch(`/api/shop/cards?action=traffic&iccid=${iccid}&beginDate=${beginDate}&endDate=${endDate}`).then((r) => r.json()).catch(() => ({ traffic: [] }))
    setTraffic(res.traffic || [])
    setQueried(true)
    setLoading(false)
  }

  // 按國家分組統計
  const countryStats = (() => {
    const map = new Map<string, number>()
    let total = 0
    for (const t of traffic) {
      const mb = parseFloat(t.usedAmount) || 0
      map.set(t.country, (map.get(t.country) || 0) + mb)
      total += mb
    }
    return { countries: Array.from(map.entries()).sort((a, b) => b[1] - a[1]), totalMB: total }
  })()

  function formatMB(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)}GB` : `${mb.toFixed(2)}MB`
  }

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 text-sm font-medium mb-3">
        <Database className="w-4 h-4 text-purple-500" /> 流量查詢
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={beginDate} onChange={(e) => setBeginDate(e.target.value)}
          className="px-2 py-1.5 border border-border rounded text-xs" />
        <span className="text-xs text-muted-foreground">至</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="px-2 py-1.5 border border-border rounded text-xs" />
        <button onClick={query} disabled={loading}
          className="px-3 py-1.5 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-50">
          {loading ? '查詢中...' : '查詢'}
        </button>
      </div>

      {queried && (
        <>
          {/* 國家用量統計 */}
          {countryStats.countries.length > 0 && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <div className="text-xs font-medium text-blue-700 mb-2">國家用量統計</div>
              <div className="flex flex-wrap gap-2">
                {countryStats.countries.map(([country, mb]) => (
                  <div key={country} className="px-2 py-1 bg-white rounded border border-blue-200 text-xs">
                    <div className="text-muted-foreground">{country}</div>
                    <div className="font-semibold text-blue-600">{formatMB(mb)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">總用量：</span>
                <span className="font-semibold">{formatMB(countryStats.totalMB)}</span>
              </div>
            </div>
          )}

          {/* 每日明細 */}
          {traffic.length > 0 ? (
            <div className="mt-3">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-1 font-medium">日期</th>
                    <th className="text-left py-1 font-medium">地區/國家</th>
                    <th className="text-right py-1 font-medium">用量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {traffic.map((t, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-muted-foreground">{t.usedDate}</td>
                      <td className="py-1.5">{t.country}</td>
                      <td className="py-1.5 text-right font-medium">{t.usedAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">此區間無流量記錄</p>
          )}
        </>
      )}
    </div>
  )
}

// 單筆訂單的套餐使用資訊（點擊展開查詢）
function OrderUsageCard({ order, iccid }: { order: CardItem; iccid: string }) {
  const [expanded, setExpanded] = useState(false)
  const [usage, setUsage] = useState<CardDetail['usage'] | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  async function loadUsage() {
    if (usage) { setExpanded(!expanded); return }
    setExpanded(true)
    setLoadingUsage(true)
    const res = await fetch(`/api/shop/cards?action=usage&iccid=${iccid}`).then((r) => r.json()).catch(() => null)
    setUsage(res?.usage || null)
    setLoadingUsage(false)
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={loadUsage} className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left">
        <div>
          <div className="text-sm font-medium">{order.product_name || order.bc_sku_id}</div>
          <div className="text-xs text-muted-foreground">{order.display_name} · Copies: {order.copies}</div>
        </div>
        <span className="text-xs text-primary">{expanded ? '收起' : '查詢用量'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          {loadingUsage ? (
            <p className="text-xs text-muted-foreground py-2">查詢中...</p>
          ) : !usage?.subOrderList || usage.subOrderList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">無套餐使用資訊</p>
          ) : (
            <div className="space-y-2 mt-2">
              {usage.subOrderList.map((plan, j) => (
                <div key={j} className="p-2 bg-muted rounded text-xs">
                  <div className="font-medium">{plan.skuName}</div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <div><span className="text-muted-foreground">狀態：</span>{plan.planStatus || '-'}</div>
                    <div><span className="text-muted-foreground">天數：</span>{plan.remainingDays || '-'} / {plan.totalDays || '-'}</div>
                    {plan.planStartTime && <div><span className="text-muted-foreground">開始：</span>{plan.planStartTime}</div>}
                    {plan.planEndTime && <div><span className="text-muted-foreground">結束：</span>{plan.planEndTime}</div>}
                    {plan.totalTraffic && <div><span className="text-muted-foreground">流量：</span>{plan.remainingTraffic || '-'} / {plan.totalTraffic}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
