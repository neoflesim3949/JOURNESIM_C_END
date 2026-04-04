-- 1. 建立會員等級與分潤比例表
CREATE TABLE IF NOT EXISTS member_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL, -- 鑽石會員, 黃金會員, 白銀會員
    l1_rate NUMERIC NOT NULL DEFAULT 0, -- 一級分潤上限 (例如 0.06)
    l2_rate NUMERIC NOT NULL DEFAULT 0, -- 二級分潤上限 (例如 0.03)
    sort_order INT DEFAULT 0, -- 用於等級排序 (銀 < 金 < 鑽)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 預設等級資料
INSERT INTO member_tiers (name, l1_rate, l2_rate, sort_order) VALUES
('白銀會員', 0.04, 0.01, 1),
('黃金會員', 0.05, 0.02, 2),
('鑽石會員', 0.06, 0.03, 3)
ON CONFLICT (name) DO UPDATE SET l1_rate = EXCLUDED.l1_rate, l2_rate = EXCLUDED.l2_rate;

-- 3. 為 members 增加等級關聯
ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES member_tiers(id) ON DELETE SET NULL;

-- 預設將現有用戶設為白銀會員 (如果有資料的話)
UPDATE members SET tier_id = (SELECT id FROM member_tiers WHERE name = '白銀會員') WHERE tier_id IS NULL;

-- 4. 索引優化
CREATE INDEX IF NOT EXISTS idx_members_tier_id ON members(tier_id);
