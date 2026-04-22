-- 手動新增的 ICCID（不屬於任何訂單，用於預先建檔/號段匯入）
CREATE TABLE IF NOT EXISTS manual_iccids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  iccid TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'sim',         -- 'sim' | 'esim'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_iccids_iccid ON manual_iccids (iccid);

COMMENT ON TABLE manual_iccids IS '手動新增的 ICCID 清單（未綁定訂單時的號段/預建檔）';
