// src/chem-cache.js — D1 缓存与上报限流
// 缓存「本地知识库未命中 → 联网」的判定结果；永久缓存（不过期），上报刷新时覆盖。
// 本地知识库命中的化学式不缓存（瞬时返回）。

const STALE_MS = Infinity; // 永不过期

// 规范化缓存 key：去状态/空格、统一水合点、保留电荷（core|±n），避免 Co2+ 与 Co3+ 共享 key
export function cacheKey(formula){
  let k = String(formula).trim().replace(/\s+/g,"");
  k = k.replace(/\((s|l|g|aq)\)$/i,"");
  k = k.replace(/[•*.]/g,"·");
  let chargeSuffix = "";
  const caret = k.match(/\^([0-9]*[+-])$/);
  if(caret){ chargeSuffix = "|"+normCharge(caret[1]); k = k.slice(0, caret.index); }
  else{
    const tail = k.match(/([\]\)\}a-z])(\d*[+-])$/);
    if(tail){ chargeSuffix = "|"+normCharge(tail[2]); k = k.slice(0, tail.index+1); }
  }
  return k.toLowerCase() + chargeSuffix;
}
function normCharge(s){
  const sign = s.endsWith("+")?"+":"-";
  const n = s.replace(/[+-]/g,"");
  const num = n===""?1:parseInt(n,10);
  return (sign==="+"?"+":"-")+num;
}

export async function getCached(env, formula){
  if(!env?.DB) return null;
  const key = cacheKey(formula);
  if(!key) return null;
  try{
    const row = await env.DB.prepare("SELECT result_json, updated_at FROM formula_cache WHERE formula = ?").bind(key).first();
    if(!row?.result_json) return null;
    const result = JSON.parse(row.result_json);
    const updatedAt = Number(row.updated_at)||0;
    return { result, stale: (Date.now()-updatedAt) > STALE_MS, updatedAt };
  }catch{ return null; }
}

export async function setCached(env, formula, result){
  if(!env?.DB) return;
  const key = cacheKey(formula);
  if(!key) return;
  const now = Date.now();
  try{
    await env.DB.prepare(
      "INSERT INTO formula_cache (formula, verdict, name, source, result_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?) " +
      "ON CONFLICT(formula) DO UPDATE SET verdict=excluded.verdict, name=excluded.name, source=excluded.source, result_json=excluded.result_json, updated_at=excluded.updated_at"
    ).bind(key, result.verdict||"", result.name||null, result.source||null, JSON.stringify(result), now, now).run();
  }catch{ /* 缓存写失败不影响主流程 */ }
}

// ---- 方程式缓存（复用 formula_cache 表，key 加 "eq:" 前缀）----
export async function getEqCached(env, key){
  if(!env?.DB) return null;
  try{
    const row = await env.DB.prepare("SELECT result_json, updated_at FROM formula_cache WHERE formula = ?").bind("eq:"+key).first();
    if(!row?.result_json) return null;
    const result = JSON.parse(row.result_json);
    return { result, stale: (Date.now()-(Number(row.updated_at)||0)) > STALE_MS };
  }catch{ return null; }
}
export async function setEqCached(env, key, result){
  if(!env?.DB) return;
  const now = Date.now();
  try{
    await env.DB.prepare(
      "INSERT INTO formula_cache (formula, verdict, name, source, result_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?) " +
      "ON CONFLICT(formula) DO UPDATE SET result_json=excluded.result_json, updated_at=excluded.updated_at"
    ).bind("eq:"+key, result.mode||"equation", null, result.source||"equation", JSON.stringify(result), now, now).run();
  }catch{ /* 忽略 */ }
}

