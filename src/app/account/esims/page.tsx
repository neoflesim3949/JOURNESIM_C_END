'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Wifi, CreditCard, ChevronRight, RefreshCw, Smartphone, Signal, Calendar, Database } from 'lucide-react'

interface CardItem {
  iccid: string; type: 'esim' | 'sim'
  product_name: string | null; display_name: string | null
  bc_sku_id: string; copies: string; days: number | null
  lpa_code: string | null; qr_code_url: string | null; status: string
}

interface CardDetail {
  iccid: string
  expiry: {
    iccid: string; type: string; status: string; expirationDate: string
    postponedMonth: string; maxDelayMonth: string; usageCount: string
    supportUpgradeMultiCard?: string
  } | null
  service_status: {
    status?: string; esimStatus?: string; profileStatus?: string
    recordTime?: string; eid?: string
    qrCodeUrl?: string; qrCodeContent?: string
  } | null
  usage: {
    orderId: string; channelOrderId: string
    subOrderList: {
      skuName: string; planStatus: string; planStartTime?: string; planEndTime?: string
      totalDays?: string; remainingDays?: string; totalTraffic?: string; remainingTraffic?: string
      highFlowSize?: string; planType?: string
      usageInfoList?: { useDate: string; useageAmt: string }[]
    }[]
  } | null
  traffic: { usedDate: string; type: string; usedAmount: string; country: string }[]
  verify: { iccid: string; iccidStatus?: string; iccidType?: string; rechargeableProduct?: string } | null
  real_name: { iccid: string; realNameStatus?: string; realNameType?: string } | null
  recharge_products: { iccidValidity?: string; skuId?: string[] } | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '準備中', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '處理中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已就緒', color: 'bg-green-100 text-green-700' },
  ready: { label: '待安裝', color: 'bg-cyan-100 text-cyan-700' },
  active: { label: '使用中', color: 'bg-green-100 text-green-700' },
  expired: { label: '已到期', color: 'bg-gray-100 text-gray-500' },
  card_assigned: { label: '已配卡', color: 'bg-cyan-100 text-cyan-700' },
  shipping: { label: '配送中', color: 'bg-purple-100 text-purple-700' },
}

