-- manual_iccids：新增 N002 / N003 通知的啟用/到期時間
ALTER TABLE manual_iccids
  ADD COLUMN IF NOT EXISTS activation_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_apn TEXT,
  ADD COLUMN IF NOT EXISTS activation_country_region TEXT,
  ADD COLUMN IF NOT EXISTS activation_sub_order_id TEXT,
  ADD COLUMN IF NOT EXISTS activation_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN manual_iccids.activation_start_time IS 'N002 startTime：數據啟用時間';
COMMENT ON COLUMN manual_iccids.activation_end_time IS 'N002/N003 endTime：到期時間（N003 會覆蓋為實際結束時間）';
COMMENT ON COLUMN manual_iccids.activation_apn IS 'N002 APN';
COMMENT ON COLUMN manual_iccids.activation_country_region IS 'N002 countryRegion（MCC 或國家碼）';
COMMENT ON COLUMN manual_iccids.activation_sub_order_id IS 'N002/N003 subOrderId（最後一次套餐）';
COMMENT ON COLUMN manual_iccids.activation_updated_at IS '最後一次 N002/N003 更新時間';
