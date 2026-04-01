-- 商品綁定的 BC 套餐（統一存放，自動判定日費/固定）
CREATE TABLE IF NOT EXISTS product_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bc_sku_id TEXT NOT NULL,
  sell_price NUMERIC DEFAULT 0,
  plan_category TEXT NOT NULL DEFAULT 'daily',  -- 'daily' | 'fixed'，自動判定
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, bc_sku_id)
);

CREATE INDEX IF NOT EXISTS idx_product_plans_product ON product_plans (product_id);
CREATE INDEX IF NOT EXISTS idx_product_plans_sku ON product_plans (bc_sku_id);
