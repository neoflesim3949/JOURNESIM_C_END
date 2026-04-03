-- 訂單成本追蹤：在下單時記錄當時的商品成本價，以確保利潤統計精確
ALTER TABLE order_skus ADD COLUMN IF NOT EXISTS cost_price NUMERIC;

COMMENT ON COLUMN order_skus.cost_price IS '下單時的商品成本價 (TWD)';
