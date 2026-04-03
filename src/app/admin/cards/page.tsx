'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, CreditCard, RefreshCw, X, Database, Calendar } from 'lucide-react'

interface CardRow {
  iccid: string; type: 'esim' | 'sim'; bc_sku_name: string | null
  product_name: string | null; order_number: string | null; order_id: string | null
  sub_order_number: string | null; status: string
}

interface ExpiryInfo {
  type: string; status: string; expirationDate: string
  postponedMonth: string; maxDelayMonth: string; usageCount: string
  supportUpgradeMultiCard?: string
}

interface UsagePlan {
  skuId: string; skuName: string; copies: string; planStatus: string
  planStartTime?: string; planEndTime?: string
  totalDays?: string; remainingDays?: string; totalTraffic?: string; remainingTraffic?: string
}

interface SkuDetail {
  sku_id: string; name: string; type: string | null; plan_type: string | null
  high_flow_size: string | null; limit_flow_speed: string | null; capacity: string | null
  hotspot_support: string | null; acceleration_support: string | null
  point_contact_type: string | null; time_zone: string | null
  desc: string | null; country_data: { 
    mcc: string; name: string; apn: string; 
    apnUsername?: string; apnPassword?: string;
    operatorInfo?: { operator: string; network: string; priority: string }[] 
  }[] | null
}

const PLAN_STATUS: Record<string, string> = {
  '0': '未使用', '1': '正在使用', '2': '使用結束', '3': '已取消',
}

interface TrafficItem {
  usedDate: string; country: string; usedAmountKB: number
}

