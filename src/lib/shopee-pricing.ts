// 商品對應 V2 共用算價：列表 API 與匯出 API 共用，避免漂移

export interface PricingRule {
  multiplier: number
  add_amount: number
  rounding: 'ceil' | 'round' | 'floor' | 'none'
  round_to: number
}

export const DEFAULT_RULE: PricingRule = { multiplier: 1, add_amount: 0, rounding: 'ceil', round_to: 1 }

// BC 結算價(CNY) → 成本(TWD)。cnyRate 同 bc-search：cost_twd = ceil(cost_cny / cnyRate)
export function computeCostTwd(costCny: number, cnyRate: number): number {
  if (!costCny || !cnyRate) return 0
  return Math.ceil(costCny / cnyRate)
}

// 依加價規則由成本(TWD)算出售價(TWD)
export function computePrice(costTwd: number, rule: PricingRule): number {
  if (!costTwd) return 0
  const raw = costTwd * (Number(rule.multiplier) || 1) + (Number(rule.add_amount) || 0)
  const step = Number(rule.round_to) || 1
  switch (rule.rounding) {
    case 'round': return Math.round(raw / step) * step
    case 'floor': return Math.floor(raw / step) * step
    case 'none': return Math.round(raw)
    case 'ceil':
    default: return Math.ceil(raw / step) * step
  }
}

// 從 bc_products.prices 取指定 copies 的結算價(CNY)
export function costCnyFromPrices(
  prices: { copies: string; settlementPrice: string }[] | null | undefined,
  copies: string | null | undefined,
): number {
  if (!prices || !copies) return 0
  const m = prices.find(p => p.copies === copies)
  return m ? Number(m.settlementPrice) || 0 : 0
}
