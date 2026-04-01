-- 每個 copies 獨立定價
CREATE TABLE IF NOT EXISTS product_plan_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_plan_id UUID NOT NULL REFERENCES product_plans(id) ON DELETE CASCADE,
  copies TEXT NOT NULL,
  cost_price NUMERIC,
  sell_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_plan_id, copies)
);

CREATE INDEX IF NOT EXISTS idx_product_plan_prices_plan ON product_plan_prices (product_plan_id);