export default function AdminCardsPage() {
  const [cards, setCards] = useState<CardRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // 彈窗
  const [detailIccid, setDetailIccid] = useState<string | null>(null)
  const [detailType, setDetailType] = useState<'usage' | 'expiry' | 'traffic'>('expiry')
  const [expiry, setExpiry] = useState<ExpiryInfo | null>(null)
  const [usage, setUsage] = useState<{ subOrderList: UsagePlan[] } | null>(null)
  const [usageSkuDetails, setUsageSkuDetails] = useState<Record<string, SkuDetail>>({})
  const [countryDetail, setCountryDetail] = useState<SkuDetail['country_data'] | null>(null)
  const [traffic, setTraffic] = useState<TrafficItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [trafficBegin, setTrafficBegin] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [trafficEnd, setTrafficEnd] = useState(() => new Date().toISOString().slice(0, 10))

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ action: 'list', page: String(page), pageSize: String(pageSize) })
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/cards?${params}`)
    if (res.ok) {
      const data = await res.json()
      setCards(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page, pageSize])

  function handleSearch() { setPage(1); load() }

  const [detailSubOrderNumber, setDetailSubOrderNumber] = useState<string | null>(null)

  async function openDetail(iccid: string, type: 'expiry' | 'usage' | 'traffic', subOrderNumber?: string | null) {
    setDetailIccid(iccid)
    setDetailType(type)
    setDetailSubOrderNumber(subOrderNumber || null)
    setDetailLoading(true)
    setExpiry(null); setUsage(null); setTraffic([]); setUsageSkuDetails({})

    if (type === 'expiry') {
      const res = await fetch(`/api/admin/cards?action=expiry&iccid=${iccid}`).then((r) => r.json()).catch(() => ({}))
      setExpiry(res.expiry || null)
    } else if (type === 'usage') {
      const params = new URLSearchParams({ action: 'usage', iccid })
      if (subOrderNumber) params.set('channelOrderId', subOrderNumber)
      const res = await fetch(`/api/admin/cards?${params}`).then((r) => r.json()).catch(() => ({}))
      
      if (res.usage?.subOrderList) {
        setUsage(res.usage)
        const uniqueSkuIds = [...new Set(res.usage.subOrderList.map((p: any) => p.skuId))]
        const detailsMap: Record<string, SkuDetail> = {}
        await Promise.all(uniqueSkuIds.map(async (skuId) => {
          const skuRes = await fetch(`/api/admin/cards?action=sku&skuId=${skuId}`).then((r) => r.json()).catch(() => ({}))
          if (skuRes.sku) detailsMap[skuId as string] = skuRes.sku
        }))
        setUsageSkuDetails(detailsMap)
      } else {
        setUsage(null)
      }
    } else if (type === 'traffic') {
      await loadTraffic(iccid)
    }
    setDetailLoading(false)
  }

  async function loadTraffic(iccid: string) {
    setDetailLoading(true)
    const res = await fetch(`/api/admin/cards?action=traffic&iccid=${iccid}&beginDate=${trafficBegin}&endDate=${trafficEnd}`).then((r) => r.json()).catch(() => ({}))
    setTraffic(res.traffic || [])
    setDetailLoading(false)
  }

  function formatKB(kb: number): string {
    if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)}GB`
    if (kb >= 1024) return `${(kb / 1024).toFixed(2)}MB`
    return `${kb}KB`
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <h1 className="text-2xl font-bold">卡片管理</h1>
      <p className="mt-1 text-sm text-gray-500">ICCID 管理 · 套餐資訊查詢 · 共 {total} 張卡片</p>

      {/* 搜尋 */}
      <div className="mt-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋 ICCID、訂單號、套餐名稱..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">搜尋</button>
      </div>

      {/* 表格 */}
      {loading ? <p className="mt-8 text-sm text-gray-500">載入中...</p> : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">ICCID</th>
                  <th className="text-left px-4 py-3 font-medium">主訂單號</th>
                  <th className="text-left px-4 py-3 font-medium">套餐名稱</th>
                  <th className="text-left px-4 py-3 font-medium w-16">類型</th>
                  <th className="text-left px-4 py-3 font-medium w-20">狀態</th>
                  <th className="text-center px-4 py-3 font-medium w-28">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cards.map((card, i) => (
                  <tr key={`${card.iccid}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{card.iccid}</td>
                    <td className="px-4 py-2">
                      {card.order_id ? (
                        <Link href={`/admin/orders/${card.order_id}`} className="text-xs text-blue-600 hover:underline font-mono">{card.order_number}</Link>
                      ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-2 text-xs max-w-[200px] truncate">{card.bc_sku_name || '-'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${card.type === 'esim' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {card.type === 'esim' ? 'eSIM' : 'SIM'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{card.status}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openDetail(card.iccid, 'expiry', card.sub_order_number)} title="卡片有效期"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDetail(card.iccid, 'usage', card.sub_order_number)} title="套餐詳情"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-green-600 hover:bg-green-50 rounded">
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDetail(card.iccid, 'traffic', card.sub_order_number)} title="用量詳情"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded">
                          <Database className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分頁 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              每頁
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="px-2 py-1 border border-gray-300 rounded text-sm">
                {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              筆 · 共 {total} 筆
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">上一頁</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        </div>
      )}

      {/* 詳情彈窗 */}
      {detailIccid && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailIccid(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-bold">
                  {detailType === 'expiry' && '卡片有效期'}
                  {detailType === 'usage' && '套餐詳情'}
                  {detailType === 'traffic' && '用量詳情'}
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">ICCID: {detailIccid}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(['expiry', 'usage', 'traffic'] as const).map((t) => (
                    <button key={t} onClick={() => openDetail(detailIccid, t, detailSubOrderNumber)}
                      className={`px-3 py-1 text-xs font-medium ${detailType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {t === 'expiry' ? '有效期' : t === 'usage' ? '套餐' : '用量'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setDetailIccid(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-5">
              {detailLoading ? (
                <div className="text-center py-8"><RefreshCw className="mx-auto w-6 h-6 text-gray-400 animate-spin" /></div>
              ) : (
                <>
                  {/* 有效期 */}
                  {detailType === 'expiry' && (
                    expiry ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-gray-500">到期日：</span>{expiry.expirationDate}</div>
                        <div><span className="text-gray-500">狀態：</span>{expiry.status}</div>
                        <div><span className="text-gray-500">類型：</span>{expiry.type}</div>
                        <div><span className="text-gray-500">充值次數：</span>{expiry.usageCount}</div>
                        <div><span className="text-gray-500">已延期：</span>{expiry.postponedMonth} 月</div>
                        <div><span className="text-gray-500">最大可延期：</span>{expiry.maxDelayMonth} 月</div>
                        {expiry.supportUpgradeMultiCard && <div><span className="text-gray-500">多卡升級：</span>{expiry.supportUpgradeMultiCard === '1' ? '支持' : '不支持'}</div>}
                      </div>
                    ) : <p className="text-sm text-gray-500">查無資料</p>
                  )}

                  {/* 套餐詳情 */}
                  {detailType === 'usage' && (
                    usage?.subOrderList && usage.subOrderList.length > 0 ? (
                      <div className="space-y-4">
                        {usage.subOrderList.map((plan, i) => {
                          const sku = usageSkuDetails[plan.skuId]
                          return (
                            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                              {/* 基礎用量資訊 */}
                              <div className="p-4 bg-white text-sm">
                                <div className="font-medium text-blue-900">{plan.skuName}</div>
                                <div className="flex items-center gap-3 mt-1.5 mb-3 pb-3 border-b border-gray-100 text-xs">
                                  <div className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">ID: {plan.skuId}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-gray-500">狀態：</span>
                                    <span className={`font-medium ${plan.planStatus === '1' ? 'text-green-600' : plan.planStatus === '0' ? 'text-gray-600' : 'text-orange-600'}`}>
                                      {PLAN_STATUS[plan.planStatus] || plan.planStatus}
                                    </span>
                                  </div>
                                  <div><span className="text-gray-500">天數：</span>{plan.remainingDays || '-'} / {plan.totalDays || '-'}</div>
                                  {plan.planStartTime && <div><span className="text-gray-500">開始：</span><span className="font-mono">{plan.planStartTime}</span></div>}
                                  {plan.planEndTime && <div><span className="text-gray-500">結束：</span><span className="font-mono">{plan.planEndTime}</span></div>}
                                  {plan.totalTraffic && <div><span className="text-gray-500">流量：</span>{plan.remainingTraffic || '-'} / {plan.totalTraffic}</div>}
                                </div>
                              </div>

                              {/* SKU 詳細資訊 */}
                              {sku && (
                                <div className="p-4 bg-gray-50 text-xs border-t border-gray-200 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
                                    <div><span className="text-gray-500 mr-1.5">高速流量:</span><span className="font-medium">{sku.high_flow_size || '-'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">限速峰值:</span><span className="font-medium">{sku.limit_flow_speed || '-'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">套餐類型:</span><span className="font-medium">{sku.plan_type === 'daily' ? '日切型' : sku.plan_type === 'duration' ? '總量型' : sku.plan_type || '總量型'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">支持加速:</span><span className="font-medium">{sku.acceleration_support === '1' ? '支持全部' : '不支持'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">熱點分享:</span><span className="font-medium">{sku.hotspot_support === '1' ? '支持' : sku.hotspot_support === '0' ? '不支持' : '-'}</span></div>
                                    <div><span className="text-gray-500 mr-1.5">時區:</span><span className="font-medium">{sku.time_zone || '-'}</span></div>
                                  </div>

                                  {sku.country_data && sku.country_data.length > 0 && (
                                    <div className="pt-3 border-t border-gray-200 mt-3 flex items-center justify-between">
                                      <span className="text-gray-600 font-medium">覆蓋國家地區 & 運營商 ({sku.country_data.length})</span>
                                      <button 
                                        onClick={() => setCountryDetail(sku.country_data)} 
                                        className="text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded transition-colors"
                                      >
                                        查看詳情
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : <p className="text-sm text-gray-500">查無套餐資訊</p>
                  )}

                  {/* 用量詳情 */}
                  {detailType === 'traffic' && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <input type="date" value={trafficBegin} onChange={(e) => setTrafficBegin(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        <span className="text-xs text-gray-400">至</span>
                        <input type="date" value={trafficEnd} onChange={(e) => setTrafficEnd(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        <button onClick={() => loadTraffic(detailIccid)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">查詢</button>
                      </div>

                      {traffic.length > 0 ? (
                        <>
                          {/* 國家統計 */}
                          {(() => {
                            const map = new Map<string, number>(); let totalKB = 0
                            for (const t of traffic) { map.set(t.country, (map.get(t.country) || 0) + t.usedAmountKB); totalKB += t.usedAmountKB }
                            return (
                              <div className="p-3 bg-blue-50 rounded-lg mb-3">
                                <div className="flex flex-wrap gap-2">
                                  {Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([c, kb]) => (
                                    <div key={c} className="px-2 py-1 bg-white rounded border border-blue-200 text-xs">
                                      <div className="text-gray-500">{c}</div><div className="font-semibold text-blue-600">{formatKB(kb)}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 text-xs"><span className="text-gray-500">總用量：</span><span className="font-semibold">{formatKB(totalKB)}</span></div>
                              </div>
                            )
                          })()}
                          <table className="w-full text-xs">
                            <thead className="text-gray-500"><tr><th className="text-left py-1">日期</th><th className="text-left py-1">地區/國家</th><th className="text-right py-1">用量</th></tr></thead>
                            <tbody className="divide-y divide-gray-100">
                              {traffic.map((t, i) => (
                                <tr key={i}><td className="py-1.5 text-gray-400">{t.usedDate}</td><td className="py-1.5">{t.country}</td><td className="py-1.5 text-right font-medium">{formatKB(t.usedAmountKB)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : <p className="text-sm text-gray-500">此區間無流量記錄</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 國家/運營商詳情彈窗 */}
      {countryDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => setCountryDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
              <h3 className="font-bold text-lg text-gray-800">覆蓋國家地區 & 運營商</h3>
              <button onClick={() => setCountryDetail(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="overflow-y-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 text-xs shadow-sm shadow-gray-100/50">
                   <tr>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">國家 / 地區</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">運營商</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">優先級</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">網絡</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">APN</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">APN Username</th>
                     <th className="px-4 py-3 font-medium whitespace-nowrap">APN Password</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {countryDetail.map((c, idx) => {
                     const opCount = Math.max(c.operatorInfo?.length || 1, 1);
                     const operators = c.operatorInfo && c.operatorInfo.length > 0 ? c.operatorInfo : [{ operator: '-', network: '-', priority: '-' }];

                     return (
                       <React.Fragment key={idx}>
                         {operators.map((op, opIdx) => {
                           const isFirst = opIdx === 0;
                           return (
                             <tr key={opIdx} className="hover:bg-gray-50/50 group">
                               {isFirst && <td className="px-4 py-3 font-medium text-gray-800 border-r border-gray-50 align-top bg-white" rowSpan={opCount}>{c.name}</td>}
                               <td className="px-4 py-3 text-gray-700">{op.operator}</td>
                               <td className="px-4 py-3 text-gray-500">{op.priority}</td>
                               <td className="px-4 py-3 text-gray-500">{op.network}</td>
                               {isFirst && (
                                 <>
                                   <td className="px-4 py-3 text-gray-600 font-mono border-l border-gray-50 align-top bg-white" rowSpan={opCount}>{c.apn || '-'}</td>
                                   <td className="px-4 py-3 text-gray-500 font-mono border-l border-gray-50 align-top bg-white" rowSpan={opCount}>{c.apnUsername || '-'}</td>
                                   <td className="px-4 py-3 text-gray-500 font-mono border-l border-gray-50 align-top bg-white" rowSpan={opCount}>{c.apnPassword || '-'}</td>
                                 </>
                               )}
                             </tr>
                           );
                         })}
                       </React.Fragment>
                     )
                   })}
                 </tbody>
               </table>
            </div>
            
            <div className="p-4 border-t border-gray-100 flex justify-end shrink-0 bg-gray-50/50">
              <button 
                onClick={() => setCountryDetail(null)} 
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 font-medium transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
