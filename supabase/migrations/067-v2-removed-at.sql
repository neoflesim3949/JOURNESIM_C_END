-- 067: V2 選項「蝦皮已刪除」標記。重新匯入蝦皮表時，若該商品仍在但選項ID不見了，代表蝦皮端刪除→標紅
ALTER TABLE shopee_product_options_v2 ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
COMMENT ON COLUMN shopee_product_options_v2.removed_at IS '蝦皮端已刪除此選項（重新匯入時該商品仍在但缺此選項ID）；null=正常';
