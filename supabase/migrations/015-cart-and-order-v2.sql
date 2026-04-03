-- =====================================================
-- 購物車 + 三層式訂單架構
-- L1: 主訂單 (orders) - 支付資訊
-- L2: 子訂單 (sub_orders) - 按 eSIM/SIM 拆分
-- L3: SKU 單號 (order_skus) - 按 SKU+copies 拆分
-- =====================================================

-- L2: 子訂單（按商品物理性質拆分）
CREATE TABLE IF NOT EXISTS sub_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sub_order_number TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('esim', 'sim')),
  status TEXT NOT NULL DEFAULT 'pending',
  -- eSIM: pending → processing → completed
  -- SIM: pending → awaiting_card → card_assigned → shipping → completed
  bc_order_id TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tracking_number TEXT,        -- SIM 物流追蹤號
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sub_orders_order ON sub_orders (order_id);
CREATE INDEX idx_sub_orders_number ON sub_orders (sub_order_number);

-- L3: SKU 單號（每一個發貨單位）
CREATE TABLE IF NOT EXISTS order_skus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_order_id UUID NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
  bc_sku_id TEXT NOT NULL,
  bc_sku_name TEXT,
  package_plan_id TEXT,        -- 對應 package_plans.id
  copies TEXT NOT NULL,
  days INTEGER,
  unit_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal NUMERIC NOT NULL,
  -- eSIM 交付資訊
  iccid TEXT,
  qr_code_url TEXT,
  qr_code_data TEXT,
  lpa_code TEXT,
  -- SIM 交付資訊
  sim_iccid TEXT,              -- 管理員回填的實體卡 ICCID
  bc_sub_order_id TEXT,        -- BC API 回傳的子訂單號
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_order_skus_sub ON order_skus (sub_order_id);

-- 主訂單新增欄位
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cart_items JSONB;

-- RLS
ALTER TABLE sub_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own sub_orders" ON sub_orders FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE member_id = auth.uid()));

CREATE POLICY "Members can view own order_skus" ON order_skus FOR SELECT
  USING (sub_order_id IN (
    SELECT so.id FROM sub_orders so
    JOIN orders o ON o.id = so.order_id
    WHERE o.member_id = auth.uid()
  ));
