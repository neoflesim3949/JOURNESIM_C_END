-- 蝦皮訂單「衍生狀態」單表快照：把系統狀態/金流狀態算好存進 shopee_orders，
-- 讓列表篩選能純 SQL 分頁（不再全撈訂單＋跨表 join 再 JS 算）。
-- 由觸發器在 訂單/品項/金流 任何變動時自動重算——攔所有寫入路徑，不靠應用層記得呼叫。

ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS system_status_derived TEXT;   -- pending/processing/backfilled/completed/不成立
ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS finance_status_derived TEXT;  -- 未匯入/已匯入/金流異常
CREATE INDEX IF NOT EXISTS idx_shopee_orders_sysd ON shopee_orders (system_status_derived);
CREATE INDEX IF NOT EXISTS idx_shopee_orders_find ON shopee_orders (finance_status_derived);

-- 重算單一訂單的衍生狀態（邏輯對齊 route.ts 的 sysKey / financeLabel）
CREATE OR REPLACE FUNCTION recompute_shopee_order_derived(p_order_id UUID)
RETURNS void AS $$
DECLARE
  v_internal TEXT; v_product_total NUMERIC; v_seller_coupon NUMERIC;
  v_item_count INT; v_all_completed BOOLEAN; v_all_backfilled BOOLEAN; v_items_total NUMERIC;
  v_settle_count INT; s shopee_settlements%ROWTYPE;
  v_sys TEXT; v_fin TEXT; v_orig NUMERIC; v_fees NUMERIC; v_coupon NUMERIC; v_expected NUMERIC;
BEGIN
  SELECT internal_status, product_total, seller_coupon
    INTO v_internal, v_product_total, v_seller_coupon
    FROM shopee_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*),
         bool_and(status IN ('bc_ordered','completed')),
         bool_and(status IN ('iccid_filled','bc_ordered','completed')),
         COALESCE(sum(COALESCE(sale_price, original_price, 0) * COALESCE(quantity, 1)), 0)
    INTO v_item_count, v_all_completed, v_all_backfilled, v_items_total
    FROM shopee_order_items WHERE shopee_order_id = p_order_id;

  -- 系統狀態
  IF v_internal = '不成立' THEN v_sys := '不成立';
  ELSIF v_item_count > 0 AND v_all_completed THEN v_sys := 'completed';
  ELSIF v_item_count > 0 AND v_all_backfilled THEN v_sys := 'backfilled';
  ELSIF v_internal = 'processing' THEN v_sys := 'processing';
  ELSE v_sys := 'pending';
  END IF;

  -- 金流狀態（取第一筆結算）
  SELECT count(*) INTO v_settle_count FROM shopee_settlements WHERE shopee_order_id = p_order_id;
  IF v_settle_count = 0 THEN
    v_fin := '未匯入';
  ELSE
    SELECT * INTO s FROM shopee_settlements WHERE shopee_order_id = p_order_id ORDER BY id LIMIT 1;
    v_orig := COALESCE(s.original_price, CASE WHEN v_items_total > 0 THEN v_items_total ELSE COALESCE(v_product_total, 0) END);
    v_fees := abs(COALESCE(s.ams_fee, 0)) + abs(COALESCE(s.transaction_fee, 0)) + abs(COALESCE(s.other_service_fee, 0)) + abs(COALESCE(s.processing_fee, 0));
    v_coupon := abs(COALESCE(s.seller_coupon, v_seller_coupon, 0));
    v_expected := v_orig - v_coupon - v_fees;
    IF abs(v_expected - COALESCE(s.wallet_amount, 0)) > 1 THEN v_fin := '金流異常'; ELSE v_fin := '已匯入'; END IF;
  END IF;

  UPDATE shopee_orders SET system_status_derived = v_sys, finance_status_derived = v_fin
    WHERE id = p_order_id
      AND (system_status_derived IS DISTINCT FROM v_sys OR finance_status_derived IS DISTINCT FROM v_fin);
END;
$$ LANGUAGE plpgsql;

-- 觸發函數：品項/金流變動 → 重算所屬訂單
CREATE OR REPLACE FUNCTION trg_recompute_order_from_child()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_shopee_order_derived(OLD.shopee_order_id);
    RETURN OLD;
  END IF;
  PERFORM recompute_shopee_order_derived(NEW.shopee_order_id);
  IF TG_OP = 'UPDATE' AND NEW.shopee_order_id IS DISTINCT FROM OLD.shopee_order_id THEN
    PERFORM recompute_shopee_order_derived(OLD.shopee_order_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 觸發函數：訂單本身 internal_status/金額變動 → 重算自己（只設衍生欄，不會遞迴）
CREATE OR REPLACE FUNCTION trg_recompute_order_self()
RETURNS trigger AS $$
BEGIN
  PERFORM recompute_shopee_order_derived(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_items_recompute ON shopee_order_items;
CREATE TRIGGER tr_items_recompute AFTER INSERT OR UPDATE OR DELETE ON shopee_order_items
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_order_from_child();

DROP TRIGGER IF EXISTS tr_settlements_recompute ON shopee_settlements;
CREATE TRIGGER tr_settlements_recompute AFTER INSERT OR UPDATE OR DELETE ON shopee_settlements
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_order_from_child();

DROP TRIGGER IF EXISTS tr_orders_recompute ON shopee_orders;
CREATE TRIGGER tr_orders_recompute AFTER INSERT OR UPDATE OF internal_status, product_total, seller_coupon ON shopee_orders
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_order_self();

-- 回填既有訂單
SELECT recompute_shopee_order_derived(id) FROM shopee_orders;
