-- 統計分析快照：每個分析分頁(key)記錄最近一次計算結果，打開直接看、不必每次重算
create table if not exists analysis_snapshots (
  key text primary key,               -- 分頁識別，如 sku / usage / dailyavg / days / util / expiry / lifecycle / lag / travel...
  payload jsonb,                      -- 該分頁最近一次的資料（各元件自己的回應物件）
  opts jsonb,                         -- 計算條件 {from,to,exclude_legacy,...}
  computed_at timestamptz default now()
);
