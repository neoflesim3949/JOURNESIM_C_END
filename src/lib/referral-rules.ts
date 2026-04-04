/**
 * 二級分銷系統規則配置
 */
export const REFERRAL_RULES = {
  // 獎勵趴數/點數
  L1_COMMISSION_RATE: 0.05, // 5%
  L2_COMMISSION_RATE: 0.02, // 2%
  L1_FIRST_BUY_PTS: 50,     // 首購加碼點數
  NEW_USER_SIGNUP_PTS: 50,  // 新用戶註冊禮 (點數形式)

  // 門檻與安全
  MIN_ORDER_FOR_REWARD: 100, // 首購金額需滿 100 元才觸發 L1 加碼
  LOCK_PERIOD_DAYS: 14,      // 點數鎖定期 (天數)
  
  // 風控警告 (需串接 Log 或 Admin 提醒)
  SAME_IP_REGISTRATION_LIMIT: 5, // 同一 IP 24小時內註冊上限
}

/**
 * 簡易防作弊檢查 (後台使用)
 */
export function checkFraudRisk(fingerprint: string) {
    // 檢查資料庫中是否有過多相同 fingerprint 的推薦記錄
    // TODO: 串街資料庫查詢
    return false
}
