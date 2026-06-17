// 商品對應 V2 共用算價：列表 API 與匯出 API 共用，避免漂移

export interface PricingRule {
  multiplier: number
  add_amount: number
  rounding: 'ceil' | 'round' | 'floor' | 'none'
  round_to: number
}

export const DEFAULT_RULE: PricingRule = { multiplier: 1, add_amount: 0, rounding: 'ceil', round_to: 1 }

// 進位模式（與商品對應 V2 批量定價一致）
export type RoundMode = 'ceil' | 'round' | 'floor' | 'none' | 'ceil95' | 'floor95' | 'round9'

export function roundPrice(v: number, mode: RoundMode, step = 1): number {
  if (!v) return 0
  const s = Number(step) || 1
  // 無條件進至95：個位 0→降十位個位9(150→149)、1~5→5、6~9→9
  const ceil95 = (x: number) => { const n = Math.ceil(x), u = n % 10, b = n - u; return u === 0 ? Math.max(b - 1, 0) : (u <= 5 ? b + 5 : b + 9) }
  // 無條件捨至95：5/9 保留、0~4→降十位個位9、6~8→5
  const floor95 = (x: number) => { const n = Math.floor(x), u = n % 10, b = n - u; if (u === 5 || u === 9) return n; return u <= 4 ? Math.max(b - 1, 0) : b + 5 }
  // 四捨五入至9：個位 0~3 往下到前一個9、4~9 往上到 base+9
  const round9 = (x: number) => { const n = Math.round(x), u = n % 10, b = n - u; return u < 4 ? Math.max(b - 1, 0) : b + 9 }
  switch (mode) {
    case 'round': return Math.round(v / s) * s
    case 'floor': return Math.floor(v / s) * s
    case 'none': return Math.round(v)
    case 'ceil95': return ceil95(v)
    case 'floor95': return floor95(v)
    case 'round9': return round9(v)
    case 'ceil':
    default: return Math.ceil(v / s) * s
  }
}

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
