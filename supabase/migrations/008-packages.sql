-- 套餐（獨立管理，可被多個方案共用）
CREATE TABLE IF NOT EXISTS packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                    -- 套餐名稱（如「不丹 eSIM 日費」「東南亞 10 國 eSIM」）
  description TEXT,
  product_type TEXT NOT NULL DEFAULT 'esim',  -- esim / sim
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 套餐綁定的 BC 商品（從 product_plans 概念移過來）
CREATE TABLE IF NOT EXISTS package_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  bc_sku_id TEXT NOT NULL,
  plan_category TEXT NOT NULL DEFAULT 'daily',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(package_id, bc_sku_id)
);

CREATE INDEX IF NOT EXISTS idx_package_plans_package ON package_plans (package_id);

-- 套餐的 copies 獨立定價
CREATE TABLE IF NOT EXISTS package_plan_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_plan_id UUID NOT NULL REFERENCES package_plans(id) ON DELETE CASCADE,
  copies TEXT NOT NULL,
  cost_price NUMERIC,
  sell_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(package_plan_id, copies)
);

CREATE INDEX IF NOT EXISTS idx_package_plan_prices_plan ON package_plan_prices (package_plan_id);

-- 方案與套餐的關聯（多對多）
CREATE TABLE IF NOT EXISTS product_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_product_packages_product ON product_packages (product_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_package ON product_packages (package_id);
