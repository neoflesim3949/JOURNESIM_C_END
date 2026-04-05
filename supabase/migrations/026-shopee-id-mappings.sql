-- 蝦皮商品ID對應名稱
CREATE TABLE IF NOT EXISTS shopee_product_id_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_product_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 蝦皮規格ID對應名稱
CREATE TABLE IF NOT EXISTS shopee_variation_id_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_variation_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 訂單明細增加使用期限
ALTER TABLE shopee_order_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
