-- =====================================================
-- 蝦皮購物模組
-- =====================================================

-- 蝦皮訂單
CREATE TABLE IF NOT EXISTS shopee_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_order_number TEXT UNIQUE NOT NULL,
  order_status TEXT,
  return_status TEXT,
  buyer_account TEXT,
  order_date TIMESTAMPTZ,
  -- 金流
  product_total NUMERIC,
  buyer_shipping_fee NUMERIC,
  shopee_shipping_subsidy NUMERIC,
  return_shipping_fee NUMERIC,
  buyer_total_payment NUMERIC,
  seller_coupon NUMERIC,
  transaction_fee NUMERIC,
  other_service_fee NUMERIC,
  payment_processing_fee NUMERIC,
  payment_processing_rate TEXT,
  -- 收件
  recipient_name TEXT,
  recipient_phone TEXT,
  shipping_address TEXT,
  shopee_tracking_code TEXT,
  pickup_store_id TEXT,
  city TEXT,
  district TEXT,
  zip_code TEXT,
  shipping_method TEXT,
  fulfillment_method TEXT,
  payment_method TEXT,
  buyer_note TEXT,
  seller_note TEXT,
  -- 系統
  internal_status TEXT DEFAULT 'pending',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopee_orders_number ON shopee_orders (shopee_order_number);

-- 蝦皮訂單明細
CREATE TABLE IF NOT EXISTS shopee_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_order_id UUID NOT NULL REFERENCES shopee_orders(id) ON DELETE CASCADE,
  shopee_product_name TEXT,
  shopee_product_id TEXT,
  shopee_variation_name TEXT,
  shopee_variation_id TEXT,
  shopee_sku_code TEXT,
  original_price NUMERIC,
  sale_price NUMERIC,
  quantity INTEGER DEFAULT 1,
  return_quantity INTEGER DEFAULT 0,
  -- 系統對應
  matched_package_id UUID,
  matched_plan_id UUID,
  matched_copies TEXT,
  bc_sku_id TEXT,
  -- 下單
  iccid JSONB,
  bc_order_id TEXT,
  bc_sub_order_id TEXT,
  status TEXT DEFAULT 'pending',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopee_items_order ON shopee_order_items (shopee_order_id);
CREATE INDEX IF NOT EXISTS idx_shopee_items_sku ON shopee_order_items (shopee_sku_code);

-- 商品對應記錄
CREATE TABLE IF NOT EXISTS shopee_product_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_sku_code TEXT UNIQUE NOT NULL,
  shopee_product_id TEXT,
  shopee_variation_id TEXT,
  shopee_product_name TEXT,
  shopee_variation_name TEXT,
  package_id UUID REFERENCES packages(id),
  package_plan_id UUID,
  copies TEXT,
  bc_sku_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopee_mappings_sku ON shopee_product_mappings (shopee_sku_code);
