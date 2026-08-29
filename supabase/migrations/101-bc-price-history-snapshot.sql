-- 價格歷史改為「每次同步全量快照」：每列連到那次同步（sync_id → bc_sync_diffs.id），
-- 並存前一次的完整價格階，方便顯示該次的變價（舊→新）
ALTER TABLE bc_price_history ADD COLUMN IF NOT EXISTS sync_id UUID;
ALTER TABLE bc_price_history ADD COLUMN IF NOT EXISTS prev_prices JSONB;
CREATE INDEX IF NOT EXISTS idx_bc_price_history_sync ON bc_price_history (sync_id);
