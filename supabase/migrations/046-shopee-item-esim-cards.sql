-- 蝦皮訂單明細：一筆 eSIM 品項可存多張卡（不再拆成多 row）
-- 每張卡一組 { iccid, lpa_code, qr_code_url }；單一的 lpa_code/qr_code_url 仍保留作向後相容
ALTER TABLE shopee_order_items
  ADD COLUMN IF NOT EXISTS esim_cards JSONB;

COMMENT ON COLUMN shopee_order_items.esim_cards IS
  'eSIM 多張卡資料陣列：[{iccid, lpa_code, qr_code_url}]；qty>1 時每張卡各自憑證，安裝頁依 ICCID 對應到該卡。iccid 欄位仍同步存全部 ICCID 供查詢/安裝查找。';
