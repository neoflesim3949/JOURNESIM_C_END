-- 短網址／行銷轉址：/r/{slug} → target_url，含點擊統計
CREATE TABLE IF NOT EXISTS redirect_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,             -- 短代碼（/r/{slug}）
  target_url TEXT NOT NULL,              -- 目標網址
  title TEXT,                            -- 用途備註（後台顯示）
  is_active BOOLEAN DEFAULT true,        -- 停用時回 404
  clicks INTEGER DEFAULT 0,              -- 累計點擊
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redirect_links_slug ON redirect_links (slug);

-- 點擊明細（輕量：時間/來源/UA，供之後分析；不記 IP）
CREATE TABLE IF NOT EXISTS redirect_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID REFERENCES redirect_links(id) ON DELETE CASCADE,
  referer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_link ON redirect_clicks (link_id, created_at);

-- 累加點擊的原子函數（避免讀寫競態）
CREATE OR REPLACE FUNCTION increment_redirect_clicks(p_link_id UUID)
RETURNS void AS $$
  UPDATE redirect_links SET clicks = clicks + 1, last_clicked_at = now() WHERE id = p_link_id;
$$ LANGUAGE sql;

COMMENT ON TABLE redirect_links IS '短網址轉址（/r/{slug}），後台行銷管理維護';
