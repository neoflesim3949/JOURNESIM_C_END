-- 發票字軌主檔（營業人自行管理字軌時使用）
CREATE TABLE IF NOT EXISTS invoice_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 字軌
  track_prefix TEXT NOT NULL, -- 英文 2 碼，如 BP、ZL、HG
  period_year INT NOT NULL,   -- 民國年（如 115）
  period_start_month INT NOT NULL, -- 1 / 3 / 5 / 7 / 9 / 11
  period_end_month INT NOT NULL,   -- 2 / 4 / 6 / 8 / 10 / 12

  -- 號碼範圍（8 碼數字）
  start_number BIGINT NOT NULL,
  end_number BIGINT NOT NULL,
  next_number BIGINT NOT NULL, -- 下一個要使用的號碼

  -- 適用條件（用以挑選當前 active 字軌）
  intype TEXT, -- 07 / 08
  tax_type TEXT, -- 1 / 2 / 3 / 4 / 9
  buyer_type TEXT, -- B2C / B2B / 都可（null）

  -- 狀態
  is_active BOOLEAN NOT NULL DEFAULT false, -- 同條件僅一組 active
  is_exhausted BOOLEAN GENERATED ALWAYS AS (next_number > end_number) STORED,

  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT chk_range CHECK (start_number <= end_number),
  CONSTRAINT chk_next CHECK (next_number >= start_number)
);

CREATE INDEX IF NOT EXISTS idx_invoice_tracks_active ON invoice_tracks(is_active, period_year, period_start_month);
CREATE INDEX IF NOT EXISTS idx_invoice_tracks_prefix ON invoice_tracks(track_prefix);

COMMENT ON TABLE invoice_tracks IS '發票字軌主檔 — 我方自管時的字軌號碼池';
COMMENT ON COLUMN invoice_tracks.next_number IS '下一個要分配的號碼。next_number > end_number 即為用完';
