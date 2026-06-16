-- bc_api_logs 寫入慢到 90s→522 的主因是「單筆 row 太大」（過去把整包商品/價格清單回應存進 response_body，數 MB）。
-- 程式端已改成不再存大量回應 body，之後「新」的 log 都是小列、寫入即時完成 —— 不需要刪任何 log。
--
-- ⚠️ 不刪除任何 log 列。以下全部為「選用」，只在你想回收磁碟空間時才跑（每一列 log 的 trade_type/status/時間/錯誤訊息都保留，只清掉超大的 body 內容）。

-- ① 看現況（選跑）
-- SELECT count(*) AS rows, pg_size_pretty(pg_total_relation_size('bc_api_logs')) AS size FROM bc_api_logs;

-- ② 選用：把「歷史超大回應」瘦身，但保留每一列 log（不刪列）。
--    只動 body 超過 ~12KB 的列，把 response_body 換成摘要；其餘欄位完全不變。
-- UPDATE bc_api_logs
--    SET response_body = jsonb_build_object('_summary', 'oversized body trimmed', '_bytes', length(response_body::text))
--  WHERE response_body IS NOT NULL
--    AND length(response_body::text) > 12000;

-- ③ 選用：瘦身後回收空間
-- VACUUM (ANALYZE) bc_api_logs;
