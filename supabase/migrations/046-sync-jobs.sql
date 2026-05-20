-- 同步任務（背景化執行，分多個 step 完成以避開 Vercel 60 秒限制）
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,                          -- 'products' | 'countries'
  status TEXT NOT NULL DEFAULT 'running',      -- 'running' | 'completed' | 'failed'
  step_current INT NOT NULL DEFAULT 0,
  step_total INT NOT NULL,
  step_label TEXT,
  synced_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_type_created ON sync_jobs (type, created_at DESC);

NOTIFY pgrst, 'reload schema';
