-- 會員手動新增的 ICCID（不與訂單綁定）
CREATE TABLE IF NOT EXISTS member_iccids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  iccid TEXT NOT NULL,
  card_type TEXT NOT NULL DEFAULT 'esim',
  nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, iccid)
);

CREATE INDEX IF NOT EXISTS idx_member_iccids_member ON member_iccids (member_id);
