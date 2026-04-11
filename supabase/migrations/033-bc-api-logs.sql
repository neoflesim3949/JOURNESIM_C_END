CREATE TABLE IF NOT EXISTS bc_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outgoing', -- outgoing=我們發送, incoming=webhook收到
  request_body JSONB,
  response_body JSONB,
  status TEXT, -- success, error
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bc_api_logs_created_at ON bc_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bc_api_logs_trade_type ON bc_api_logs(trade_type);
