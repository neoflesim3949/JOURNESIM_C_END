-- card_plans 存自己的「卡片狀態快照」：同步當下記下 F010 卡狀態。
-- 這樣統計同步的「要不要再撈」判斷用 card_plans 自己的 synced_at + 這份快照，
-- 與卡片管理（會自動把卡改失效、更新 manual_iccids）互不干擾。
ALTER TABLE card_plans ADD COLUMN IF NOT EXISTS card_status TEXT;
