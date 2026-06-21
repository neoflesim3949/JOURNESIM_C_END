-- 060: V2 選項是否上架（下架時匯出改價檔庫存=0，其餘固定 10000）
ALTER TABLE shopee_product_options_v2 ADD COLUMN IF NOT EXISTS is_listed BOOLEAN DEFAULT true;
COMMENT ON COLUMN shopee_product_options_v2.is_listed IS '是否上架；下架(false)匯出庫存為0，上架固定10000';
