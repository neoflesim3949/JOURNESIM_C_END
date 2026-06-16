-- 每次商品同步（F002）的上下架比對紀錄
CREATE TABLE IF NOT EXISTS bc_sync_diffs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope         TEXT NOT NULL DEFAULT 'products',
  bc_count      INT,                 -- 本次 BC 回傳的商品數
  db_count      INT,                 -- 同步前本地商品數
  added_count   INT NOT NULL DEFAULT 0,
  removed_count INT NOT NULL DEFAULT 0,
  added         JSONB,               -- [{sku_id, name}]（新上架）
  removed       JSONB,               -- [{sku_id, name}]（已下架）
  applied_removal BOOLEAN NOT NULL DEFAULT true, -- 是否真的把下架商品標記為停用（安全保護未通過時為 false）
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_bc_sync_diffs_synced_at ON bc_sync_diffs (synced_at DESC);

-- 商品下架時間（不刪資料，只標記）。is_active 欄位已存在（001 migration）
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS delisted_at TIMESTAMPTZ;