// ---- 外部 API 调用限流：同一 IP 每日 ≤ 50 次（网页同源查询不计）----
export const API_DAILY_LIMIT = 50;
export async function checkAndIncrApi(env, ip, meta){
  if(!env?.DB || !ip) return { allowed:true, used:0, limit:API_DAILY_LIMIT };
  const today = new Date().toISOString().slice(0,10);
  try{
    const row = await env.DB.prepare(
      "SELECT count FROM api_usage WHERE ip=? AND usage_date=?"
    ).bind(ip, today).first();
    const used = Number(row?.count)||0;
    if(used >= API_DAILY_LIMIT) return { allowed:false, used, limit:API_DAILY_LIMIT };
    // 计数与明细同批写入：限流通过后两者都写，失败则整体报错由调用方兜底
    const stmt = env.DB.prepare(
      "INSERT INTO api_usage (ip, usage_date, count) VALUES (?,?,1) " +
      "ON CONFLICT(ip, usage_date) DO UPDATE SET count=count+1"
    ).bind(ip, today);
    let logStmt = null;
    if (meta) {
      logStmt = env.DB.prepare(
        "INSERT INTO api_call_log (ip, call_date, referer, country, ua) VALUES (?,?,?,?,?)"
      ).bind(ip, today, meta.referer||null, meta.country||null, meta.ua||null);
    }
    if (logStmt) await env.DB.batch([stmt, logStmt]);
    else await stmt.run();
    return { allowed:true, used:used+1, limit:API_DAILY_LIMIT };
  }catch{
    return { allowed:true, used:0, limit:API_DAILY_LIMIT };
  }
}

// 异步清理 api_call_log：仅保留近 30 天（控制台统计窗口）
export async function pruneApiLog(env, days = 30){
  if(!env?.DB) return;
  const cutoff = new Date(Date.now() - days*86400e3).toISOString().slice(0,10);
  try{ await env.DB.prepare("DELETE FROM api_call_log WHERE call_date < ?").bind(cutoff).run(); }
  catch{ /* 清理失败不影响主流程 */ }
}

// ---- 控制台统计查询（均假定已通过会话鉴权）----

// 今日/累计外部调用数与今日已用 IP 数
export async function sumApiUsage(env){
  if(!env?.DB) return { today:0, total:0, todayIps:0 };
  const today = new Date().toISOString().slice(0,10);
  try{
    const todayRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(count),0) AS c FROM api_usage WHERE usage_date=?"
    ).bind(today).first();
    const totalRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(count),0) AS c FROM api_usage"
    ).first();
    const todayIps = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM api_usage WHERE usage_date=?"
    ).bind(today).first();
    return { today: Number(todayRow?.c)||0, total: Number(totalRow?.c)||0, todayIps: Number(todayIps?.c)||0 };
  }catch{ return { today:0, total:0, todayIps:0 }; }
}

// 近 N 日外部调用趋势：按日期聚合 api_call_log
export async function trendApiLog(env, days = 7){
  if(!env?.DB) return [];
  const start = new Date(Date.now() - days*86400e3).toISOString().slice(0,10);
  try{
    const rows = await env.DB.prepare(
      "SELECT call_date AS date, COUNT(*) AS count FROM api_call_log WHERE call_date >= ? GROUP BY call_date ORDER BY date ASC"
    ).bind(start).all();
    return (rows.results||[]).map(r => ({ date: r.date, count: Number(r.count)||0 }));
  }catch{ return []; }
}

// 目的地统计：Referer 域名 / 地域 / UA 三组 TOP
export async function destTopApi(env, top = 10){
  if(!env?.DB) return { referer:[], country:[], ua:[] };
  const dims = [
    ["referer", "referer"],
    ["country", "country"],
    ["ua", "ua"]
  ];
  const out = {};
  for (const [key, col] of dims) {
    try{
      const rows = await env.DB.prepare(
        `SELECT ${col} AS name, COUNT(*) AS count FROM api_call_log GROUP BY ${col} ORDER BY count DESC LIMIT ?`
      ).bind(top).all();
      out[key] = (rows.results||[]).map(r => ({ name: r.name || "(空)", count: Number(r.count)||0 }));
    }catch{ out[key] = []; }
  }
  return out;
}

