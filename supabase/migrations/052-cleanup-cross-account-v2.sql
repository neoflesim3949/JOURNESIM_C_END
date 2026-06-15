-- 一次性清理：跨帳號批次編輯誤寫進別帳號 V2 對應庫的污染列
-- 判定：該列無 batch_id（非匯入產生，是訂單回寫），且同一「選項ID」已被「別帳號」匯入(有 batch_id)
--       → 代表此選項本該屬於別帳號，這列是污染。
-- ⚠️ 請先跑「預覽」確認要刪的內容，再跑「刪除」。

-- ① 預覽（先跑這段看清單）
-- SELECT a.account_id, a.shopee_variation_id, a.shopee_product_name, a.bc_sku_id, a.custom_product_name
--   FROM shopee_product_options_v2 a
--  WHERE a.batch_id IS NULL
--    AND EXISTS (
--      SELECT 1 FROM shopee_product_options_v2 b
--       WHERE b.shopee_variation_id = a.shopee_variation_id
--         AND b.account_id <> a.account_id
--         AND b.batch_id IS NOT NULL
--    )
--  ORDER BY a.account_id, a.shopee_product_name;

-- ② 確認無誤後刪除
DELETE FROM shopee_product_options_v2 a
 WHERE a.batch_id IS NULL
   AND EXISTS (
     SELECT 1 FROM shopee_product_options_v2 b
      WHERE b.shopee_variation_id = a.shopee_variation_id
        AND b.account_id <> a.account_id
        AND b.batch_id IS NOT NULL
   );
