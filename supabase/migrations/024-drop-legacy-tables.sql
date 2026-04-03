-- =====================================================
-- 清除舊架構遺留的表
-- 新架構使用 country_packages 取代 products + product_packages
-- 新架構使用 order_skus + sub_orders 取代 order_items 的部分功能
-- =====================================================

-- 舊的商品架構（已被 packages + country_packages 取代）
DROP TABLE IF EXISTS product_plan_prices CASCADE;
DROP TABLE IF EXISTS product_plans CASCADE;
DROP TABLE IF EXISTS product_packages CASCADE;
DROP TABLE IF EXISTS product_bc_mapping CASCADE;
DROP TABLE IF EXISTS daily_plans CASCADE;
DROP TABLE IF EXISTS fixed_plans CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 注意：order_items 和 esim_profiles 暫時保留
-- 因為前台訂單頁和 webhook 仍有向後相容的讀寫
-- 等完全遷移到 order_skus 後再刪除
