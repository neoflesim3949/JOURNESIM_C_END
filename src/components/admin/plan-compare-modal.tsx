'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { PlanCompareTable, type ComparePlan } from './plan-compare-table'

// 套餐比較彈窗：傳入已選套餐（需含 prices），依相同 copies 對比價格
export default function PlanCompareModal({ plans: initial, onClose }: { plans: ComparePlan[]; onClose: () => void }) {
  const [plans, setPlans] = useState<ComparePlan[]>(initial)
  const [useRetail, setUseRetail] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrollW, setScrollW] = useState(0)
  const syncing = useRef(false)

  useLayoutEffect(() => {
    if (bodyRef.current) setScrollW(bodyRef.current.scrollWidth)
  }, [plans, useRetail])

  function syncFrom(src: 'top' | 'body') {
    if (syncing.current || !topRef.current || !bodyRef.current) return
    syncing.current = true
    if (src === 'top') bodyRef.current.scrollLeft = topRef.current.scrollLeft
    else topRef.current.scrollLeft = bodyRef.current.scrollLeft
    syncing.current = false
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <style>{`
        .cmp-bar { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f1f5f9; }
        .cmp-bar::-webkit-scrollbar { height: 12px; width: 12px; }
        .cmp-bar::-webkit-scrollbar-track { background: #f1f5f9; }
        .cmp-bar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; border: 3px solid #f1f5f9; }
        .cmp-bar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .cmp-noscroll { scrollbar-width: none; }
        .cmp-noscroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold">套餐比較</h2>
            <p className="text-xs text-gray-500 mt-0.5">依「相同 copies」對比{useRetail ? '零售價' : '結算價'}（每列最低價綠色標示）</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={useRetail} onChange={e => setUseRetail(e.target.checked)} className="accent-blue-600" />
              零售價
            </label>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {plans.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">沒有可比較的套餐</div>
        ) : (
          <>
            {/* 頂部水平捲軸（與下方表格同步） */}
            <div ref={topRef} onScroll={() => syncFrom('top')} className="cmp-bar overflow-x-scroll overflow-y-hidden border-b border-gray-100">
              <div style={{ width: scrollW || 1, height: 1 }} />
            </div>
            {/* 內容：垂直捲軸在右側可見；水平捲軸隱藏（由上方那條控制） */}
            <div className="cmp-bar overflow-y-auto overflow-x-hidden flex-1 min-h-0">
              <div ref={bodyRef} onScroll={() => syncFrom('body')} className="cmp-noscroll overflow-x-auto">
                <PlanCompareTable plans={plans} useRetail={useRetail} onRemove={(sku) => setPlans(prev => prev.filter(p => p.sku_id !== sku))} />
              </div>
            </div>
          </>
        )}
        <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">綠色＝該 copies 下最低{useRetail ? '零售價' : '結算價'}；「—」表示該套餐無此 copies；每日型另標對應天數。</div>
      </div>
    </div>
  )
}
