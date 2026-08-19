-- 卡片方案明細：一張卡 × 一方案（F012 subOrder）一列，供統計明細列表
-- 資料由 F012 同步寫入（自動 cron ＋規則，見 /api/cron/sync-card-plans）
CREATE TABLE IF NOT EXISTS card_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  iccid TEXT NOT NULL,
  sub_order_id TEXT NOT NULL,            -- BC 子單號（與 iccid 組唯一鍵）
  order_id TEXT,                         -- BC 主單號（BC 單號欄）
  channel_order_id TEXT,                 -- 渠道主單號
  sku_id TEXT,                           -- 套餐 SKU
  sku_name TEXT,                         -- 套餐名稱
  copies TEXT,                           -- 份數
  total_days INTEGER,                    -- 總天數（BC 回傳 totalDays 或 單份天數×份數）
  plan_status TEXT,                      -- 0未使用 1使用中 2結束 3取消
  plan_start_time TIMESTAMPTZ,           -- 啟用時間
  plan_end_time TIMESTAMPTZ,             -- 到期時間
  countries JSONB,                       -- 該方案覆蓋國家名稱陣列
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (iccid, sub_order_id)
);
CREATE INDEX IF NOT EXISTS idx_card_plans_iccid ON card_plans (iccid);
CREATE INDEX IF NOT EXISTS idx_card_plans_status ON card_plans (plan_status);
CREATE INDEX IF NOT EXISTS idx_card_plans_order ON card_plans (order_id);

COMMENT ON TABLE card_plans IS '卡片方案明細（一卡×一方案），F012 同步';
