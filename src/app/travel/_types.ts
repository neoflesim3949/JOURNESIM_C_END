export type PlanType = 'sim' | 'esim'
export type PayStatus = 'unpaid' | 'paid' | 'free'

export interface GroupPlan {
  id: string
  group_id: string
  package_id: string | null
  package_plan_id: string | null
  bc_sku_id: string | null
  copies: string | null
  name: string
  plan_type: PlanType
  suggested_price: number | null
  agency_price: number | null
  our_cost: number | null
  sort_index: number
}

export interface TourMember {
  id: string
  group_id: string
  name: string
  contact: string | null
  token: string
  chosen_plan_id: string | null
  online_charge: number
  pay_status: PayStatus
  email: string | null
  issued: boolean
  iccid: string | null
  esim_qr: string | null
}

export interface TourGroup {
  id: string
  name: string
  code: string | null
  depart_date: string | null
  return_date: string | null
  countries: string[]
  base_is_free: boolean
  base_sim_plan_id: string | null
  base_esim_plan_id: string | null
}

export interface CatalogItem {
  key: string
  package_id: string
  package_plan_id: string
  bc_sku_id: string | null
  copies: string
  name: string
  plan_type: PlanType
  countries: string[]
  suggested_price: number | null
  our_cost: number
}

// 由出發/回程日算天數（含頭尾）
export function tripDays(depart: string | null, ret: string | null): number | null {
  if (!depart || !ret) return null
  const d1 = new Date(depart + 'T00:00:00'), d2 = new Date(ret + 'T00:00:00')
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1
  return diff > 0 ? diff : null
}
