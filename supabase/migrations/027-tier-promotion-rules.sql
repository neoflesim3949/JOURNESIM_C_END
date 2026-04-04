-- 更新會員等級表，增加自動晉升門檻
ALTER TABLE member_tiers ADD COLUMN IF NOT EXISTS min_order_count INT DEFAULT 0;
ALTER TABLE member_tiers ADD COLUMN IF NOT EXISTS min_yearly_spend NUMERIC DEFAULT 0;

-- 更新預設門檻
-- 白銀：註冊即刻 (0/0)
-- 黃金：累積 5 筆訂單 或 年消費 $2,000
-- 鑽石：累積 20 筆訂單 或 年消費 $10,000
UPDATE member_tiers SET min_order_count = 0, min_yearly_spend = 0 WHERE name = '白銀會員';
UPDATE member_tiers SET min_order_count = 5, min_yearly_spend = 2000 WHERE name = '黃金會員';
UPDATE member_tiers SET min_order_count = 20, min_yearly_spend = 10000 WHERE name = '鑽石會員';
