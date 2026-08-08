// src/worker.js — Cloudflare Worker
// 判定 fallback 链（借鉴 Formula 项目思想，独立实现）：
//   本地知识库/规则 → D1 缓存(14天 stale-while-revalidate) → PubChem → Wikipedia → Workers AI → 回写 D1
// 路由：
//   GET /api/check?formula=X[&deep=1]   存在性判定（deep=1 触发联网兜底链）
//   GET /api/report?formula=X[&did=Y]   用户上报信息有误 → 限流后强制联网重查并更新缓存
//   GET /api/equation?input=..&condition=..  方程式配平/补全/计量
//   GET /api/health                     健康检查
//   其余                                静态站点（public/）

import { analyze, prettyFormula, detectRadical } from "../public/chem-engine.js";
import { balanceEquation, parseEquation, molarMass, prettyEquation, compositionMassPct } from "../public/chem-calc.js";
import { searchPubChem, pubchemChineseName, searchWiki, searchWikiByName } from "./chem-sources.js";
import { getCached, setCached, checkAndIncrReport, checkAndIncrApi, getEqCached, setEqCached } from "./chem-cache.js";
import { localCompleteReaction, lookupDosage, annotateStates, isReversible } from "./chem-reactions.js";

const AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return json({ ok: true, service: "chem-check", ai: !!env.AI, db: !!env.DB, time: Date.now() });
      }
      // 业务 API：网页同源查询免费无限；外部跨域调用需 API key 且按 IP 限 50/天
      const isApiPath = path.startsWith("/api/check") || path.startsWith("/api/report") || path.startsWith("/api/equation");
      if (isApiPath) {
        const gate = await apiGate(request, env, url);
        if (gate.denied) return gate.resp;
      }
      if (path === "/api/check") {
        const formula = url.searchParams.get("formula") || "";
        const deep = url.searchParams.get("deep") === "1";
        return await handleCheck(formula, deep, env, ctx);
      }
      if (path === "/api/report") {
        const formula = url.searchParams.get("formula") || "";
        const did = (url.searchParams.get("did") || "").trim();
        return await handleReport(formula, did, request, env, ctx);
      }
      if (path === "/api/equation") {
        const input = url.searchParams.get("input") || "";
        const condition = url.searchParams.get("condition") || "";
        return await handleEquation(input, condition, env, ctx);
      }
    } catch (e) {
      return json({ ok: false, error: "服务器错误：" + (e && e.message ? e.message : String(e)) }, 500);
    }

    // 静态资源回退
    try {
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        if (asset && asset.status < 400) return asset;
      }
    } catch (e) { /* ignore */ }
    if (env.ASSETS) {
      const idx = await env.ASSETS.fetch(new URL("/", url.origin));
      if (idx) return idx;
    }
    return new Response("chem-check worker running", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};

// ---------------------------------------------------------------------------
// 存在性判定：fallback 链
// ---------------------------------------------------------------------------
async function handleCheck(formula, deep, env, ctx) {
  const local = analyze(formula);
  if (!local.ok) return json(local, 400);
  local.mass = molarMass(local.normalized) || undefined;
  local.composition = compositionMassPct(local.normalized) || undefined;

  // 1) 本地知识库命中 → 毫秒返回
  if (local.confidence === "high") {
    local.source = "knowledge-base";
    return json(normalizeResult(local));
  }
  // 未收录但未要求 deep → 仅返回本地规则推断
  if (!deep) {
    local.source = "rule";
    return json(normalizeResult(local));
  }

  // 2) D1 缓存
  const cached = await getCached(env, formula);
  if (cached) {
    if (!cached.stale) {
      return json(normalizeResult({ ...cached.result, fromCache: true }));
    }
    // 过期：先返回旧值，后台联网刷新
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil((async () => {
        try { const fresh = await enrichOnline(local, env); await setCached(env, formula, fresh); } catch (e) {}
      })());
    }
    return json(normalizeResult({ ...cached.result, fromCache: true, stale: true }));
  }

  // 3) 联网：PubChem → Wiki → AI
  const result = await enrichOnline(local, env);
  // 4) 回写缓存（拿到有效结论才缓存）
  if (result.source !== "rule-fallback" && ctx && ctx.waitUntil) {
    ctx.waitUntil(setCached(env, formula, result));
  }
  return json(normalizeResult(result));
}

