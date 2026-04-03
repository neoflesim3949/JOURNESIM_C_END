-- 增加 scope (用以區分 本地 / 區域 / 全球) 以及圖示庫
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'local';
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- 若原有假分組存在於 products 表，直接升級為獨立的「類別國家」存在於 bc_countries
INSERT INTO bc_countries (mcc, name, name_zh, scope, icon_url)
SELECT DISTINCT country_code, country_name, country_name, scope, icon_url
FROM products
WHERE scope IN ('regional', 'global') AND country_code IS NOT NULL
ON CONFLICT (mcc) DO UPDATE SET
  scope = EXCLUDED.scope,
  icon_url = EXCLUDED.icon_url;
