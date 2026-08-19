-- 統計方案同步的「獨立狀態」表：每張卡「嘗試過就記一筆」（不管有沒有方案），讓「同步全部」能收斂。
-- 原因：card_status=0（已開卡）但未訂購方案的卡，F012 回空、不會進 card_plans，
--       若只靠 card_plans 判斷「撈過沒」，這些卡會被當「從沒撈過」每次重複撈、卡住進度。
--   - 與卡片管理（manual_iccids）脫鉤：不寫它的欄位
--   - 用 synced_at 判斷 12h 內不重撈；plan_count 記方案數（0=已開卡沒方案）
CREATE TABLE IF NOT EXISTS card_plan_sync_state (
  iccid TEXT PRIMARY KEY,
  synced_at TIMESTAMPTZ DEFAULT now(),
  plan_count INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cpss_synced ON card_plan_sync_state (synced_at);

-- 回填：已在 card_plans 的卡先補一筆狀態（避免它們被當「從沒撈過」）
INSERT INTO card_plan_sync_state (iccid, synced_at, plan_count)
SELECT iccid, max(synced_at), count(*) FROM card_plans GROUP BY iccid
ON CONFLICT (iccid) DO NOTHING;