// 上报：信息有误 → 限流后强制联网重查并更新缓存
async function handleReport(formula, did, request, env, ctx) {
  const local = analyze(formula);
  if (!local.ok) return json({ ok: false, error: local.error || "无法解析" }, 200);
  if (local.confidence === "high") {
    return json({ ok: false, error: "该条目来自本地精选知识库，不支持上报刷新" }, 200);
  }
  const deviceId = did || getDeviceId(request);
  const limit = await checkAndIncrReport(env, deviceId, formula);
  if (!limit.allowed) {
    const msg = limit.reason === "daily_total"
      ? `今日上报次数已达上限（${limit.dailyLimit} 次），请明日再试`
      : `该化学式今日上报次数已达上限（${limit.formulaLimit} 次），请明日再试`;
    return json({ ok: false, error: msg, limited: true, limit }, 429);
  }
  local.mass = molarMass(local.normalized) || undefined;
  local.composition = compositionMassPct(local.normalized) || undefined;
  const result = await enrichOnline(local, env);
  if (result.source !== "rule-fallback" && ctx && ctx.waitUntil) {
    ctx.waitUntil(setCached(env, formula, result));
  }
  return json({ ok: true, result: normalizeResult(result), limit: { dailyUsed: limit.dailyUsed, dailyLimit: limit.dailyLimit, formulaUsed: limit.formulaUsed, formulaLimit: limit.formulaLimit } });
}

// 设备指纹兜底：无 did 时用 IP + UA 的 djb2 哈希
function getDeviceId(request) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const ua = request.headers.get("User-Agent") || "unknown";
  const src = ip + "|" + ua;
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) >>> 0;
  return "ip-" + h.toString(16);
}

