-- TapPay 金流 API log（對照 antom_api_logs / bc_api_logs）：留底每一次對 TapPay 的請求/回應與 webhook 通知
-- 敏感欄位（partner_key / prime / card_token / card_key / card_secret）於寫入前已遮罩，不落地。
CREATE TABLE IF NOT EXISTS tappay_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,                          -- payByPrime / payByToken / notify
  endpoint TEXT,                                 -- 實際呼叫路徑
  direction TEXT NOT NULL DEFAULT 'outgoing',    -- outgoing=我們發送, incoming=webhook 收到
  order_number TEXT,                             -- 對應商家訂單號，便於追訂單
  trade_id TEXT,                                 -- TapPay rec_trade_id
  request_body JSONB,
  response_body JSONB,
  status TEXT,                                   -- success / error
  tappay_status TEXT,                            -- TapPay status（0=成功，其餘失敗）
  error_message TEXT,                            -- TapPay msg / 例外訊息
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tappay_api_logs_created_at ON tappay_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tappay_api_logs_action ON tappay_api_logs(action);
CREATE INDEX IF NOT EXISTS idx_tappay_api_logs_order ON tappay_api_logs(order_number);
