-- rsp_requests 加 ICCID：從 handleNotification（安裝結果回報）的 body 解出本次安裝的卡號
ALTER TABLE rsp_requests ADD COLUMN IF NOT EXISTS iccid TEXT;
CREATE INDEX IF NOT EXISTS idx_rsp_requests_iccid ON rsp_requests (iccid) WHERE iccid IS NOT NULL;
