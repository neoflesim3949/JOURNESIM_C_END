-- 套餐整理欄位：分類、標籤（sort_order 已存在，作為排序用）
ALTER TABLE packages ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS tags JSONB;  -- 字串陣列，例 ["熱門","促銷"]
CREATE INDEX IF NOT EXISTS idx_packages_category ON packages (category);
