-- 國家名稱多語系及洲別翻譯
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS name_zh text;   -- 繁體中文
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS name_en text;   -- 英文
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS continent_zh text; -- 繁體中文洲別
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS continent_en text; -- 英文洲別