// formula_cache 最近更新 TOP（仅缓存过的化学式，按 updated_at 降序）
export async function formulaTopCache(env, top = 10){
  if(!env?.DB) return { total:0, top:[] };
  try{
    const totalRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM formula_cache").first();
    const rows = await env.DB.prepare(
      "SELECT formula, name, source, updated_at FROM formula_cache WHERE formula NOT LIKE 'eq:%' ORDER BY updated_at DESC LIMIT ?"
    ).bind(top).all();
    return { total: Number(totalRow?.c)||0, top:(rows.results||[]).map(r => ({ formula:r.formula, name:r.name||"", source:r.source||"", updatedAt:Number(r.updated_at)||0 })) };
  }catch{ return { total:0, top:[] }; }
}

// 上报纠错统计：今日/累计总数 + 按化学式聚合 TOP
export async function reportTop(env, top = 10){
  if(!env?.DB) return { today:0, total:0, top:[] };
  const today = new Date().toISOString().slice(0,10);
  try{
    const todayRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(count),0) AS c FROM report_usage WHERE report_date=?"
    ).bind(today).first();
    const totalRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(count),0) AS c FROM report_usage"
    ).first();
    const rows = await env.DB.prepare(
      "SELECT formula, SUM(count) AS c FROM report_usage GROUP BY formula ORDER BY c DESC LIMIT ?"
    ).bind(top).all();
    return { today: Number(todayRow?.c)||0, total: Number(totalRow?.c)||0, top:(rows.results||[]).map(r => ({ formula:r.formula, count:Number(r.c)||0 })) };
  }catch{ return { today:0, total:0, top:[] }; }
}

// ---- 上报限流：同一设备每日 ≤ 20 次、单化学式每日 ≤ 3 次 ----
const DAILY_TOTAL = 20;
const DAILY_FORMULA = 3;

export async function checkAndIncrReport(env, deviceId, formula){
  if(!env?.DB || !deviceId) return { allowed:true, dailyUsed:0, formulaUsed:0, dailyLimit:DAILY_TOTAL, formulaLimit:DAILY_FORMULA };
  const key = cacheKey(formula);
  const today = new Date().toISOString().slice(0,10);
  try{
    const row = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN report_date=? THEN count ELSE 0 END),0) AS daily_used, " +
      "COALESCE(MAX(CASE WHEN formula=? AND report_date=? THEN count ELSE 0 END),0) AS formula_used " +
      "FROM report_usage WHERE device_id=? AND report_date=?"
    ).bind(today, key, today, deviceId, today).first();
    const dailyUsed = Number(row?.daily_used)||0;
    const formulaUsed = Number(row?.formula_used)||0;
    if(dailyUsed>=DAILY_TOTAL) return { allowed:false, reason:"daily_total", dailyUsed, formulaUsed, dailyLimit:DAILY_TOTAL, formulaLimit:DAILY_FORMULA };
    if(formulaUsed>=DAILY_FORMULA) return { allowed:false, reason:"formula_total", dailyUsed, formulaUsed, dailyLimit:DAILY_TOTAL, formulaLimit:DAILY_FORMULA };
    await env.DB.prepare(
      "INSERT INTO report_usage (device_id, formula, report_date, count) VALUES (?,?,?,1) " +
      "ON CONFLICT(device_id, formula, report_date) DO UPDATE SET count=count+1"
    ).bind(deviceId, key, today).run();
    return { allowed:true, dailyUsed:dailyUsed+1, formulaUsed:formulaUsed+1, dailyLimit:DAILY_TOTAL, formulaLimit:DAILY_FORMULA };
  }catch{
    return { allowed:true, dailyUsed:0, formulaUsed:0, dailyLimit:DAILY_TOTAL, formulaLimit:DAILY_FORMULA };
  }
}
