-- card_plans 加「套餐類型」快照（0 總量型 / 1 單日型），來源 bc_products.plan_type。
-- 存成欄位便於統計分析（可直接 SQL 分組），不用讀取時 join bc_products。
ALTER TABLE card_plans ADD COLUMN IF NOT EXISTS plan_type TEXT;

-- 回填既有列
UPDATE card_plans cp SET plan_type = bp.plan_type
  FROM bc_products bp WHERE cp.sku_id = bp.sku_id AND cp.plan_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_card_plans_type ON card_plans (plan_type);
