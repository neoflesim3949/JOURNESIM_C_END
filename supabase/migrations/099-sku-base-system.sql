-- 系統組別（依 product_id）的基礎方案，與自訂分組的 is_base 獨立
alter table sku_meta add column if not exists is_base_system boolean default false;
