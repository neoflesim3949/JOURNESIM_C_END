-- 系統設定（金流參數等）
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 預設金流設定
INSERT INTO system_settings (key, value, description) VALUES
  ('tappay_app_id', '', 'TapPay App ID'),
  ('tappay_app_key', '', 'TapPay App Key（前端）'),
  ('tappay_partner_key', '', 'TapPay Partner Key（後端）'),
  ('tappay_merchant_id', '', 'TapPay Merchant ID（信用卡）'),
  ('tappay_merchant_id_line_pay', '', 'TapPay Merchant ID（Line Pay）'),
  ('tappay_merchant_id_apple_pay', '', 'TapPay Merchant ID（Apple Pay）'),
  ('tappay_merchant_id_jko_pay', '', 'TapPay Merchant ID（街口支付）'),
  ('tappay_merchant_id_pxpay', '', 'TapPay Merchant ID（PX Pay Plus）'),
  ('tappay_env', 'sandbox', 'TapPay 環境（sandbox / production）'),
  ('payment_credit_card', 'true', '啟用信用卡付款'),
  ('payment_line_pay', 'false', '啟用 Line Pay'),
  ('payment_apple_pay', 'false', '啟用 Apple Pay'),
  ('payment_google_pay', 'false', '啟用 Google Pay'),
  ('payment_samsung_pay', 'false', '啟用 Samsung Pay'),
  ('payment_jko_pay', 'false', '啟用街口支付'),
  ('payment_pxpay', 'false', '啟用 PX Pay Plus'),
  ('test_mode', 'true', '測試模式（不呼叫 BC API）')
ON CONFLICT (key) DO NOTHING;
