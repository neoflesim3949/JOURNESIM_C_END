-- 移除舊版「商品對應」(V1) 相關資料表
-- 前提：migration 049 已執行（自設名稱已回填進 V2 與訂單明細快照）；
--       訂單匯入/對應/標籤/收據皆已改用 V2，與下列表無關。
-- ⚠️ 請在確認 V2 一切正常後再執行此檔。
DROP TABLE IF EXISTS shopee_product_mappings;       -- V1 蝦皮編碼→BC 對應
DROP TABLE IF EXISTS shopee_product_id_mappings;    -- V1 商品自設名稱（已搬進 V2）
DROP TABLE IF EXISTS shopee_variation_id_mappings;  -- V1 規格自設名稱（已搬進 V2）
DROP TABLE IF EXISTS shopee_pricing_rules;          -- 加價規則（功能已移除）
