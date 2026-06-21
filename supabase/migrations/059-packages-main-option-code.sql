-- 059: 套餐主選項ID（用來生成可讀的選項貨號，如 JPIIJ → JPIIJ_D_1GB_256kb_1）
ALTER TABLE packages ADD COLUMN IF NOT EXISTS main_option_code TEXT;
COMMENT ON COLUMN packages.main_option_code IS '主選項ID，組成選項貨號：主選項ID_類型(D/T)_流量_限速_天數';
