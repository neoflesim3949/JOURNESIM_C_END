-- SKU 單號欄位
ALTER TABLE order_skus ADD COLUMN IF NOT EXISTS sku_number TEXT;
