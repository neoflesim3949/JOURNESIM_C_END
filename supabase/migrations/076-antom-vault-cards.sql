-- Antom 卡片綁定（Vaulting / Tokenized Payment）：沿用 member_cards 存 Antom cardToken
-- TapPay 有 card_key，Antom 沒有 → 放寬為可空；以 provider 區分兩家
ALTER TABLE member_cards ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'tappay';
ALTER TABLE member_cards ALTER COLUMN card_key DROP NOT NULL;
ALTER TABLE member_cards ADD COLUMN IF NOT EXISTS exp_month TEXT;
ALTER TABLE member_cards ADD COLUMN IF NOT EXISTS exp_year TEXT;

CREATE INDEX IF NOT EXISTS idx_member_cards_provider ON member_cards (member_id, provider);

-- 綁卡請求對照：createVaultingSession 時記下 vaultingRequestId ↔ member，
-- 之後 notifyVaulting 只帶 vaultingRequestId + cardToken，用這張表回填是哪位會員
CREATE TABLE IF NOT EXISTS antom_vaulting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaulting_request_id TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending / success / fail
  card_id UUID REFERENCES member_cards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_antom_vaulting_member ON antom_vaulting_requests (member_id);
