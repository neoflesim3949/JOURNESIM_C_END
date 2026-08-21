-- F056 加速包報價快取：acceleratePrice 只在 F056 回應中提供，同步下來供「成本重算」用
create table if not exists accel_prices (
  sku_id text primary key,           -- F056 加速包商品 skuId
  name text,                         -- 商品名稱（成本重算以「名稱」對應到基礎方案）
  accelerate_price numeric,          -- 每次加速(加一份高速流量)的結算價 ¥
  high_flow_size text,               -- 高速流量 KB
  updated_at timestamptz default now()
);
create index if not exists idx_accel_prices_name on accel_prices(name);
