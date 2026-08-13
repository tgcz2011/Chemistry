-- chem-check D1 缓存与上报限流
-- 仅缓存「本地知识库未命中 → 联网(PubChem/Wiki/AI)」的判定结果；本地知识库命中的不缓存（瞬时返回）。
-- 缓存永不过期（STALE_MS=Infinity），仅上报标记有误时强制重查覆盖。

CREATE TABLE IF NOT EXISTS formula_cache (
  formula      TEXT PRIMARY KEY,   -- 规范化化学式（去状态/统一水合点，保留电荷 core|±n）
  verdict      TEXT NOT NULL,      -- yes/conditional/unstable/no
  name         TEXT,               -- 中文名
  source       TEXT,               -- pubchem / workers-ai / wiki / rule
  result_json  TEXT NOT NULL,      -- 完整判定结果 JSON
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formula_cache_updated ON formula_cache(updated_at);

-- 上报限流：同一设备每日总上限、单化学式每日上限；主键 (device_id, formula, report_date) 天然去重计数
CREATE TABLE IF NOT EXISTS report_usage (
  device_id    TEXT NOT NULL,
  formula      TEXT NOT NULL,
  report_date  TEXT NOT NULL,      -- YYYY-MM-DD
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, formula, report_date)
);
CREATE INDEX IF NOT EXISTS idx_report_device_date ON report_usage(device_id, report_date);
