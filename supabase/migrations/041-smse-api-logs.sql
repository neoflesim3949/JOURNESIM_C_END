-- 速買配（SmilePay / smse）電子發票 API 呼叫紀錄
CREATE TABLE IF NOT EXISTS smse_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_type TEXT NOT NULL, -- issue / allowance / modify(cancel/void/cancel_allowance)
  endpoint TEXT, -- 完整 URL
  request_body JSONB,
  response_body JSONB,
  response_raw TEXT, -- 速買配回應為 XML，原始字串也存
  status TEXT, -- success / error
  smse_status_code TEXT, -- 速買配 Status 欄位
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smse_api_logs_created_at ON smse_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smse_api_logs_api_type ON smse_api_logs(api_type);
CREATE INDEX IF NOT EXISTS idx_smse_api_logs_status ON smse_api_logs(status);
