-- 套餐價格追蹤：原始成本價、異動標記
ALTER TABLE package_plan_prices ADD COLUMN IF NOT EXISTS original_cost_price NUMERIC;
ALTER TABLE package_plan_prices ADD COLUMN IF NOT EXISTS price_changed BOOLEAN DEFAULT false;
ALTER TABLE package_plan_prices ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;
