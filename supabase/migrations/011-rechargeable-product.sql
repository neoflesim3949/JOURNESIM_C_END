-- 加入 rechargeable_product 欄位，用於判斷 type=NULL 但屬於 eSIM 的商品
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS rechargeable_product text;
