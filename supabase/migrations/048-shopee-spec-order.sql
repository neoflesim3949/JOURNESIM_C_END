-- 商品對應 V2：規格選項自訂排序（數據量等），跟蝦皮一樣可拖曳排序
-- 依 帳號 + 商品 + 規格軸(spec_type) + 規格值 記住順序
CREATE TABLE IF NOT EXISTS shopee_spec_order (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  spec_type   TEXT NOT NULL DEFAULT 'data',   -- 'data'=數據量(規格1)，預留 'days'
  spec_value  TEXT NOT NULL,
  sort_index  INT NOT NULL DEFAULT 0,
  UNIQUE (account_id, product_id, spec_type, spec_value)
);
CREATE INDEX IF NOT EXISTS idx_shopee_spec_order_lookup ON shopee_spec_order(account_id, product_id, spec_type);
COMMENT ON TABLE shopee_spec_order IS '商品對應V2：規格選項自訂排序（可拖曳），依帳號+商品+規格軸記住順序';
