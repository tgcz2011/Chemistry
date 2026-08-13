// src/chem-cache.test.mjs — 单元测试：checkAndIncrApi 限流+明细、统计查询
// 运行：node src/chem-cache.test.mjs
import assert from "node:assert/strict";
import {
  checkAndIncrApi, pruneApiLog, sumApiUsage,
  trendApiLog, destTopApi, formulaTopCache, reportTop
} from "./chem-cache.js";

function mockD1() {
  const tables = { api_usage: {}, api_call_log: [], report_usage: {}, formula_cache: [] };
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  // 预置数据
  tables.api_usage["9.9.9.9|"+today] = { count: 49 };
  tables.report_usage["dev1|h2so4|"+today] = { count: 2 };
  tables.report_usage["dev1|h2so4|2026-01-01"] = { count: 1 };
  tables.report_usage["dev2|naoh|2026-01-01"] = { count: 3 };
  tables.formula_cache.push({ formula:"cuso4", name:"硫酸铜", source:"pubchem", updated_at: now.getTime()-1000 });
  tables.formula_cache.push({ formula:"eq:hcl+naoh", name:null, source:"equation", updated_at: now.getTime()-2000 });

  let autoId = 1;
  const db = {
    prepare(sql) {
      let a = [];
      const p = {
        bind(...args) { a = args; return p; },
        async run() {
          if (sql.includes("INSERT INTO api_usage")) {
            const [ip, date] = a;
            const k = `${ip}|${date}`;
            tables.api_usage[k] = { count: (tables.api_usage[k]?.count||0)+1 };
            return { success: true };
          }
          if (sql.includes("INSERT INTO api_call_log")) {
            const [ip, date, referer, country, ua] = a;
            tables.api_call_log.push({ id: autoId++, ip, call_date: date, referer, country, ua });
            return { success: true };
          }
          if (sql.includes("DELETE FROM api_call_log")) { tables.api_call_log = []; return { success: true }; }
          throw new Error("unexpected run SQL: " + sql);
        },
        async first() {
          if (sql.includes("SELECT count FROM api_usage")) {
            const [ip, date] = a;
            const row = tables.api_usage[`${ip}|${date}`];
            return row ? { count: row.count } : null;
          }
          if (sql.includes("COALESCE(SUM(count),0) AS c FROM api_usage WHERE usage_date")) {
            const [date] = a;
            let c = 0;
            for (const k in tables.api_usage) if (k.endsWith("|"+date)) c += tables.api_usage[k].count;
            return { c };
          }
          if (sql.includes("COALESCE(SUM(count),0) AS c FROM api_usage")) {
            let c = 0; for (const k in tables.api_usage) c += tables.api_usage[k].count;
            return { c };
          }
          if (sql.includes("COUNT(*) AS c FROM api_usage WHERE usage_date")) {
            const [date] = a;
            let n = 0; for (const k in tables.api_usage) if (k.endsWith("|"+date)) n++;
            return { c: n };
          }
          if (sql.includes("COUNT(*) AS c FROM formula_cache")) return { c: tables.formula_cache.length };
          if (sql.includes("COALESCE(SUM(count),0) AS c FROM report_usage WHERE report_date")) {
            const [date] = a;
            let c = 0; for (const k in tables.report_usage) if (k.endsWith("|"+date)) c += tables.report_usage[k].count;
            return { c };
          }
          if (sql.includes("COALESCE(SUM(count),0) AS c FROM report_usage")) {
            let c = 0; for (const k in tables.report_usage) c += tables.report_usage[k].count;
            return { c };
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM api_call_log WHERE call_date >=")) {
            const [start] = a;
            const map = {};
            for (const r of tables.api_call_log) if (r.call_date >= start) map[r.call_date] = (map[r.call_date]||0)+1;
            return { results: Object.keys(map).sort().map(d => ({ date: d, count: map[d] })) };
          }
          if (sql.includes("GROUP BY referer")) {
            const map = {};
            for (const r of tables.api_call_log) { const n = r.referer||"(空)"; map[n]=(map[n]||0)+1; }
            return { results: Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,a[0]).map(([name,count])=>({ name, count })) };
          }
          if (sql.includes("GROUP BY country")) {
            const map = {};
            for (const r of tables.api_call_log) { const n = r.country||"(空)"; map[n]=(map[n]||0)+1; }
            return { results: Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,a[0]).map(([name,count])=>({ name, count })) };
          }
          if (sql.includes("GROUP BY ua")) {
            const map = {};
            for (const r of tables.api_call_log) { const n = r.ua||"(空)"; map[n]=(map[n]||0)+1; }
            return { results: Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,a[0]).map(([name,count])=>({ name, count })) };
          }
          if (sql.includes("NOT LIKE 'eq:%' ORDER BY updated_at DESC")) {
            const list = tables.formula_cache.filter(r => !r.formula.startsWith("eq:")).sort((x,y)=>y.updated_at-x.updated_at).slice(0,a[0]);
            return { results: list.map(r => ({ formula:r.formula, name:r.name||"", source:r.source||"", updated_at:r.updated_at })) };
          }
          if (sql.includes("GROUP BY formula ORDER BY c DESC")) {
            const map = {};
            for (const k in tables.report_usage) { const f = k.split("|")[1]; map[f]=(map[f]||0)+tables.report_usage[k].count; }
            return { results: Object.entries(map).sort((x,y)=>y[1]-x[1]).slice(0,a[0]).map(([formula,c])=>({ formula, c })) };
          }
          throw new Error("unexpected all SQL: " + sql);
        }
      };
      return p;
    },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; }
  };
  return { db, tables };
}

