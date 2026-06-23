-- 064: 網站文章（隱私權政策 / 服務條款 / 退換貨政策 / 反詐騙宣導）
CREATE TABLE IF NOT EXISTS site_articles (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  sort_order INT  NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO site_articles (slug, title, sort_order) VALUES
  ('privacy',       '隱私權政策', 1),
  ('terms',         '服務條款',   2),
  ('refund-policy', '退換貨政策', 3),
  ('anti-fraud',    '反詐騙宣導', 4)
ON CONFLICT (slug) DO NOTHING;
