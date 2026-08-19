-- 一次性回填 card_plans.order_time（蝦皮來源）：純 DB join，免打 BC
--   iccid → 最早蝦皮 order_date（shopee_orders × shopee_order_items.iccid[]）
--   order_date 與 plan_start_time 同為「+8 牆鐘存成 timestamptz」，相減一致
UPDATE card_plans cp
SET order_time = sub.od,
    order_time_source = 'shopee'
FROM (
  SELECT ic.iccid AS iccid, MIN(so.order_date) AS od
  FROM shopee_order_items soi
  JOIN shopee_orders so ON so.id = soi.shopee_order_id
  CROSS JOIN LATERAL jsonb_array_elements_text(soi.iccid) AS ic(iccid)
  WHERE soi.iccid IS NOT NULL
    AND jsonb_typeof(soi.iccid) = 'array'
    AND so.order_date IS NOT NULL
  GROUP BY ic.iccid
) sub
WHERE cp.iccid = sub.iccid;

-- 檢視回填結果
--   SELECT order_time_source, count(*) FROM card_plans GROUP BY 1;
