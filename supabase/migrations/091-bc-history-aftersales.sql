-- 歷史採購售後明細（BC 售后列表 Excel 匯入）
CREATE TABLE IF NOT EXISTS bc_history_aftersales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key TEXT UNIQUE NOT NULL,          -- 售後單號|億點單號|問題卡號
  aftersale_date DATE,                      -- 日期
  bc_order_no TEXT,                         -- 亿点订单号
  aftersale_no TEXT,                        -- 售后单号
  product_name TEXT,                        -- 商品名称
  aftersale_method TEXT,                    -- 售后方式（退货…）
  aftersale_reason TEXT,                    -- 售后原因
  problem_iccid TEXT,                       -- 问题卡号（可能多張，逗號分隔）
  refund_amount NUMERIC,                    -- 退款金额
  review_status TEXT,                       -- 受理状态
  refund_status TEXT,                       -- 退款状态
  imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hist_as_bcno ON bc_history_aftersales (bc_order_no);
CREATE INDEX IF NOT EXISTS idx_hist_as_no ON bc_history_aftersales (aftersale_no);
CREATE INDEX IF NOT EXISTS idx_hist_as_iccid ON bc_history_aftersales (problem_iccid);
CREATE INDEX IF NOT EXISTS idx_hist_as_date ON bc_history_aftersales (aftersale_date);

COMMENT ON TABLE bc_history_aftersales IS 'BC 售后列表歷史明細（Excel 批量匯入）';
