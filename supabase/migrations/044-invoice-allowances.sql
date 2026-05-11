-- 發票折讓單記錄
CREATE TABLE IF NOT EXISTS invoice_allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  allowance_number TEXT NOT NULL UNIQUE,
  allowance_date DATE NOT NULL,
  allowance_type TEXT NOT NULL DEFAULT '2', -- 1=買方開立, 2=賣方開立

  -- 折讓明細
  items JSONB NOT NULL,
  total_sales NUMERIC NOT NULL, -- 折讓銷售額（未稅合計）
  total_tax NUMERIC NOT NULL, -- 折讓稅金合計
  total_amount NUMERIC NOT NULL, -- 折讓含稅總計

  status TEXT NOT NULL DEFAULT 'active', -- active / cancelled
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  smse_raw_response TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_allowances_invoice_id ON invoice_allowances(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allowances_date ON invoice_allowances(allowance_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_allowances_status ON invoice_allowances(status);

COMMENT ON TABLE invoice_allowances IS '電子發票折讓單記錄';
COMMENT ON COLUMN invoice_allowances.allowance_type IS '1=買方開立 / 2=賣方開立';
