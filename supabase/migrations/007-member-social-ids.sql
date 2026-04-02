-- 會員第三方登入 ID
ALTER TABLE members ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_user_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS apple_user_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS facebook_user_id TEXT;
