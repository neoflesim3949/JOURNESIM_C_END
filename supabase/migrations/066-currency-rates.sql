-- 066: 前台幣別匯率（每 1 TWD 兌換的外幣，與 CNY 語意一致）。預設值可於後台「匯率管理」調整。
INSERT INTO exchange_rates (currency, rate, updated_at) VALUES
  ('USD', 0.0312, now()),
  ('HKD', 0.244,  now())
ON CONFLICT (currency) DO NOTHING;
