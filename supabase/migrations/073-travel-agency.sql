-- 旅行社服務專區：旅行社 / 人員 / 登入 session / 團 / 團可選方案 / 團員 / 結算
-- 這些表僅透過 service role（admin client）存取，不開 RLS。

-- 旅行社
CREATE TABLE IF NOT EXISTS travel_agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  logo_url TEXT,                                  -- 團員頁顯示的旅行社 logo
  status TEXT NOT NULL DEFAULT 'active',          -- active | disabled
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 旅行社人員（業務）
CREATE TABLE IF NOT EXISTS travel_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES travel_agencies(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                    -- scrypt：salt:hash
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'sales',             -- manager | sales
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_travel_staff_agency ON travel_staff(agency_id);

-- 登入 session（憑 cookie token）
CREATE TABLE IF NOT EXISTS travel_sessions (
  token TEXT PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES travel_staff(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES travel_agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_travel_sessions_staff ON travel_sessions(staff_id);

-- 團
CREATE TABLE IF NOT EXISTS tour_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES travel_agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  depart_date DATE,
  return_date DATE,
  countries JSONB NOT NULL DEFAULT '[]',          -- 途經國家
  base_is_free BOOLEAN NOT NULL DEFAULT false,
  base_sim_plan_id UUID,                          -- → tour_group_plans.id
  base_esim_plan_id UUID,                         -- → tour_group_plans.id
  created_by UUID REFERENCES travel_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tour_groups_agency ON tour_groups(agency_id);

-- 團可選方案（旅行社把 /admin/packages 的方案拉進團並設售價）
CREATE TABLE IF NOT EXISTS tour_group_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES tour_groups(id) ON DELETE CASCADE,
  package_id UUID,                                -- packages.id
  package_plan_id UUID,                           -- package_plans.id（實際 BC sku）
  bc_sku_id TEXT,
  copies TEXT,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL,                        -- sim | esim
  suggested_price NUMERIC,                        -- 建議售價（=package_plan_prices.sell_price 快照）
  agency_price NUMERIC,                           -- 旅行社售價（≤ 建議售價）
  our_cost NUMERIC,                               -- 旅行社成本快照（TWD）
  sort_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tour_group_plans_group ON tour_group_plans(group_id);

-- 團員
CREATE TABLE IF NOT EXISTS tour_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES tour_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  token TEXT NOT NULL UNIQUE,                     -- 專屬連結
  chosen_plan_id UUID,                            -- tour_group_plans.id
  online_charge NUMERIC DEFAULT 0,               -- 線上實收（折後）
  our_cost_snapshot NUMERIC DEFAULT 0,
  agency_profit NUMERIC DEFAULT 0,
  pay_status TEXT NOT NULL DEFAULT 'unpaid',      -- unpaid | paid | free
  paid_at TIMESTAMPTZ,
  email TEXT,                                     -- eSIM 寄送信箱
  is_member BOOLEAN DEFAULT false,               -- 是否註冊/登入綁定
  coupon_code TEXT,
  discount NUMERIC DEFAULT 0,
  issued BOOLEAN NOT NULL DEFAULT false,
  iccid TEXT,                                     -- SIM 指派的卡號 / eSIM 識別
  esim_qr TEXT,
  issued_by UUID REFERENCES travel_staff(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tour_members_group ON tour_members(group_id);
CREATE INDEX IF NOT EXISTS idx_tour_members_token ON tour_members(token);

-- 結算「已結」狀態（金額由 tour_members 即時彙總）
CREATE TABLE IF NOT EXISTS travel_settlements (
  agency_id UUID NOT NULL REFERENCES travel_agencies(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                            -- YYYY-MM
  settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  PRIMARY KEY (agency_id, month)
);

-- 卡片分配給旅行社
ALTER TABLE manual_iccids
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES travel_agencies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_manual_iccids_agency ON manual_iccids(agency_id);
