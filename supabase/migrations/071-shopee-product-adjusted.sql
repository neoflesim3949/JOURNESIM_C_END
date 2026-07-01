-- 071: 商品對應 V2 每個商品「已調整」時間（手動標記）
CREATE TABLE IF NOT EXISTS shopee_product_adjusted (
  account_id        UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
  shopee_product_id TEXT NOT NULL,
  adjusted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, shopee_product_id)
);
