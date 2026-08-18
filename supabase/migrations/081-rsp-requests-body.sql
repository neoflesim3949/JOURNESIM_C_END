-- rsp_requests 補完整動作紀錄：HTTP 方法 + 請求 body（截斷），供逐步檢視 eSIM 安裝流程
ALTER TABLE rsp_requests ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE rsp_requests ADD COLUMN IF NOT EXISTS body TEXT;
