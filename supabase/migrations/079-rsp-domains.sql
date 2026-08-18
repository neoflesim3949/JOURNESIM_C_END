-- RSP 管理：rspN.flesim.com 子網域 → 目標 RSP 主機（SM-DP+ 位址品牌化，動態可管理）
CREATE TABLE IF NOT EXISTS rsp_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subdomain TEXT UNIQUE NOT NULL,        -- 'rsp' / 'rsp1' / 'rsp2' ...（完整主機 = {subdomain}.flesim.com）
  target_host TEXT NOT NULL,             -- 目標 RSP 主機，如 rsp.billionconnect.com
  is_active BOOLEAN DEFAULT true,        -- 停用時 /gsma/* 回退預設主機
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 收到的 RSP 協定請求全紀錄（middleware 寫入）
CREATE TABLE IF NOT EXISTS rsp_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subdomain TEXT,                        -- 打進來的子網域
  path TEXT,                             -- /gsma/... 完整路徑＋query
  user_agent TEXT,
  target_host TEXT,                      -- 當下轉去的目標
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rsp_requests_sub ON rsp_requests (subdomain, created_at);

-- 預設種子：現行 rsp → BC
INSERT INTO rsp_domains (subdomain, target_host, note)
VALUES ('rsp', 'rsp.billionconnect.com', 'BC 預設 RSP')
ON CONFLICT (subdomain) DO NOTHING;

COMMENT ON TABLE rsp_domains IS 'RSP 子網域轉址對應（middleware 動態查表）';
