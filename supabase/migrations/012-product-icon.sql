-- 區域/全球方案的自訂圖示
ALTER TABLE products ADD COLUMN IF NOT EXISTS icon_url text;
