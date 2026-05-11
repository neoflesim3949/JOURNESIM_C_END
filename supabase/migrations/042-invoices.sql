-- 速買配電子發票主檔（每張開立成功的發票寫一筆）
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 發票識別
  invoice_number TEXT NOT NULL UNIQUE,
  random_number TEXT,
  invoice_date DATE NOT NULL,
  invoice_time TIME,
  invoice_type TEXT, -- 速買配回應的 InvoiceType: B2C / B2C2B / B2B / B2G
  buyer_type TEXT NOT NULL, -- 我們送出時設定: B2C / B2B / B2G

  -- 稅率
  intype TEXT, -- 07 / 08
  tax_type TEXT, -- 1/2/3/4/9
  tax_rate NUMERIC,

  -- 買受人
  buyer_id TEXT, -- 統編
  buyer_name TEXT, -- 個人姓名
  buyer_company TEXT, -- 公司名稱
  buyer_address TEXT,
  buyer_phone TEXT,
  buyer_email TEXT,

  -- 捐贈 / 載具
  donate BOOLEAN DEFAULT false,
  love_key TEXT,
  carrier_type TEXT,
  carrier_id TEXT,

  -- 備註與自訂編號
  main_remark TEXT,
  certificate_remark TEXT,
  relate_number TEXT,
  visa_last4 TEXT,
  data_id TEXT,
  orderid TEXT,

  -- 商品明細（保留結構化以利顯示）
  items JSONB NOT NULL,
  total_sales NUMERIC, -- 銷售額（未稅）
  total_tax NUMERIC, -- 營業稅
  total_amount NUMERIC NOT NULL, -- 含稅總計（= AllAmount）

  -- 狀態
  status TEXT NOT NULL DEFAULT 'issued', -- issued / cancelled / voided
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  allowance_amount NUMERIC DEFAULT 0, -- 已折讓累計

  -- 原始回應
  smse_raw_response TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_type ON invoices(buyer_type);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_id ON invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_orderid ON invoices(orderid);

COMMENT ON TABLE invoices IS '速買配電子發票主檔';
COMMENT ON COLUMN invoices.status IS 'issued=開立完成 / cancelled=作廢 / voided=註銷';
COMMENT ON COLUMN invoices.invoice_type IS '速買配回應：B2C/B2C2B/B2B/B2G';
COMMENT ON COLUMN invoices.allowance_amount IS '累計折讓金額（每次折讓會累加）';
