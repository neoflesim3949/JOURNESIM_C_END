-- manual_iccids：新增 BC F012 套餐使用狀況快取欄位
ALTER TABLE manual_iccids
  ADD COLUMN IF NOT EXISTS plan_status TEXT,
  ADD COLUMN IF NOT EXISTS plan_unused BOOLEAN,
  ADD COLUMN IF NOT EXISTS plan_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN manual_iccids.plan_status IS 'BC F012: 套餐使用狀態摘要（去重逗號串，0=未使用 1=使用中 2=已用完 3=已過期 4=已退訂）';
COMMENT ON COLUMN manual_iccids.plan_unused IS 'BC F012: 是否有未使用套餐（任一 subOrder planStatus=0）';
COMMENT ON COLUMN manual_iccids.plan_synced_at IS 'BC F012 最後同步時間';

-- 供「近七天到期未使用」查詢加速
CREATE INDEX IF NOT EXISTS idx_manual_iccids_plan_unused
  ON manual_iccids (plan_unused, expiration_date);
