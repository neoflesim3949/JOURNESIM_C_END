-- card_plans：存「下單時間」，用來算「下單 → 開通」間隔
--   優先蝦皮購買時間（shopee_orders.order_date），沒有才用 BC 建單時間（F011 createTime）
ALTER TABLE card_plans ADD COLUMN IF NOT EXISTS order_time TIMESTAMPTZ;
ALTER TABLE card_plans ADD COLUMN IF NOT EXISTS order_time_source TEXT;   -- 'shopee' | 'bc'

COMMENT ON COLUMN card_plans.order_time IS '下單時間：優先蝦皮 order_date，沒有才用 BC F011 createTime';
COMMENT ON COLUMN card_plans.order_time_source IS '下單時間來源：shopee / bc';

CREATE INDEX IF NOT EXISTS idx_card_plans_order_time ON card_plans (order_time);
