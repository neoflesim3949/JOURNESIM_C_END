-- 跨帳號「對應主檔」：使用者自建的庫存主商品，用主商品貨號把各帳號的 V2 選項拉進來比對
CREATE TABLE IF NOT EXISTS shopee_coverage_masters (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_name TEXT NOT NULL,            -- 庫存商品名稱（自行命名）
  main_sku_code  TEXT NOT NULL,            -- 主商品貨號（比對 key，對應 V2.main_sku_code）
  note           TEXT,
  sort_index     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_masters_sku ON shopee_coverage_masters (main_sku_code);
