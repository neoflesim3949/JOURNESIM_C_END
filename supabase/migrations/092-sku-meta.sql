-- SKU 末端標註（我們自己定義的屬性，例如「吃到飽」）
CREATE TABLE IF NOT EXISTS sku_meta (
  sku_id TEXT PRIMARY KEY,
  sku_name TEXT,
  is_unlimited BOOLEAN DEFAULT FALSE,   -- 是否為「吃到飽」產品（計算日均量分群用）
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sku_meta IS 'SKU 末端標註（吃到飽等），供日均量等統計分群';