export default function MyCardsPage() {
  const [cards, setCards] = useState<CardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [detail, setDetail] = useState<CardDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    fetch('/api/shop/cards?action=list')
      .then((r) => r.json())
      .then(setCards)
      .finally(() => setLoading(false))
  }, [])

  async function selectCard(iccid: string) {
    setSelectedCard(iccid)
    setLoadingDetail(true)
    setDetail(null)

    const res = await fetch(`/api/shop/cards?action=detail&iccid=${iccid}`).then((r) => r.json()).catch(() => null)
    setDetail(res)
    setLoadingDetail(false)
  }

  const esimCards = cards.filter((c) => c.type === 'esim')
  const simCards = cards.filter((c) => c.type === 'sim')
  const currentCard = cards.find((c) => c.iccid === selectedCard)

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回會員中心
      </Link>

      <h1 className="mt-4 text-2xl font-bold">我的卡片</h1>
      <p className="mt-1 text-muted-foreground">查看所有已購買的 eSIM 和 SIM 卡</p>

      {cards.length === 0 ? (
        <div className="mt-12 text-center py-16">
          <Smartphone className="mx-auto w-16 h-16 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">尚無卡片</p>
          <p className="mt-1 text-muted-foreground">購買後將在此顯示</p>
          <Link href="/shop" className="mt-6 inline-block px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover">前往選購</Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col lg:flex-row gap-6">
          {/* 左側：卡片列表 */}
          <div className="lg:w-80 flex-shrink-0 space-y-4">
            {esimCards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Wifi className="w-4 h-4 text-blue-500" /> eSIM（{esimCards.length}）
                </div>
                <div className="space-y-2">
                  {esimCards.map((card) => (
                    <CardButton key={card.iccid} card={card} selected={selectedCard === card.iccid} onClick={() => selectCard(card.iccid)} />
                  ))}
                </div>
              </div>
            )}
            {simCards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <CreditCard className="w-4 h-4 text-green-500" /> SIM 卡（{simCards.length}）
                </div>
                <div className="space-y-2">
                  {simCards.map((card) => (
                    <CardButton key={card.iccid} card={card} selected={selectedCard === card.iccid} onClick={() => selectCard(card.iccid)} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右側：卡片詳情 */}
          <div className="flex-1">
            {!selectedCard ? (
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
                    <div>
                      <div className="font-semibold">{currentCard?.product_name || '卡片'}</div>
                      <div className="text-sm text-muted-foreground">{currentCard?.display_name}</div>
                    </div>
                    <StatusBadge status={currentCard?.status || 'pending'} />
                  </div>
                  <div className="mt-3 text-xs font-mono text-muted-foreground">
                    ICCID: {selectedCard}
                  </div>
                  {currentCard?.lpa_code && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                      <div className="text-xs font-medium text-blue-700">LPA Code</div>
                      <div className="text-xs font-mono text-blue-600 mt-1 break-all">{currentCard.lpa_code}</div>
                    </div>
                  )}
                </div>

                {/* 卡片有效期 */}
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
                      {detail.expiry.supportUpgradeMultiCard && <div><span className="text-muted-foreground">多卡升級：</span>{detail.expiry.supportUpgradeMultiCard === '1' ? '支持' : '不支持'}</div>}
                    </div>
                  </div>
                )}

                {/* eSIM 服務狀態 */}
                {detail?.service_status && (
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

                {/* 套餐使用資訊 */}
                {detail?.usage?.subOrderList && detail.usage.subOrderList.length > 0 && (
                  <div className="bg-white border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Database className="w-4 h-4 text-green-500" /> 套餐使用資訊
                    </div>
                    <div className="space-y-3">
                      {detail.usage.subOrderList.map((plan, i) => (
                        <div key={i} className="p-3 bg-muted rounded-lg text-sm">
                          <div className="font-medium">{plan.skuName}</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-muted-foreground">狀態：</span>{plan.planStatus || '-'}</div>
                            <div><span className="text-muted-foreground">天數：</span>{plan.remainingDays || '-'} / {plan.totalDays || '-'} 天</div>
                            {plan.planStartTime && <div><span className="text-muted-foreground">開始：</span>{plan.planStartTime}</div>}
                            {plan.planEndTime && <div><span className="text-muted-foreground">結束：</span>{plan.planEndTime}</div>}
                            {plan.totalTraffic && <div><span className="text-muted-foreground">流量：</span>{plan.remainingTraffic || '-'} / {plan.totalTraffic}</div>}
                            {plan.highFlowSize && <div><span className="text-muted-foreground">高速流量：</span>{plan.highFlowSize}</div>}
                          </div>
                          {plan.usageInfoList && plan.usageInfoList.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <div className="text-xs font-medium text-muted-foreground mb-1">每日用量</div>
                              <div className="grid grid-cols-3 gap-1 text-xs">
                                {plan.usageInfoList.slice(-7).map((u, j) => (
                                  <div key={j} className="flex justify-between">
                                    <span className="text-muted-foreground">{u.useDate}</span>
                                    <span>{u.useageAmt}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 日流量 (F023) */}
                {detail?.traffic && detail.traffic.length > 0 && (
                  <div className="bg-white border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Database className="w-4 h-4 text-purple-500" /> 近 7 日流量
                    </div>
                    <div className="space-y-1">
                      {detail.traffic.map((t, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                          <span className="text-muted-foreground">{t.usedDate}</span>
                          <span>{t.usedAmount} · {t.country}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ICCID 驗證 (F013) */}
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

                {/* 實名認證 (F054) */}
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

                {/* 可充值商品 (F052) */}
                {detail?.recharge_products?.skuId && detail.recharge_products.skuId.length > 0 && (
                  <div className="bg-white border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <RefreshCw className="w-4 h-4 text-orange-500" /> 可充值方案
                    </div>
                    <div className="text-xs text-muted-foreground">
                      卡片有效期至：{detail.recharge_products.iccidValidity || '-'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {detail.recharge_products.skuId.map((sku) => (
                        <span key={sku} className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{sku}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CardButton({ card, selected, onClick }: { card: CardItem; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'
      }`}>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{card.product_name || card.bc_sku_id}</div>
        <div className="text-xs text-muted-foreground truncate">{card.display_name}</div>
        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{card.iccid}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <StatusBadge status={card.status} />
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${s.color}`}>{s.label}</span>
}
