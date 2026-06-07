-- 商品對應 V2：蝦皮商品/選項主檔 + 對應億點(BC) + 加價規則 + 匯出原格式
-- 與現有「商品對應」(shopee_product_mappings / *_id_mappings) 並存，互不影響

-- A. 加價規則（每個蝦皮帳號一筆）
CREATE TABLE IF NOT EXISTS shopee_pricing_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL UNIQUE REFERENCES shopee_accounts(id) ON DELETE CASCADE,
  multiplier  NUMERIC NOT NULL DEFAULT 1,      -- 倍率，例如 1.3
  add_amount  NUMERIC NOT NULL DEFAULT 0,      -- 加固定金額 (TWD)
  rounding    TEXT NOT NULL DEFAULT 'ceil',    -- ceil / round / floor / none
  round_to    NUMERIC NOT NULL DEFAULT 1,      -- 進位單位，1=到元，可填 10 進位到十位
  updated_at  TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE shopee_pricing_rules IS '商品對應V2：每個蝦皮帳號的售價加價規則（成本×倍率+固定金額，依 rounding/round_to 進位）';

-- B. 匯入批次（保存蝦皮原始 Excel 結構，供匯出逐字還原、只改價格）
CREATE TABLE IF NOT EXISTS shopee_import_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
  file_name   TEXT,
  raw_aoa     JSONB NOT NULL,    -- 整張 sheet 的 array-of-arrays（含表頭/灰色說明列/所有資料列，逐字）
  header      JSONB NOT NULL,    -- 表頭列字串陣列
  col_index   JSONB NOT NULL,    -- {"商品選項ID":2,"價格":6,...} 0-based 欄位索引
  header_row  INT NOT NULL DEFAULT 0,
  note_row    INT,               -- 灰色說明列索引；資料從 note_row+1（或 header_row+1）起
  sheet_name  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopee_import_batches_account ON shopee_import_batches(account_id, created_at DESC);
COMMENT ON TABLE shopee_import_batches IS '商品對應V2：蝦皮批量上傳 Excel 的原始結構快照，匯出時逐字還原只覆蓋價格欄';

-- C. 蝦皮選項主檔（每個選項一列，核心表）
CREATE TABLE IF NOT EXISTS shopee_product_options_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
  batch_id              UUID REFERENCES shopee_import_batches(id) ON DELETE SET NULL,
  shopee_product_id     TEXT,
  shopee_product_name   TEXT,
  shopee_variation_id   TEXT NOT NULL,
  shopee_variation_name TEXT,
  main_sku_code         TEXT,        -- 主商品貨號
  variation_sku_code    TEXT,        -- 商品選項貨號
  original_price        NUMERIC,     -- 匯入當下 Excel 的「價格」欄（原蝦皮價格）
  raw_row_index         INT,         -- 在 batch.raw_aoa 的列索引（匯出回填定位）
  bc_sku_id             TEXT,        -- 對應 bc_products.sku_id
  copies                TEXT,        -- 對應的 copies
  price_override        NUMERIC,     -- 手動覆蓋售價(TWD)，NULL=用計算售價
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, shopee_variation_id)
);
CREATE INDEX IF NOT EXISTS idx_shopee_options_v2_account ON shopee_product_options_v2(account_id);
COMMENT ON TABLE shopee_product_options_v2 IS '商品對應V2：蝦皮選項主檔，每選項一列；對應 BC SKU+copies、可覆蓋售價。成本/售價/毛利不入庫，由匯率+bc_products 即時計算';
