-- 增加二級分銷系統與點數機制

-- 1. 修改 members 表格，增加推薦與點數欄位
ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS points NUMERIC DEFAULT 0;

-- 2. 建立推薦關係日誌表 (Referral Logs)
CREATE TABLE IF NOT EXISTS referral_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    l1_referrer_id UUID REFERENCES members(id) ON DELETE SET NULL,
    l2_referrer_id UUID REFERENCES members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id) -- 一個用戶只能被綁定一次
);

-- 3. 建立點數交易日誌表 (Point Logs)
CREATE TABLE IF NOT EXISTS point_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    source_order_id UUID, -- 關聯訂單 ID (來自訂單表，如果是首購或分潤)
    amount NUMERIC NOT NULL,
    point_type TEXT NOT NULL CHECK (point_type IN ('signup', 'first_buy', 'l1_commission', 'l2_commission', 'clawback', 'redeem')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'void')),
    available_at TIMESTAMPTZ, -- 點數預計解凍時間
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 索引優化
CREATE INDEX IF NOT EXISTS idx_members_referral_code ON members(referral_code);
CREATE INDEX IF NOT EXISTS idx_point_logs_member_id ON point_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_source_order_id ON point_logs(source_order_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_status ON point_logs(status);
CREATE INDEX IF NOT EXISTS idx_referral_logs_user_id ON referral_logs(user_id);