// 联网兜底：PubChem（权威存在性）→ Wikipedia（事实/中文名）→ AI（总结注意事项）
async function enrichOnline(local, env) {
  const sources = [];
  const localHints = local.ruleNote ? [local.ruleNote] : [];
  const mass = local.mass || molarMass(local.normalized) || 0;

  const pub = await searchPubChem(local.normalized);

  // —— PubChem 命中 → 存在性被权威数据库证实 ——
  if (pub.ok && pub.hits.length) {
    const top = pub.hits[0];
    sources.push({ label: `PubChem CID ${top.cid}`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${top.cid}` });
    const cnName = await pubchemChineseName(top.cid).catch(() => null);
    const wiki = await searchWikiByName(top.iupacName || top.title || local.normalized, local.normalized).catch(() => null);
    if (wiki?.zh?.url) sources.push({ label: wiki.zh.source === "wikidata" ? "维基数据" : "维基百科（中文）", url: wiki.zh.url });
    if (wiki?.en?.url) sources.push({ label: wiki.en.source === "wikidata" ? "维基数据（英文）" : "维基百科（英文）", url: wiki.en.url });

    const ai = await aiJudgeSubstance(env, { formula: local.normalized, composition: local.elements, mass, charge: local.charge, pubchem: { name: top.iupacName || top.title, cid: top.cid, isomers: pub.count }, wiki, localHints });
    const name = firstTrust(ai?.name) || cnName || wikiNameCn(wiki) || local.name || (top.title || top.iupacName);
    const notes = [];
    notes.push(`PubChem（美国国家化学数据库，1.1 亿+ 化合物）已收录该化学式（CID ${top.cid}，规范化式 ${top.molecularFormula}，分子量 ${top.molecularWeight}），存在性得到联网证实。`);
    if (ai && ai.ok && ai.notes.length) notes.push(...ai.notes);
    return {
      ok: true, input: local.input, normalized: local.normalized, elements: local.elements, charge: local.charge,
      name, verdict: "yes", confidence: "high", source: "pubchem", sources,
      notes, warnings: buildWarnings(ai?.tags || []), tags: ai?.tags || [], related: ai?.related || [],
      colors: (ai && ai.colors) || local.colors || null,
      redox: ai?.redox || null, solubility: ai?.solubility || null,
      mass: top.molecularWeight || mass, ruleNote: local.ruleNote,
      radical: local.radical, composition: local.composition
    };
  }

  // —— PubChem 未命中 → Wikipedia + AI 综合判断 ——
  const wiki = await searchWiki(local.normalized).catch(() => null);
  if (wiki?.zh?.url) sources.push({ label: wiki.zh.source === "wikidata" ? "维基数据" : "维基百科（中文）", url: wiki.zh.url });
  if (wiki?.en?.url) sources.push({ label: wiki.en.source === "wikidata" ? "维基数据（英文）" : "维基百科（英文）", url: wiki.en.url });

  const ai = await aiJudgeSubstance(env, { formula: local.normalized, composition: local.elements, mass, charge: local.charge, pubchem: null, wiki, localHints });
  if (ai && ai.ok) {
    return {
      ok: true, input: local.input, normalized: local.normalized, elements: local.elements, charge: local.charge,
      name: firstTrust(ai.name) || wikiNameCn(wiki) || local.name,
      verdict: ai.verdict, confidence: "ai", source: "workers-ai", sources,
      notes: ai.notes, warnings: buildWarnings(ai.tags), tags: ai.tags, related: ai.related,
      colors: ai.colors || local.colors || null,
      redox: ai.redox || null, solubility: ai.solubility || null,
      mass, ruleNote: local.ruleNote,
      radical: local.radical, composition: local.composition
    };
  }

  // —— AI 也不可用 → 回退本地规则 ——
  return { ...local, source: "rule-fallback", sources, aiError: "联网与 AI 暂不可用，已按价键规则推断" };
}

// ---------------------------------------------------------------------------
// Workers AI：基于事实的判定
// ---------------------------------------------------------------------------
async function aiJudgeSubstance(env, c) {
  if (!env?.AI) return null;
  // 边缘偶发失败/冷启动 → 重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await aiJudgeOnce(env, c);
    if (r) return r;
  }
  return null;
}

async function aiJudgeOnce(env, c) {
  const elems = Object.entries(c.composition || {}).map(([k, v]) => `${k}×${v}`).join(", ");
  const isIon = (c.charge ?? 0) !== 0;
  const ionLine = isIon ? `\n重要：该式带电荷 ${c.charge > 0 ? "+" : ""}${c.charge}，是离子而非中性物质，颜色/氧化还原/溶解度请针对该离子描述。` : "";

  const facts = [];
  if (c.pubchem?.name) facts.push(`PubChem 已证实该化学式存在（CID ${c.pubchem.cid}），名称 ${c.pubchem.name}${c.pubchem.isomers ? `，共 ${c.pubchem.isomers} 种同分异构体` : ""}。`);
  else facts.push("PubChem 未收录该化学式。");
  if (c.wiki?.zh?.extract) facts.push(`中文维基《${c.wiki.zh.title}》：${c.wiki.zh.extract}`);
  if (c.wiki?.en?.extract) facts.push(`英文维基《${c.wiki.en.title}》：${c.wiki.en.extract}`);
  if (c.localHints?.length) facts.push(`本地价态分析：${c.localHints.join("；")}。`);

  const system =
    "你是严谨的化学专家。基于已给事实判断该化学物质，只输出一个 JSON 对象（禁止 markdown、禁止思考过程、禁止解释文字）。\n\n" +
    "【JSON 结构（所有字段必须出现，无资料给空数组 []，不得省略任何字段）】\n" +
    "{\n" +
    '  "verdict": "yes|conditional|unstable|no",\n' +
    '  "name": "规范中文名",\n' +
    '  "notes": ["2-4条具体可操作的中文注意事项"],\n' +
    '  "tags": ["危险标签"],\n' +
    '  "related": ["相关化学式"],\n' +
    '  "colors": [{"form":"形态","color":"中文颜色","hex":"#十六进制色值","ion":null}],\n' +
    '  "redox": [{"condition":"条件","behavior":"氧化性|还原性|歧化|无","detail":"具体描述"}],\n' +
    '  "solubility": [{"solvent":"溶剂","value":"易溶|可溶|微溶|难溶|不溶","note":"具体数值或说明"}]\n' +
    "}\n\n" +
    "【字段规则】\n" +
    "verdict：yes=稳定存在；conditional=仅特定条件/亚稳存在；unstable=可生成但极不稳定易分解；no=通常不存在。\n" +
    "name：规范中文名（按无机命名规则推算，如 某酸某/某化某/高某酸某），不要直接抄英文 IUPAC 名。\n" +
    "notes：2-4 条具体注意事项（稳定性/保存/毒性/反应性/制取），每条一句完整中文，不要过于简略。\n" +
    "tags：只能从 toxic|corrosive|explosive|oxidize|unstable|charged 中选，无关则给空数组 []。\n" +
    "related：相关化学式，最多 5 个，无则空数组。\n" +
    "colors：按形态分类（固体/晶体/水溶液/气体等）；无色写 color=\"无色\"、hex=\"#f6f6f2\"；" +
    "ion 填导致该颜色的离子/物种（如 \"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺\"、\"MnO₄⁻\"、\"Fe³⁺\" 等），若颜色来自物质整体而非特定离子则填 null；无资料给空数组。\n" +
    "redox：按条件分类讨论氧化/还原性（如 在水中、在酸性条件下、在碱性条件下、加热时等）；" +
    "behavior 从「氧化性/还原性/歧化/既氧化又还原/无显著氧化还原性」中选；detail 给具体描述（如 能氧化I⁻为I₂、被KMnO₄氧化等）；无资料给空数组。\n" +
    "solubility：按溶剂分类（水、乙醇、丙酮、苯等）；value 从「易溶/可溶/微溶/难溶/不溶」中选；" +
    "note 给具体数值（如 20°C 约 23g/100mL）或反应说明（如 遇水分解）；无资料给空数组。\n\n" +
    "【重要原则】\n" +
    "1. PubChem 未收录 ≠ 不存在——许多无机盐、配合物、水合物、高价含氧酸盐（如 K2MnO4、Na2FeO4）在 PubChem 中可能搜不到但确实存在，请结合价态与你的知识判断。\n" +
    "2. 基于事实下明确结论，不要堆砌“可能/也许”。\n" +
    "3. 所有字段必须出现，即使为空数组 []，也不得省略。\n" +
    "4. 只输出 JSON，不要任何解释文字。\n\n" +
    "【正确示例 - CuSO4】\n" +
    '{"verdict":"yes","name":"硫酸铜","notes":["无水硫酸铜为白色粉末，吸水后变蓝，可作干燥剂。","五水合物 CuSO4·5H2O 俗称胆矾，蓝色晶体。","重金属盐有毒，避免误食，废液按含铜废液处理。"],"tags":["toxic"],"related":["CuSO4·5H2O","Cu(OH)2","BaCl2"],"colors":[{"form":"无水固体","color":"白色","hex":"#f4f4f0","ion":null},{"form":"水溶液","color":"蓝色","hex":"#2e6fd6","ion":"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺"}],"redox":[{"condition":"在水中","behavior":"无显著氧化还原性","detail":"Cu²⁺ 较稳定，不氧化水。"},{"condition":"活泼金属置换","behavior":"氧化性","detail":"Cu²⁺ 可被 Zn/Fe 置换为 Cu 单质。"}],"solubility":[{"solvent":"水","value":"易溶","note":"20°C 约 23g/100mL"},{"solvent":"乙醇","value":"微溶","note":"难溶于无水乙醇"}]}\n\n' +
    "【错误示例（禁止这样做）】\n" +
    "× 省略 colors/redox/solubility 字段\n" +
    "× color 写\"蓝色\"但不给 ion 来源\n" +
    "× redox 只写一条\"具有氧化性\"不分条件\n" +
    "× solubility 只写\"可溶于水\"不分溶剂\n" +
    "× notes 写\"有毒\"过于简略";

  const user = `化学式：${c.formula}\n元素组成：${elems}\n近似摩尔质量：${mass2(c.mass)} g/mol${ionLine}\n\n已知事实：\n${facts.join("\n")}\n\n请输出 JSON。`;

  const raw = await runAI(env, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_tokens: 1800 });
  const data = extractJSON(raw, "verdict");
  if (!data) return null;
  const tag = "（AI 推断，仅供参考）";

  // colors：增加 ion 显色来源字段
  const colors = (Array.isArray(data.colors) ? data.colors : [])
    .map(x => {
      if (!x || typeof x !== "object" || !x.form || !x.color) return null;
      const ion = (x.ion === null || x.ion === undefined) ? null : String(x.ion);
      return {
        form: String(x.form),
        color: String(x.color),
        hex: (typeof x.hex === "string" && /^#[0-9a-fA-F]{3,6}$/.test(x.hex) ? x.hex : "#cccccc"),
        ion
      };
    })
    .filter(Boolean).slice(0, 8);

  // redox：分类讨论氧化/还原性
  const redox = (Array.isArray(data.redox) ? data.redox : [])
    .map(x => {
      if (!x || typeof x !== "object") return null;
      return {
        condition: x.condition ? String(x.condition) : "未明确",
        behavior: x.behavior ? String(x.behavior) : "无",
        detail: x.detail ? String(x.detail) : ""
      };
    })
    .filter(Boolean).slice(0, 6);

  // solubility：分类溶解度
  const solubility = (Array.isArray(data.solubility) ? data.solubility : [])
    .map(x => {
      if (!x || typeof x !== "object") return null;
      return {
        solvent: x.solvent ? String(x.solvent) : "水",
        value: x.value ? String(x.value) : "未知",
        note: x.note ? String(x.note) : ""
      };
    })
    .filter(Boolean).slice(0, 6);

  return {
    ok: true,
    verdict: ["yes", "conditional", "unstable", "no"].includes(data.verdict) ? data.verdict : "conditional",
    name: typeof data.name === "string" ? data.name : null,
    notes: (Array.isArray(data.notes) ? data.notes : []).map(x => String(x) + tag).slice(0, 4),
    tags: (Array.isArray(data.tags) ? data.tags : []).filter(t => ["toxic", "corrosive", "explosive", "oxidize", "unstable", "charged"].includes(t)),
    related: Array.isArray(data.related) ? data.related.map(String).slice(0, 5) : [],
    colors: colors.length ? colors : undefined,
    redox: redox.length ? redox : undefined,
    solubility: solubility.length ? solubility : undefined
  };
}

function mass2(m){ return (typeof m === "number" && isFinite(m)) ? m.toFixed(2) : "未知"; }

// ---------------------------------------------------------------------------
// 方程式配平与计算
// ---------------------------------------------------------------------------
async function handleEquation(input, condition, env, ctx) {
  if (!input.trim()) return json({ ok: false, error: "请输入反应物或完整方程式" }, 400);
  const eq = parseEquation(input);
  if (eq.error) return json({ ok: false, error: eq.error }, 400);

  // D1 缓存：仅缓存「AI 补全」的结果（昂贵）；配平/本地/剂量都是本地即时计算，不缓存以免引擎更新后残留旧值
  const cacheKey = (input.trim() + "|" + (condition || "").trim()).toLowerCase();

  // 完整方程式 → 直接配平（本地、确定性，不缓存）
  if (!eq.reactantsOnly) {
    const r = balanceEquation(input);
    if (!r.ok) return json({ ok: false, error: r.error }, 400);
    return json(buildEquationResponse(r, { mode: "balance", input, source: "local" }));
  }

  // 仅反应物
  const reactants = eq.left;
  // 1) 剂量相关反应（本地，多个方程式）
  const dosage = lookupDosage(reactants);
  if (dosage) {
    const result = buildDosageResponse(dosage, input, condition);
    if (result.ok) return json(result);
  }
  // 2) 本地规则补全
  let completion = localCompleteReaction(reactants);
  // 3) AI 补全（昂贵 → 走 D1 缓存）
  if (!completion || !completion.left.length || !completion.right.length) {
    const cached = await getEqCached(env, cacheKey);
    if (cached && !cached.stale) return json({ ...cached.result, fromCache: true });
    if (env.AI) completion = await aiCompleteReaction(reactants, condition, env);
    if (completion && completion.left.length && completion.right.length) completion._ai = true;
  }
  if (!completion || !completion.left.length || !completion.right.length) {
    return json({ ok: false, error: "无法自动补全产物。请提供完整方程式（含产物）以进行配平，例如 HCl+NaOH=NaCl+H2O。", reactants }, 200);
  }
  const combined = completion.left.join("+") + "=" + completion.right.join("+");
  const r = balanceEquation(combined);
  if (!r.ok) return json({ ok: false, error: "补全的产物无法配平：" + r.error, completion }, 200);
  const result = buildEquationResponse(r, { mode: "completion", input, type: completion.type || null, note: completion.note || null, condition: condition || null, ai: completion._ai || false, source: completion._ai ? "workers-ai" : "local" });
  if (completion._ai && ctx && ctx.waitUntil) ctx.waitUntil(setEqCached(env, cacheKey, result));
  return json(result);
}

// 生成一侧的字符串（系数 + 下标化学式 + 状态符号）
function sideStr(list) {
  return list.map(o => (o.coeff > 1 ? o.coeff : "") + prettyFormula(o.formula) + (o.state || "")).join(" + ");
}

// 物种详情：名称、摩尔质量、存在性（用于校验不存在的物质）
function speciesDetail(o) {
  const info = analyze(o.formula);
  return {
    formula: o.formula, coeff: o.coeff, state: o.state,
    molarMass: molarMass(o.formula),
    name: info && info.ok ? info.name : null,
    verdict: info && info.ok ? info.verdict : null,
    colors: info && info.ok ? (info.colors || null) : null
  };
}

function buildEquationResponse(r, extra) {
  const right = annotateStates(r.left, r.right.map(o => ({ ...o })));
  const reversible = isReversible(r.left.map(o => o.formula), r.right.map(o => o.formula));
  const arrow = reversible ? "⇌" : "→";
  const all = [...r.left, ...right];
  const species = all.map(speciesDetail);
  const nonexistent = species.filter(s => s.verdict === "no").map(s => s.formula);
  return {
    ok: true,
    equation: sideStr(r.left) + " " + arrow + " " + sideStr(right),
    arrow, reversible,
    left: species.slice(0, r.left.length),
    right: species.slice(r.left.length),
    species,
    nonexistent: nonexistent.length ? nonexistent : undefined,
    ...extra
  };
}

// 剂量相关反应：为每个变体配平 + 标注状态 + 可逆
function buildDosageResponse(dosage, input, condition) {
  const variants = [];
  for (const v of dosage.variants) {
    const bal = balanceEquation(v.left.join("+") + "=" + v.right.join("+"));
    if (!bal.ok) continue;
    const right = annotateStates(bal.left, bal.right.map(o => ({ ...o })));
    const reversible = isReversible(bal.left.map(o => o.formula), bal.right.map(o => o.formula));
    const arrow = reversible ? "⇌" : "→";
    const all = [...bal.left, ...right];
    const species = all.map(speciesDetail);
    variants.push({
      label: v.label, note: v.note || "",
      equation: sideStr(bal.left) + " " + arrow + " " + sideStr(right),
      arrow, reversible,
      left: species.slice(0, bal.left.length),
      right: species.slice(bal.left.length),
      species
    });
  }
  if (!variants.length) return { ok: false };
  return {
    ok: true, mode: "dosage", source: "local",
    title: dosage.title, input, condition: condition || null,
    note: "该反应因反应物用量（少量/过量）不同而有不同方程式，已全部列出。",
    variants
  };
}

async function aiCompleteReaction(reactants, condition, env) {
  const sys =
    "你是资深化学专家。给定反应物（可能含条件），预测产物并给出反应物与产物的化学式。只输出 JSON：" +
    '{"left":["反应物化学式"],"right":["产物化学式"],"type":"反应类型","note":"一句话说明"}。' +
    "要求：化学式用标准写法且不写系数、不写物态；type 如 酸碱中和/置换/化合/分解/复分解/氧化还原。若该组合通常不反应，输出 {\"left\":[],\"right\":[],\"type\":\"不反应\",\"note\":\"原因\"}。只输出 JSON。";
  const user = `反应物：${reactants.join(" + ")}。条件：${condition && condition.trim() ? condition : "无（常温常压，默认水溶液/通常条件）"}。`;
  const raw = await runAI(env, { messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.2, max_tokens: 500 });
  const data = extractJSON(raw, "left");
  if (!data) return null;
  const left = (Array.isArray(data.left) ? data.left : []).map(sanitizeSpecies).filter(Boolean);
  const right = (Array.isArray(data.right) ? data.right : []).map(sanitizeSpecies).filter(Boolean);
  return { left, right, type: typeof data.type === "string" ? data.type : null, note: typeof data.note === "string" ? data.note : null, _ai: true };
}



function sanitizeSpecies(s) {
  if (typeof s !== "string") return "";
  let x = s.trim();
  x = x.replace(/[（(](aq|s|l|g)[)）]/gi, "");
  x = x.replace(/^\d+/, "");
  x = x.replace(/\s+/g, "");
  x = x.replace(/[·•・]/g, ".");
  return x;
}

// ---------------------------------------------------------------------------
// Workers AI 调用 + 稳健 JSON 提取
// ---------------------------------------------------------------------------
async function runAI(env, opts) {
  try {
    const payload = {
      messages: opts.messages,
      temperature: opts.temperature != null ? opts.temperature : 0.2,
      max_tokens: opts.max_tokens != null ? opts.max_tokens : 800,
      enable_thinking: false
    };
    const res = await env.AI.run(AI_MODEL, payload);
    if (!res) return null;
    if (res.choices && res.choices[0] && res.choices[0].message && typeof res.choices[0].message.content === "string") return res.choices[0].message.content;
    if (typeof res.response === "string") return res.response;
    if (res.response && typeof res.response === "object") return JSON.stringify(res.response);
    if (typeof res.result === "string") return res.result;
    return JSON.stringify(res);
  } catch (e) { return null; }
}

// 稳健提取 JSON：去 think 标签/markdown，优先定位含关键键（keyHint）的对象
function extractJSON(raw, keyHint) {
  if (!raw) return null;
  let s = String(raw);
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "");
  s = s.replace(/```(?:json|JSON)?/g, "").replace(/```/g, "");
  const tryParse = (slice) => { try { return JSON.parse(slice); } catch { try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } } };
  if (keyHint) {
    const ki = s.lastIndexOf('"' + keyHint + '"');
    if (ki > 0) {
      let start = -1;
      for (let i = ki; i >= 0; i--) { if (s[i] === "{") { start = i; break; } }
      const end = s.lastIndexOf("}");
      if (start >= 0 && end > start) { const r = tryParse(s.slice(start, end + 1)); if (r) return r; }
    }
  }
  const ls = s.lastIndexOf("{"), le = s.lastIndexOf("}");
  if (ls >= 0 && le > ls) { const r = tryParse(s.slice(ls, le + 1)); if (r) return r; }
  const fs = s.indexOf("{"), fe = s.lastIndexOf("}");
  if (fs >= 0 && fe > fs) return tryParse(s.slice(fs, fe + 1));
  return null;
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------
// 中文名可信过滤：剔除 WikiData 误命中的英文句子/论文标题/全大写串/列表页
const BAD_NAME = /列表|索引|消歧义|list of|^list\b|category:|template:|draft:|wikipedia:|wiki\:/i;
function firstTrust(s) {
  if (!s) return undefined;
  const t = String(s).trim();
  if (!t) return undefined;
  if (BAD_NAME.test(t)) return undefined;
  if (/^[A-Z0-9 \-:,().]+$/i.test(t) && (t.match(/\s/g) || []).length >= 3) return undefined;
  if (/^[A-Z\s]+$/.test(t)) return undefined;
  const cnCount = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  if (t.length > 30 && cnCount < 2) return undefined;
  return t;
}
function wikiNameCn(wiki) {
  if (!wiki?.zh) return undefined;
  // 对所有来源都过 firstTrust，剔除"XX列表/索引"等非物质条目
  return firstTrust(wiki.zh.title);
}
function buildWarnings(tags) {
  const map = {
    toxic: "⚠ 剧毒：避免接触与误食，操作戴防护，废液按规定处理。",
    corrosive: "⚠ 腐蚀性：避免接触皮肤/眼睛，稀释时遵循安全顺序并通风。",
    explosive: "⚠ 爆炸/强氧化：远离可燃物、还原剂、撞击与高温。",
    oxidize: "⚠ 易氧化/强氧化：密封避光、隔绝空气保存。",
    unstable: "⚠ 不稳定：受热、光照或久置易分解，现配现用。",
    charged: "该式表示离子，需与反离子组成中性物质。"
  };
  const out = [];
  for (const t of (tags || [])) if (map[t]) out.push(map[t]);
  return out;
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...(headers || {}) }
  });
}

// ---------------------------------------------------------------------------
// API 网关：同源网页查询免费无限；外部跨域调用需 ?key= 且按 IP 限 50/天
// ---------------------------------------------------------------------------
function sameOrigin(request, url) {
  const origin = request.headers.get("Origin") || "";
  const referer = request.headers.get("Referer") || "";
  const host = url.host;
  if (origin) {
    try { return new URL(origin).host === host; } catch { /* fallthrough */ }
  }
  if (referer) {
    try { return new URL(referer).host === host; } catch { /* fallthrough */ }
  }
  return false;
}

async function apiGate(request, env, url) {
  // 1) 同源（网页查询）→ 放行，不计限流
  if (sameOrigin(request, url)) return { denied: false };
  // 2) 外部跨域调用 → 必须带有效 API key
  const key = (url.searchParams.get("key") || "").trim();
  if (!key) {
    return {
      denied: true,
      resp: json({ ok: false, error: "外部 API 调用需要 API key。请在 URL 加 ?key=<你的key>。生成方式见 README「API 调用教程」。" }, 401)
    };
  }
  const validKeys = (env.API_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!validKeys.length || !validKeys.includes(key)) {
    return { denied: true, resp: json({ ok: false, error: "API key 无效。" }, 403) };
  }
  // 3) 按 IP 限流 50/天
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const limit = await checkAndIncrApi(env, ip);
  if (!limit.allowed) {
    return {
      denied: true,
      resp: json({ ok: false, error: `今日 API 调用已达上限（${limit.limit} 次/IP/天），请明日再试。`, limit }, 429, {
        "X-RateLimit-Limit": String(limit.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 86400),
        "Retry-After": "86400"
      })
    };
  }
  return { denied: false, limit };
}

// ---------------------------------------------------------------------------
// 统一结构化返回：所有字段必现，缺失填"无"/[]（降低前端判空与 AI 漏字段风险）
// ---------------------------------------------------------------------------
function normalizeResult(res) {
  if (!res || res.ok === false) return res;
  const none = (arr) => Array.isArray(arr) && arr.length ? arr : [];
  return {
    ok: true,
    input: res.input || "",
    normalized: res.normalized || "",
    name: res.name || "无",
    verdict: res.verdict || "conditional",
    confidence: res.confidence || "medium",
    source: res.source || "rule",
    elements: res.elements || {},
    charge: res.charge ?? 0,
    mass: (res.mass && isFinite(res.mass)) ? res.mass : null,
    composition: none(res.composition),
    radical: res.radical || null,
    hazards: none(res.tags),                      // 危险信息（原 tags 重命名）
    redox: none(res.redox),                       // 氧化/还原性（分类讨论）
    colors: none(res.colors),                     // 颜色（每项含 ion 显色来源）
    solubility: none(res.solubility),             // 溶解度（分类）
    warnings: none(res.warnings),
    notes: none(res.notes),
    sources: none(res.sources),
    related: none(res.related),
    fromCache: res.fromCache || false,
    stale: res.stale || false,
    ruleNote: res.ruleNote || null
  };
}
