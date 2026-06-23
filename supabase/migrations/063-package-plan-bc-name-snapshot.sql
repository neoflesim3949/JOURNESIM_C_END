-- 063: 套餐 BC 商品記下對應當下的品名快照，偵測 BC 品名變更（紅框警示）
ALTER TABLE package_plans ADD COLUMN IF NOT EXISTS bc_name_snapshot TEXT;
COMMENT ON COLUMN package_plans.bc_name_snapshot IS '對應當下的 BC 品名快照；與目前 bc_products.name 不同時於套餐標示品名變更';
