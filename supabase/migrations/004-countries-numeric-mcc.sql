-- bc_countries 加入數字 MCC 欄位（從 bc_products.country_data 自動建立映射）
ALTER TABLE bc_countries ADD COLUMN IF NOT EXISTS numeric_mcc TEXT[];
