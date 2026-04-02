-- 方案分類：local=本地（單國）, regional=區域（多國）, global=全球
ALTER TABLE products ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'local';
