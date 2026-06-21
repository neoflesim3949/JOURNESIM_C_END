import { formatCapacity } from './format'

export interface OptionCodePlan {
  plan_type: string | null
  capacity: string | null
  high_flow_size: string | null
}

// 生成可讀的套餐選項貨號：主選項ID_類型(D/T)_流量_天數
// 吃到飽：主選項ID_類型(D/T)_流量_F_天數
// 例：JPIIJ_D_1GB_1 / JPIIJ_T_5GB_1 / JPIIJ_D_1GB_F_3
export function buildOptionCode(mainCode: string, plan: OptionCodePlan, days: number, unlimited = false): string {
  if (!mainCode) return ''
  const td = plan.plan_type === '1' ? 'D' : 'T' // 單日型=D（天數型）／總量型=T
  const cap = formatCapacity(plan.high_flow_size ?? plan.capacity, false).replace('無限流量', '無限').replace(/\s/g, '')
  return [mainCode, td, cap, unlimited ? 'F' : '', days].filter(Boolean).join('_')
}
