// 用量資料下限：舊渠道 2025-05 之前的 F023 逐日用量撈不到，統計一律從 2025-05-01 起算，避免不完整期間污染大標數字
export const USAGE_FLOOR = '2025-05-01'

// 回傳「不早於下限」的起始日：使用者若指定更晚的 from 就用它，否則用下限
export const usageGte = (from?: string) => (from && from > USAGE_FLOOR ? from : USAGE_FLOOR)
