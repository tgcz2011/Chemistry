-- 外部 API 调用明细：供控制台目的地统计/趋势（限流计数仍在 api_usage）
-- 保留近 30 天，由 Worker 每日异步清理过期行
CREATE TABLE IF NOT EXISTS api_call_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  call_date  TEXT NOT NULL,        -- YYYY-MM-DD
  referer    TEXT,                 -- 来源域名（空=无来源）
  country    TEXT,                 -- CF-IPCountry
  ua         TEXT                  -- User-Agent 摘要（截断）
);
CREATE INDEX IF NOT EXISTS idx_api_call_date ON api_call_log(call_date);
