-- 蝦皮帳號管理
CREATE TABLE IF NOT EXISTS shopee_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 訂單關聯帳號
ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS shopee_account_id UUID REFERENCES shopee_accounts(id);
CREATE INDEX IF NOT EXISTS idx_shopee_orders_account ON shopee_orders (shopee_account_id);

-- 金流結算關聯帳號
ALTER TABLE shopee_settlements ADD COLUMN IF NOT EXISTS shopee_account_id UUID REFERENCES shopee_accounts(id);
