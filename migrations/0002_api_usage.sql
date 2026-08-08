-- 外部 API 调用限流：按 IP 每日上限 50 次（网页同源查询不计）
-- 主键 (ip, usage_date) 天然去重计数
CREATE TABLE IF NOT EXISTS api_usage (
  ip          TEXT NOT NULL,
  usage_date  TEXT NOT NULL,      -- YYYY-MM-DD
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, usage_date)
);
