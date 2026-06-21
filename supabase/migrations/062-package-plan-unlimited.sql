-- 062: 套餐 BC 商品標記「吃到飽」，選項貨號加 F 段（主選項ID_D/T_流量_F_天數）
ALTER TABLE package_plans ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT false;
COMMENT ON COLUMN package_plans.is_unlimited IS '吃到飽；選項貨號於流量與天數間插入 F';
