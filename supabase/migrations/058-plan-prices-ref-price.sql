-- 058: package_plan_prices 加「參考價」欄位（純記事用，無其他邏輯）
ALTER TABLE package_plan_prices ADD COLUMN IF NOT EXISTS ref_price NUMERIC;
