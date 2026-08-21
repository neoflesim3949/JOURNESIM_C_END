-- F002 額外回傳的產品層 ID/名稱：一個 productId 底下可能掛多個 skuId（BC 已幫我們分類同產品）
alter table bc_products add column if not exists product_id text;
alter table bc_products add column if not exists product_name text;
create index if not exists idx_bc_products_product_id on bc_products(product_id);
