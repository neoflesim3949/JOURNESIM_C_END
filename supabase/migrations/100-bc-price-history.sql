-- 商品價格歷史：每次 BC 同步偵測到「價格變動」就記一筆（保留、不覆蓋）
-- 足以還原任意時間點的價格（未變動的期間沿用上一筆）
CREATE TABLE IF NOT EXISTS bc_price_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id          TEXT NOT NULL,
  name            TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  prices          JSONB,          -- 完整價格階（F003 price：copies / retailPrice / settlementPrice）
  cost_price      NUMERIC,        -- copies=1 結算價快照（採購成本）
  prev_cost_price NUMERIC         -- 前一次結算價（顯示漲跌用）
);
CREATE INDEX IF NOT EXISTS idx_bc_price_history_sku ON bc_price_history (sku_id, synced_at DESC);

-- 上下架比對增加「調價」統計（本次有幾個商品價格變動、清單）
ALTER TABLE bc_sync_diffs ADD COLUMN IF NOT EXISTS changed_count INT NOT NULL DEFAULT 0;
ALTER TABLE bc_sync_diffs ADD COLUMN IF NOT EXISTS changed JSONB;   -- [{sku_id, name, old_cost, new_cost}]

-- 以目前 bc_products 現價建立基準歷史（讓每個有價格的商品都有一筆起點，之後同步只在變動時追加）
INSERT INTO bc_price_history (sku_id, name, prices, cost_price, synced_at)
SELECT sku_id, name, prices, cost_price, COALESCE(updated_at, now())
FROM bc_products
WHERE prices IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM bc_price_history h WHERE h.sku_id = bc_products.sku_id);
