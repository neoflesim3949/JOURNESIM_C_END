-- 國家/區域/全球 直接關聯套餐（取代 products + product_packages）
CREATE TABLE IF NOT EXISTS country_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mcc TEXT NOT NULL,  -- 對應 bc_countries.mcc
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mcc, package_id)
);

CREATE INDEX IF NOT EXISTS idx_country_packages_mcc ON country_packages (mcc);
CREATE INDEX IF NOT EXISTS idx_country_packages_pkg ON country_packages (package_id);

-- 遷移現有資料：從 product_packages + products 搬到 country_packages
INSERT INTO country_packages (mcc, package_id)
SELECT DISTINCT p.country_code, pp.package_id
FROM product_packages pp
JOIN products p ON p.id = pp.product_id
WHERE p.country_code IS NOT NULL
ON CONFLICT DO NOTHING;
