-- 儲存通路訂單號（用於售後 F017）
ALTER TABLE shopee_order_items ADD COLUMN IF NOT EXISTS bc_channel_order_id TEXT;
ALTER TABLE shopee_order_items ADD COLUMN IF NOT EXISTS bc_channel_sub_order_id TEXT;
