-- Antom 金流 API log（對照 bc_api_logs）：留底每一次對 Antom 的請求/回應與 webhook 通知
CREATE TABLE IF NOT EXISTS antom_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,                          -- createPaymentSession / pay / inquiryPayment / refund / notifyPayment
  endpoint TEXT,                                 -- 實際呼叫路徑
  direction TEXT NOT NULL DEFAULT 'outgoing',    -- outgoing=我們發送, incoming=webhook 收到
  order_number TEXT,                             -- 對應商家訂單號（paymentRequestId），便於追訂單
  payment_id TEXT,                               -- Antom paymentId
  request_body JSONB,
  response_body JSONB,
  status TEXT,                                   -- success / error
  result_status TEXT,                            -- Antom resultStatus（S/U/F…）
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_antom_api_logs_created_at ON antom_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_antom_api_logs_action ON antom_api_logs(action);
CREATE INDEX IF NOT EXISTS idx_antom_api_logs_order ON antom_api_logs(order_number);
