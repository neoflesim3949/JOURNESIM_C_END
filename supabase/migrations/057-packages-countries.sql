-- 套餐關聯國家（MCC 陣列，手動多選；用來篩 APN/電信商 只看這些國家）
ALTER TABLE packages ADD COLUMN IF NOT EXISTS countries JSONB;  -- 例 ["JP","KR"]

-- APN / 電信商 快照（點「撈」時計算並存起來，之後直接讀，不每次重算）
ALTER TABLE packages ADD COLUMN IF NOT EXISTS apns JSONB;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS operators JSONB;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS apn_synced_at TIMESTAMPTZ;
