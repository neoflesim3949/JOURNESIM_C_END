-- 商品明細增加成本價（下單時記錄）
ALTER TABLE shopee_order_items ADD COLUMN IF NOT EXISTS cost_cny NUMERIC;
ALTER TABLE shopee_order_items ADD COLUMN IF NOT EXISTS cost_twd NUMERIC;
