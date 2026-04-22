-- manual_iccids：新增 BC F010 查詢結果快取欄位
ALTER TABLE manual_iccids
  ADD COLUMN IF NOT EXISTS card_type TEXT,
  ADD COLUMN IF NOT EXISTS card_status TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date TEXT,
  ADD COLUMN IF NOT EXISTS postponed_month TEXT,
  ADD COLUMN IF NOT EXISTS max_delay_month TEXT,
  ADD COLUMN IF NOT EXISTS usage_count TEXT,
  ADD COLUMN IF NOT EXISTS support_upgrade_multi_card TEXT,
  ADD COLUMN IF NOT EXISTS bc_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN manual_iccids.card_type IS 'BC F010: 卡類型（1=單次卡, 2=多次卡, 3=月租卡）';
COMMENT ON COLUMN manual_iccids.card_status IS 'BC F010: 狀態（1=有效, 2=失效, 3=已註銷）';
COMMENT ON COLUMN manual_iccids.expiration_date IS 'BC F010: 有效期截止日期';
COMMENT ON COLUMN manual_iccids.postponed_month IS 'BC F010: 已延期月數';
COMMENT ON COLUMN manual_iccids.max_delay_month IS 'BC F010: 最大可延期月數';
COMMENT ON COLUMN manual_iccids.usage_count IS 'BC F010: 充值次數';
COMMENT ON COLUMN manual_iccids.bc_synced_at IS 'BC F010 最後同步時間';
