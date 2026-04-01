-- 會員儲存的信用卡（Pay by Token）
CREATE TABLE IF NOT EXISTS member_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  card_token TEXT NOT NULL,
  card_key TEXT NOT NULL,
  last_four TEXT NOT NULL,        -- 卡號後四碼
  bin_code TEXT,                  -- 卡號前六碼
  card_type TEXT,                 -- visa / mastercard / jcb
  issuer TEXT,                    -- 發卡行
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, card_token)
);

CREATE INDEX IF NOT EXISTS idx_member_cards_member ON member_cards (member_id);

ALTER TABLE member_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view own cards" ON member_cards FOR SELECT USING (member_id = auth.uid());
