-- 售後訂單：F017 售後成功後生成一筆，供訂單詳情顯示與儀表板統計當月退回成本
CREATE TABLE IF NOT EXISTS bc_aftersales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  after_sale_id TEXT,                    -- BC 售後單號
  channel_order_id TEXT NOT NULL,        -- 渠道主訂單號
  channel_sub_order_id TEXT,             -- 渠道子訂單號（單一子單時才有）
  shopee_order_id UUID REFERENCES shopee_orders(id) ON DELETE SET NULL,
  iccids JSONB,                          -- 退卡 ICCID 陣列
  card_count INTEGER DEFAULT 0,          -- 退卡張數
  reason TEXT,                           -- 原因代碼（20 無理由退訂 / 29 eSIM 未下載）
  refund_cny NUMERIC,                    -- 退回成本 CNY（品項單卡成本 × 退卡張數推算）
  refund_twd NUMERIC,                    -- 退回成本 TWD
  status TEXT DEFAULT 'submitted',       -- submitted（N004/N005 callback 之後可更新）
  source TEXT,                           -- order_detail / cards_lookup
  created_at TIMESTAMPTZ DEFAULT now()   -- 售後日期
);
CREATE INDEX IF NOT EXISTS idx_bc_aftersales_created ON bc_aftersales (created_at);
CREATE INDEX IF NOT EXISTS idx_bc_aftersales_shopee ON bc_aftersales (shopee_order_id);
CREATE INDEX IF NOT EXISTS idx_bc_aftersales_channel ON bc_aftersales (channel_order_id);

COMMENT ON TABLE bc_aftersales IS 'BC F017 售後訂單紀錄（售後單號/退卡/退回成本）';
