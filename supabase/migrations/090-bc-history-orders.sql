-- 歷史訂單明細（BC 销售订单 Excel 匯入）
CREATE TABLE IF NOT EXISTS bc_history_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key TEXT UNIQUE NOT NULL,          -- 平台單號|億點單號|商品編號|關聯卡號|起始號段|截止號段（一單多卡/一卡多單皆不誤併）
  seq TEXT,                                 -- 序号
  platform_order_no TEXT,                   -- 销售平台订单号
  bc_order_no TEXT,                         -- 亿点订单号
  channel_no TEXT,                          -- 销售渠道编号
  channel_name TEXT,                        -- 销售渠道名称
  operator TEXT,                            -- 操作员
  order_created_at TIMESTAMPTZ,             -- 订单创建时间
  order_type TEXT,                          -- 订单类型
  product_no TEXT,                          -- 商品编号
  product_name TEXT,                        -- 商品名称
  copies TEXT,                              -- 份数
  actual_price NUMERIC,                     -- 实际售价
  settle_price NUMERIC,                     -- 应结算价
  quantity INTEGER,                         -- 数量
  discount NUMERIC,                         -- 优惠金额
  shipping_fee NUMERIC,                     -- 物流费用
  phone TEXT,                               -- 手机号码
  shipping_method TEXT,                     -- 物流方式
  recipient_name TEXT,                      -- 收货人姓名
  recipient_address TEXT,                   -- 收货地址
  logistics_company TEXT,                   -- 物流公司
  related_iccid TEXT,                       -- 关联卡号码
  iccid_start TEXT,                         -- 起始号段
  iccid_end TEXT,                           -- 截止号段
  order_status TEXT,                        -- 订单状态
  logistics_status TEXT,                    -- 物流状态
  user_ordered_at TIMESTAMPTZ,             -- 用户下单时间
  expected_travel_date DATE,               -- 预计出行日期
  note TEXT,                                -- 订单备注
  imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hist_orders_platform ON bc_history_orders (platform_order_no);
CREATE INDEX IF NOT EXISTS idx_hist_orders_bcno ON bc_history_orders (bc_order_no);
CREATE INDEX IF NOT EXISTS idx_hist_orders_iccid ON bc_history_orders (related_iccid);
CREATE INDEX IF NOT EXISTS idx_hist_orders_created ON bc_history_orders (order_created_at);

COMMENT ON TABLE bc_history_orders IS 'BC 销售订单歷史明細（Excel 批量匯入；底層逐列存，顯示層合併）';

-- 顯示層：同訂單（平台單｜億點單｜商品）合併一列，卡片明細用 count/範圍/金額加總呈現
CREATE OR REPLACE VIEW bc_history_orders_grouped AS
SELECT
  coalesce(platform_order_no, '') || '|' || coalesce(bc_order_no, '') || '|' || coalesce(product_no, '') AS group_key,
  platform_order_no, bc_order_no, product_no,
  max(product_name)     AS product_name,
  max(channel_name)     AS channel_name,
  max(operator)         AS operator,
  max(order_type)       AS order_type,
  min(order_created_at) AS order_created_at,
  max(copies)           AS copies,
  count(*)              AS card_count,
  sum(coalesce(actual_price, 0))  AS actual_price,
  sum(coalesce(settle_price, 0))  AS settle_price,
  sum(coalesce(quantity, 0))      AS quantity,
  sum(coalesce(discount, 0))      AS discount,
  sum(coalesce(shipping_fee, 0))  AS shipping_fee,
  max(recipient_name)   AS recipient_name,
  max(phone)            AS phone,
  max(logistics_company) AS logistics_company,
  min(coalesce(nullif(related_iccid, ''), iccid_start)) AS iccid_min,
  max(coalesce(nullif(related_iccid, ''), iccid_end))   AS iccid_max,
  max(order_status)     AS order_status,
  max(logistics_status) AS logistics_status,
  min(user_ordered_at)  AS user_ordered_at,
  min(expected_travel_date) AS expected_travel_date,
  max(note)             AS note
FROM bc_history_orders
GROUP BY platform_order_no, bc_order_no, product_no;
