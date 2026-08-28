'use client'

import { useEffect, useState } from 'react'
import { Loader2, History } from 'lucide-react'

interface PriceTier { copies: string; retailPrice: string; settlementPrice: string }
interface HistRow { id: string; synced_at: string; prices: PriceTier[] | null; cost_price: number | null; prev_cost_price: number | null }

// 某 SKU 的價格歷史（bc_price_history）：每次同步偵測到變動記一筆
export default function PriceHistory({ skuId }: { skuId: string }) {
  const [rows, setRows] = useState<HistRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/plans/price-history?sku_id=${encodeURIComponent(skuId)}`)
      .then(r => r.json())
      .then(d => { if (alive) setRows(d.rows || []) })
      .catch(() => { })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [skuId])

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1"><History className="w-3.5 h-3.5" /> 價格歷史（結算價）</div>
      {loading ? (
        <div className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 載入中…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-gray-400">尚無歷史紀錄（下次同步偵測到變動後會累積）</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {rows.map((r) => {
              const up = r.prev_cost_price != null && r.cost_price != null && r.cost_price > r.prev_cost_price
              const down = r.prev_cost_price != null && r.cost_price != null && r.cost_price < r.prev_cost_price
              return (
                <div key={r.id} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
                  <span className="text-gray-500">{new Date(r.synced_at).toLocaleString('zh-TW')}</span>
                  <span className={`font-mono ${up ? 'text-red-600' : down ? 'text-green-600' : 'text-gray-700'}`}>
                    {r.prev_cost_price != null && <span className="text-gray-400">¥{r.prev_cost_price} → </span>}
                    ¥{r.cost_price ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
