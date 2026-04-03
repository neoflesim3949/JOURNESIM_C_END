// BillionConnect 資料對照表 (Mapping Tables)

// 銷售方式
export const SALES_METHOD: Record<string, string> = {
  '1': '零售', '2': 'OTA', '3': '批發', '4': '分佣', '5': '分銷', '6': '其他',
}

// 套餐類型
export const PLAN_TYPE: Record<string, string> = {
  '0': '總量型', '1': '單日型',
}

// 商品類型
export const PRODUCT_TYPE: Record<string, string> = {
  '110': '自選套餐', '111': '固定套餐',
  '210': '單次卡', '211': '多次卡', '212': '硬卡',
  '220': '銷售MIFI', '221': '租賃MIFI', '230': 'eSIM', '250': 'eSIM Air',
  '311': '硬卡+流量',
  '3101': '單次卡+自選', '3102': '單次卡+固定',
  '3103': '多次卡+自選', '3104': '多次卡+固定',
  '3105': 'eSIM+自選', '3106': 'eSIM+固定',
  '3201': '銷售MIFI+自選', '3202': '銷售MIFI+固定',
  '3211': '租賃MIFI+自選', '3212': '租賃MIFI+固定',
}

// eSIM 類型碼
export const ESIM_TYPES = ['230', '3105', '3106', '250']

// SIM 類型碼
export const SIM_TYPES = ['110', '111', '210', '211', '212', '311', '3101', '3102', '3103', '3104']

// 加速包（無號碼的商品，不在 eSIM 和 SIM 列表中）
export const ESIM_SIM_ALL_TYPES = [...ESIM_TYPES, ...SIM_TYPES]

// 各分類下的子類型篩選選項
export const ESIM_TYPE_OPTIONS: Record<string, string> = {
  '230': 'eSIM',
  '250': 'eSIM Air',
  '3105': 'eSIM+自選',
  '3106': 'eSIM+固定',
}

export const SIM_TYPE_OPTIONS: Record<string, string> = {
  '110': '自選套餐',
  '111': '固定套餐',
  '210': '單次卡',
  '211': '多次卡',
  '212': '硬卡',
  '311': '硬卡+流量',
  '3101': '單次卡+自選',
  '3102': '單次卡+固定',
  '3103': '多次卡+自選',
  '3104': '多次卡+固定',
}

// 判斷是否為 eSIM
export function isEsimType(type: string): boolean {
  return ESIM_TYPES.includes(type)
}

// 取得商品類型文字
export function getProductTypeLabel(type: string): string {
  return PRODUCT_TYPE[type] || type
}

// 取得套餐類型文字
export function getPlanTypeLabel(planType: string | null): string {
  if (!planType) return '-'
  return PLAN_TYPE[planType] || planType
}

// 取得銷售方式文字
export function getSalesMethodLabel(method: string | null): string {
  if (!method) return '-'
  return SALES_METHOD[method] || method
}
