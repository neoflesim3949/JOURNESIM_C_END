import { costCnyFromPrices } from './shopee-pricing'

type BcRow = { name: string | null; prices: { copies: string; settlementPrice: string }[] | null }

// 撈多個 BC SKU 的 name + prices（分批避免 1000 筆上限）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchBcMap(supabase: any, skuIds: (string | null | undefined)[]): Promise<Map<string, BcRow>> {
  const ids = [...new Set(skuIds.filter(Boolean))] as string[]
  const map = new Map<string, BcRow>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from('bc_products').select('sku_id, name, prices').in('sku_id', ids.slice(i, i + 300))
    for (const p of data || []) map.set(p.sku_id, { name: p.name, prices: p.prices })
  }
  return map
}

// 由 BC 資料 + copies 組出快照欄位
export function snapshotFor(bc: BcRow | undefined, copies: string | null | undefined) {
  if (!bc) return { bc_name_snapshot: null, bc_cost_snapshot: null }
  return {
    bc_name_snapshot: bc.name || null,
    bc_cost_snapshot: costCnyFromPrices(bc.prices, copies) || null,
  }
}

// 偵測 BC 是否變更（品名或成本與快照不同）
export function isBcChanged(
  bcSkuId: string | null | undefined,
  nameSnapshot: string | null | undefined,
  costSnapshot: number | null | undefined,
  curName: string | null | undefined,
  curCostCny: number,
): boolean {
  if (!bcSkuId || nameSnapshot == null) return false   // 未對應或無基準 → 不警示
  const nameDiff = (nameSnapshot || '') !== (curName || '')
  const costDiff = Number(costSnapshot ?? 0) !== Number(curCostCny || 0)
  return nameDiff || costDiff
}
