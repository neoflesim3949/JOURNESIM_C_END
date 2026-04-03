-- 套餐方案自訂名稱及排序
ALTER TABLE package_plans ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE package_plans ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
