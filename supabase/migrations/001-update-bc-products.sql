-- 擴充 bc_products 表欄位以匹配完整 BC F002 資料
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS limit_flow_speed TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS hotspot_support TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS acceleration_support TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS apply_to_device TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS apply_to_device_type JSONB;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS point_contact_type TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS point_contact_hours TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS time_zone TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS usage_count TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS operator_info TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS refund_policy TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS speed_limit_rule TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS validity_period TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS cost_price NUMERIC;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS desc_en TEXT;
