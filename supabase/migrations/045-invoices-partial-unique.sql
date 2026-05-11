-- invoice_number 改用 partial unique：註銷後號碼可被重新使用
-- 同一個 invoice_number 在「非註銷」狀態下只能有一筆，註銷後新發票可重用該號碼
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_active_uniq
  ON invoices(invoice_number)
  WHERE status <> 'voided';
