'use client'

import { X } from 'lucide-react'
import { formatCapacity, formatSpeed } from '@/lib/format'
import { getPlanTypeLabel } from '@/lib/bc-enums'

interface PriceItem { copies: string; retailPrice: string; settlementPrice: string }
export interface ComparePlan {
  sku_id: string; name: string; type?: string | null; plan_type: string | null
  days: number | null; capacity: string | null; high_flow_size: string | null; limit_flow_speed: string | null
  prices: PriceItem[] | null
}

// 套餐比較表：列＝copies，欄＝套餐，格＝結算/零售價，每列最低價綠標
export function PlanCompareTable({ plans, useRetail, onRemove }: {
  plans: ComparePlan[]; useRetail: boolean; onRemove?: (sku: string) => void
}) {
  const copiesList = [...new Set(plans.flatMap(p => (p.prices || []).map(pi => Number(pi.copies))).filter(n => !isNaN(n)))]
    .sort((a, b) => a - b)

  function priceOf(p: ComparePlan, copies: number): number | null {
    const pi = (p.prices || []).find(x => Number(x.copies) === copies)
    if (!pi) return null
    const v = Number(useRetail ? pi.retailPrice : pi.settlementPrice)
    return isNaN(v) ? null : v
  }
  function minOfRow(copies: number): number | null {
    const vals = plans.map(p => priceOf(p, copies)).filter((v): v is number => v != null)
    return vals.length ? Math.min(...vals) : null
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-xs">
          <tr>
            <th className="text-left px-4 py-3 font-medium sticky left-0 bg-gray-50 min-w-[80px]">copies</th>
            {plans.map(p => {
              const isDaily = p.plan_type === '1'
              return (
                <th key={p.sku_id} className="text-left px-4 py-3 font-medium min-w-[150px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-gray-800 font-semibold normal-case truncate max-w-[180px]" title={p.name}>{p.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{p.sku_id}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {getPlanTypeLabel(p.plan_type)} · {formatCapacity(p.high_flow_size ?? p.capacity, isDaily)}
                        {formatSpeed(p.limit_flow_speed) !== '-' ? ` · ${formatSpeed(p.limit_flow_speed)}` : ''}
                      </div>
                    </div>
                    {onRemove && (
                      <button onClick={() => onRemove(p.sku_id)} className="text-gray-300 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {copiesList.map(copies => {
            const min = minOfRow(copies)
            return (
              <tr key={copies} className="border-t border-gray-100 hover:bg-gray-50/40">
                <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-white">{copies}</td>
                {plans.map(p => {
                  const v = priceOf(p, copies)
                  const isDaily = p.plan_type === '1'
                  const unitDays = p.days ?? 1
                  const isMin = v != null && min != null && v === min && plans.length > 1
                  return (
                    <td key={p.sku_id} className={`px-4 py-2.5 ${isMin ? 'bg-green-50' : ''}`}>
                      {v == null ? <span className="text-gray-300">—</span> : (
                        <div>
                          <span className={`font-medium ${isMin ? 'text-green-700' : 'text-gray-800'}`}>¥{v}</span>
                          <span className="text-[10px] text-gray-400 ml-1">{isDaily ? `${unitDays * copies}天` : ''}</span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
  )
}
