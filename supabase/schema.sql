-- =====================================================
-- FLESIM C-END 資料庫 Schema
-- =====================================================

-- BC 同步的原始國家資料
CREATE TABLE IF NOT EXISTS bc_countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mcc TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  continent TEXT,
  flag_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- BC 同步的原始商品資料
CREATE TABLE IF NOT EXISTS bc_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  sales_method TEXT,             -- '0'-eSIM, '1'-SIM
  days INTEGER,
  capacity TEXT,
  high_flow_size TEXT,
  plan_type TEXT,                -- '0'-總量型, '1'-單日型
  "desc" TEXT,
  country_data JSONB,
  prices JSONB,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- FLESIM 自組商品
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  country_code TEXT NOT NULL,     -- ISO 3166-1 alpha-2
  country_name TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'esim',  -- 'esim' | 'sim'
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_country ON products (country_code);
CREATE INDEX idx_products_active ON products (is_active);

-- 日費套餐
CREATE TABLE IF NOT EXISTS daily_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  speed_label TEXT NOT NULL,          -- e.g. '1GB/日'
  daily_capacity_mb INTEGER NOT NULL, -- e.g. 1024
  price_per_day NUMERIC NOT NULL,     -- TWD
  bc_sku_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_daily_plans_product ON daily_plans (product_id);

-- 固定套餐
CREATE TABLE IF NOT EXISTS fixed_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                -- e.g. '5GB / 7天'
  capacity_gb NUMERIC NOT NULL,
  days INTEGER NOT NULL,
  price NUMERIC NOT NULL,             -- TWD
  bc_sku_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fixed_plans_product ON fixed_plans (product_id);

-- FLESIM 商品與 BC 商品的對應
CREATE TABLE IF NOT EXISTS product_bc_mapping (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bc_sku_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, bc_sku_id)
);

-- 會員
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY,                -- 與 Supabase Auth uid 一致
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  auth_provider TEXT DEFAULT 'email',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 訂單
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID REFERENCES members(id),
  email TEXT NOT NULL,
  order_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  total_amount NUMERIC NOT NULL,
  bc_order_id TEXT,
  payment_method TEXT,
  tappay_trade_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_member ON orders (member_id);
CREATE INDEX idx_orders_number ON orders (order_number);
CREATE INDEX idx_orders_bc ON orders (bc_order_id);

-- 訂單明細
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  plan_type TEXT NOT NULL,            -- 'daily' | 'fixed'
  plan_label TEXT NOT NULL,
  days INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  bc_sku_id TEXT NOT NULL,
  bc_sub_order_id TEXT,
  iccid TEXT[],
  plan_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- eSIM 設定檔
CREATE TABLE IF NOT EXISTS esim_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  iccid TEXT NOT NULL,
  qr_code_url TEXT,
  qr_code_data TEXT,
  sm_dp_address TEXT,
  activation_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_esim_profiles_item ON esim_profiles (order_item_id);
CREATE INDEX idx_esim_profiles_iccid ON esim_profiles (iccid);

-- 售後申請
CREATE TABLE IF NOT EXISTS after_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  order_item_id UUID REFERENCES order_items(id),
  member_id UUID NOT NULL REFERENCES members(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bc_after_sale_id TEXT,
  refund_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_after_sales_order ON after_sales (order_id);
CREATE INDEX idx_after_sales_member ON after_sales (member_id);

-- TapPay 付款記錄
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,
  tappay_trade_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments (order_id);

-- 交易匯率
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  currency TEXT NOT NULL UNIQUE,       -- e.g. 'CNY', 'USD'
  rate NUMERIC NOT NULL,               -- 1 TWD = X 外幣
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook 日誌（冪等處理）
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id TEXT UNIQUE NOT NULL,
  trade_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_logs_type ON webhook_logs (trade_type);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE esim_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE after_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 會員只能看自己的訂單
CREATE POLICY "Members can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = member_id);

-- 會員只能看自己訂單的明細
CREATE POLICY "Members can view own order items"
  ON order_items FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE member_id = auth.uid())
  );

-- 會員只能看自己的 eSIM
CREATE POLICY "Members can view own esim profiles"
  ON esim_profiles FOR SELECT
  USING (
    order_item_id IN (
      SELECT oi.id FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.member_id = auth.uid()
    )
  );

-- 會員只能看自己的售後申請
CREATE POLICY "Members can view own after sales"
  ON after_sales FOR SELECT
  USING (member_id = auth.uid());

-- 會員只能看自己的資料
CREATE POLICY "Members can view own profile"
  ON members FOR SELECT
  USING (id = auth.uid());

-- 商品相關表為公開讀取
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are publicly readable"
  ON products FOR SELECT USING (true);

ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Daily plans are publicly readable"
  ON daily_plans FOR SELECT USING (true);

ALTER TABLE fixed_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fixed plans are publicly readable"
  ON fixed_plans FOR SELECT USING (true);
