-- 蝦皮金流結算（每筆訂單一行，從金流 Excel 匯入）
CREATE TABLE IF NOT EXISTS shopee_settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_order_number TEXT NOT NULL,
  shopee_order_id UUID REFERENCES shopee_orders(id) ON DELETE SET NULL,
  refund_number TEXT,
  buyer_account TEXT,
  order_date TEXT,
  payment_method TEXT,
  wallet_date TEXT,
  original_price NUMERIC,
  promo_discount NUMERIC,
  refund_amount NUMERIC,
  shopee_subsidy NUMERIC,
  seller_coupon NUMERIC,
  seller_coin_cashback NUMERIC,
  buyer_shipping_fee NUMERIC,
  shopee_shipping_subsidy NUMERIC,
  shopee_paid_shipping NUMERIC,
  return_shipping_fee NUMERIC,
  installment_periods TEXT,
  processing_rate TEXT,
  ams_fee NUMERIC,
  transaction_fee NUMERIC,
  other_service_fee NUMERIC,
  processing_fee NUMERIC,
  wallet_amount NUMERIC,
  payment_source TEXT,
  promo_code TEXT,
  damage_compensation NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopee_settlements_order ON shopee_settlements (shopee_order_number);
CREATE INDEX IF NOT EXISTS idx_shopee_settlements_order_id ON shopee_settlements (shopee_order_id);