const { db, tables } = mockD1();
const env = { DB: db };
const now = new Date();
const today = now.toISOString().slice(0,10);
const meta = { referer: "example.com", country: "US", ua: "curl/8.0" };

// 1) 第 50 次调用放行并写入计数+明细
let r = await checkAndIncrApi(env, "9.9.9.9", meta);
assert.equal(r.allowed, true, "第50次应放行");
assert.equal(r.used, 50);
assert.equal(tables.api_usage["9.9.9.9|"+today].count, 50);
assert.equal(tables.api_call_log.length, 1, "明细应写入一条");
assert.equal(tables.api_call_log[0].referer, "example.com");
assert.equal(tables.api_call_log[0].country, "US");

// 2) 第 51 次拒绝，且不写明细
r = await checkAndIncrApi(env, "9.9.9.9", meta);
assert.equal(r.allowed, false, "第51次应拒绝");
assert.equal(tables.api_call_log.length, 1, "429 命中不写明细");

// 3) 新 IP 首次调用（无明细写入，meta=null）
r = await checkAndIncrApi(env, "8.8.8.8", null);
assert.equal(r.allowed, true);
assert.equal(r.used, 1);

// 4) 额度查询
const sum = await sumApiUsage(env);
assert.equal(sum.today, 51);
assert.equal(sum.todayIps, 2);
assert.ok(sum.total >= 51);

// 5) 趋势
const trend = await trendApiLog(env, 7);
assert.ok(trend.length >= 1);
assert.equal(trend[trend.length-1].count, 1);

// 6) 目的地聚合
const dest = await destTopApi(env);
assert.equal(dest.referer[0].name, "example.com");
assert.equal(dest.country[0].name, "US");
assert.equal(dest.ua[0].name, "curl/8.0");

// 7) formula_cache TOP（排除 eq:）
const fc = await formulaTopCache(env);
assert.equal(fc.total, 2);
assert.equal(fc.top.length, 1);
assert.equal(fc.top[0].formula, "cuso4");

// 8) 上报统计
const rp = await reportTop(env);
assert.ok(rp.total >= 6);
assert.equal(rp.today, 2);
const topNames = rp.top.map(t => t.formula);
assert.ok(topNames.includes("h2so4") && topNames.includes("naoh"), "TOP 应包含 h2so4 与 naoh");

// 9) 清理
await pruneApiLog(env);
assert.equal(tables.api_call_log.length, 0);

console.log("PASS: chem-cache 全部用例通过");
