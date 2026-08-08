// src/chem-cache.js — D1 缓存与上报限流
// 缓存「本地知识库未命中 → 联网」的判定结果；14 天过期（读出即返回旧值、后台联网刷新）。
// 本地知识库命中的化学式不缓存（瞬时返回）。

const STALE_MS = 14 * 24 * 60 * 60 * 1000; // 14 天

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
const API_DAILY_LIMIT = 50;
export async function checkAndIncrApi(env, ip){
  if(!env?.DB || !ip) return { allowed:true, used:0, limit:API_DAILY_LIMIT };
  const today = new Date().toISOString().slice(0,10);
  try{
    const row = await env.DB.prepare(
      "SELECT count FROM api_usage WHERE ip=? AND usage_date=?"
    ).bind(ip, today).first();
    const used = Number(row?.count)||0;
    if(used >= API_DAILY_LIMIT) return { allowed:false, used, limit:API_DAILY_LIMIT };
    await env.DB.prepare(
      "INSERT INTO api_usage (ip, usage_date, count) VALUES (?,?,1) " +
      "ON CONFLICT(ip, usage_date) DO UPDATE SET count=count+1"
    ).bind(ip, today).run();
    return { allowed:true, used:used+1, limit:API_DAILY_LIMIT };
  }catch{
    return { allowed:true, used:0, limit:API_DAILY_LIMIT };
  }
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
