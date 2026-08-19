-- 卡片日流量使用矩陣（F023）：多維（日期 × 地區 × 用量）以長格式存，
-- 顯示時樞紐成矩陣（列＝日期、欄＝地區、格＝用量 KB）。一 ICCID×日期×地區 一列。
CREATE TABLE IF NOT EXISTS card_usage_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  iccid TEXT NOT NULL,
  used_date DATE NOT NULL,
  country TEXT,                       -- 地區名稱（如 日本）
  country_region_code TEXT,          -- 地區碼（如 JP）
  type TEXT,
  used_amount NUMERIC,               -- 用量（KB）
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (iccid, used_date, country_region_code)
);
CREATE INDEX IF NOT EXISTS idx_card_usage_iccid ON card_usage_daily (iccid, used_date);
