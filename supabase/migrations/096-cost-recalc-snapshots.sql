-- 成本重算快照：每個版本(variant)記錄最近一次計算結果，打開直接看、不必每次重算
create table if not exists cost_recalc_snapshots (
  variant text primary key,           -- pack / volume-avg / volume-5 / volume-1 / volume-global / volume-globalall
  payload jsonb,                       -- 該次計算的完整回應（summary/months/families/params）
  opts jsonb,                          -- 計算條件 {from,to,exclude_legacy,scope:'range'|'all'}
  computed_at timestamptz default now()
);
