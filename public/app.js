// app.js — 前端逻辑
// 判定：本地知识库/规则即时判定，未收录自动调用 Workers AI 深度判定
// 配平·计算：调用 /api/equation，展示配平方程式、摩尔质量，并提供化学计量计算器
import { analyze, prettyFormula, verdictText, TEMPLATES } from "/chem-engine.js";
import { compositionMassPct } from "/chem-calc.js";

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

// ────────────────────────── 主题 / 语言 ──────────────────────────
const I18N = {
  cn:{
    brand:"化学式速查",
    eyebrow:"存在性判定 · 方程式配平 · 化学计量",
    title:"这个化学式，<br/>到底存不存在？",
    lede:"输入任意化学式即刻判定——命中知识库即返，未收录的交由云端 AI 深度判定。还能给方程式配平、算摩尔质量与化学计量。比如氢氧化银，只在特定条件下存在，空气中很快脱水成氧化银。",
    mode_check:"物质判定", mode_eq:"配平 · 计算",
    label_formula:"化学式", label_eq:"反应物或完整方程式",
    label_cond:"反应条件（可留空，默认 Null）",
    btn_check:"判定", btn_eq:"配平", try:"试试",
    note_title:'关于"所有化学式"与云端 AI',
    note_body:'本地内置约 110 种常见与特殊物质（含注意事项），并用价键/氧化态规则即时推断其余。命中知识库毫秒即返；<strong>未收录的物质自动调用 Cloudflare Workers AI（Qwen3-30B）深度判定</strong>，给出名称、存在性与注意事项。方程式配平采用代数法（保证原子守恒），仅给反应物时先走本地规则、再由 AI 补全产物。规则与 AI 均为辅助判断，权威结论以实验与文献为准。',
    footer:"本地即时判定 · Workers AI 深度判定 · 代数配平与计量 · 教育用途，危险物质操作请遵循实验室规范",
    stamp:{ yes:"稳定存在", conditional:"特定条件", unstable:"极不稳定", no:"不存在", waiting:"待核实" },
    sec_composition:"元素质量分数", sec_radical:"结构特征",
    sec_hazards:"危险信息", sec_colors:"颜色与形态", sec_redox:"氧化/还原性", sec_solubility:"溶解度", sec_warnings:"安全提示",
    sec_notes:"说明与注意事项", sec_sources:"数据来源", sec_related:"相关物质",
    lbl_ion:"显色来源", lbl_none:"无",
    meta_composition:"组成", meta_mass:"摩尔质量", meta_charge:"总电荷", meta_source:"判定来源",
    loading_deep:"联网深度判定中（PubChem / 维基 / AI）…",
    loading_eq:"正在配平 / 调用云端…",
    report_btn:"结果有误？上报并联网刷新",
    calc_title:"化学计量计算", calc_species:"物质", calc_coeff:"系数",
    calc_amount:"物质的量", calc_mass:"质量", calc_name:"名称",
    eqtable_M:"M (g/mol)",
    side_reactant:"反应物", side_product:"生成物",
    err_parse:"无法解析该化学式，请检查元素符号、括号与电荷写法。",
    err_eq:"请求失败，请稍后再试。",
  },
  en:{
    brand:"Formula Assay",
    eyebrow:"Existence · Balancing · Stoichiometry",
    title:"Does this formula<br/>really exist?",
    lede:"Type any chemical formula for instant judgment — knowledge-base hits return immediately, unknowns go to cloud AI for deep analysis. Also balances equations, computes molar mass and stoichiometry. e.g. AgOH only exists transiently, dehydrating to Ag₂O in air.",
    mode_check:"Substance", mode_eq:"Balance · Calc",
    label_formula:"Formula", label_eq:"Reactants or full equation",
    label_cond:"Conditions (optional, default None)",
    btn_check:"Check", btn_eq:"Balance", try:"Try",
    note_title:'About "all formulas" & cloud AI',
    note_body:'The local knowledge base covers ~110 common and special substances (with safety notes); the rest is inferred instantly via valence/oxidation-state rules. KB hits return in milliseconds; <strong>unknowns are sent to Cloudflare Workers AI (Qwen3-30B)</strong> for deep judgment — name, existence, and safety notes. Equation balancing uses the algebraic method (guarantees atom conservation); given only reactants, local rules predict products first, then AI. All rules and AI are advisory — authoritative conclusions come from experiments and literature.',
    footer:"Instant local · Workers AI deep · Algebraic balancing · For education — follow lab safety for hazardous substances",
    stamp:{ yes:"Exists", conditional:"Conditional", unstable:"Unstable", no:"Not found", waiting:"WAITING" },
    sec_composition:"Element Mass Fraction", sec_radical:"Structural Feature",
    sec_hazards:"Hazards", sec_colors:"Color & Form", sec_redox:"Redox Properties", sec_solubility:"Solubility", sec_warnings:"Safety",
    sec_notes:"Notes & Precautions", sec_sources:"Sources", sec_related:"Related",
    lbl_ion:"Color source", lbl_none:"None",
    meta_composition:"Composition", meta_mass:"Molar mass", meta_charge:"Total charge", meta_source:"Source",
    loading_deep:"Online deep lookup (PubChem / Wiki / AI)…",
    loading_eq:"Balancing / calling cloud…",
    report_btn:"Wrong result? Report & refresh online",
    calc_title:"Stoichiometry Calculator", calc_species:"Species", calc_coeff:"Coeff",
    calc_amount:"Amount (mol)", calc_mass:"Mass (g)", calc_name:"Name",
    eqtable_M:"M (g/mol)",
    side_reactant:"Reactant", side_product:"Product",
    err_parse:"Cannot parse this formula. Check element symbols, parentheses, and charge notation.",
    err_eq:"Request failed, please try again later.",
  }
};
let lang = localStorage.getItem("chem_lang") || "cn";
function t(key){ const d=I18N[lang]; return key.split(".").reduce((o,k)=>o&&o[k], d) ?? key; }

function applyLang(){
  document.documentElement.setAttribute("data-lang", lang);
  document.documentElement.lang = lang==="cn"?"zh-CN":"en";
  $$("[data-i18n]").forEach(el=>{ el.innerHTML = t(el.dataset.i18n) || el.innerHTML; });
  // toggle button visual
  const segs = $$("#lang-toggle .seg span");
  if(segs.length===2){
    segs[0].classList.toggle("on", lang==="cn");
    segs[1].classList.toggle("on", lang==="en");
  }
}

function applyTheme(){
  const theme = document.documentElement.getAttribute("data-theme");
  const segs = $$("#theme-toggle .seg span");
  if(segs.length===2){
    segs[0].classList.toggle("on", theme==="light");
    segs[1].classList.toggle("on", theme==="dark");
  }
}

function toggleLang(){
  lang = lang==="cn"?"en":"cn";
  localStorage.setItem("chem_lang", lang);
  applyLang();
  // re-render current result if exists
  if(lastCheckResult) renderReport(lastCheckResult.data, lastCheckResult.raw, { deep:false, refined:lastCheckResult.refined });
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("chem_theme", next);
  applyTheme();
}
// init from storage
(function initPrefs(){
  const savedTheme = localStorage.getItem("chem_theme");
  if(savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  else if(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.setAttribute("data-theme","dark");
  applyTheme();
  applyLang();
})();
$("#lang-toggle").addEventListener("click", toggleLang);
$("#theme-toggle").addEventListener("click", toggleTheme);

let lastCheckResult = null;

// ────────────────────────── 模式切换 ──────────────────────────
$$(".mode").forEach(btn=>{
  btn.addEventListener("click",()=>{
    $$(".mode").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const m = btn.dataset.mode;
    $("#panel-check").classList.toggle("hidden", m!=="check");
    $("#panel-eq").classList.toggle("hidden", m!=="eq");
  });
});

// ────────────────────────── 判定模式 ──────────────────────────
const input = $("#formula");
const preview = $("#preview");
const resultBox = $("#result");

TEMPLATES.forEach(t=>{
  const b=document.createElement("button");
  b.className="tpl"; b.textContent=t.label; b.title=t.ins;
  b.addEventListener("click",()=>insertTemplate(t));
  $("#templates").appendChild(b);
});
function insertTemplate(t){
  const s=input.selectionStart ?? input.value.length;
  const e=input.selectionEnd ?? input.value.length;
  let val=input.value;
  if(t.type==="wrap"){
    const sel=val.slice(s,e)||"";
    val=val.slice(0,s)+t.ins.slice(0,1)+sel+t.ins.slice(1)+val.slice(e);
    const caret=s+1+sel.length; input.value=val; input.focus(); input.setSelectionRange(caret,caret);
  }else{
    val=val.slice(0,s)+t.ins+val.slice(e);
    const caret=s+t.ins.length; input.value=val; input.focus(); input.setSelectionRange(caret,caret);
  }
  updatePreview();
}
input.addEventListener("input", updatePreview);
input.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doCheck(); });
$("#check").addEventListener("click", doCheck);
$$("#panel-check .chip").forEach(c=>c.addEventListener("click",()=>{ input.value=c.dataset.f; updatePreview(); doCheck(); }));
function updatePreview(){ const v=input.value.trim(); preview.textContent=v?prettyFormula(v):""; }

let checkSeq = 0;
async function doCheck(){
  const raw=input.value.trim();
  if(!raw){ resultBox.innerHTML=""; lastCheckResult=null; return; }
  const seq = ++checkSeq;
  let local;
  try{ local = analyze(raw); }catch(e){ local=null; }
  if(!local){ resultBox.innerHTML = errHtml(t("err_parse")); lastCheckResult=null; return; }
  if(!local.ok){ resultBox.innerHTML = errHtml(local.error||t("err_parse")); lastCheckResult=null; return; }

  // 未命中知识库 → 先渲染 waiting 状态，再联网查询
  const goingDeep = local.confidence!=="high";
  // 始终计算元素质量分数组成（无论是否命中知识库）
  local.composition = compositionMassPct(local.normalized) || undefined;
  if(goingDeep){
    renderReport(local, raw, { deep:true, waiting:true });
  } else {
    renderReport(local, raw, { deep:false });
  }

  if(goingDeep){
    try{
      const r=await fetch("/api/check?formula="+encodeURIComponent(raw)+"&deep=1");
      if(r.ok){
        const ai=await r.json();
        if(seq===checkSeq && ai && ai.ok){
          renderReport(ai, raw, { deep:false, refined:true });
          lastCheckResult = { data:ai, raw, refined:true };
        }
      } else if(seq===checkSeq){
        // 联网失败 → 回退本地推断（去掉 waiting 状态）
        renderReport(local, raw, { deep:false, fallback:true });
        lastCheckResult = { data:local, raw, refined:false };
      }
    }catch(e){
      if(seq===checkSeq){
        renderReport(local, raw, { deep:false, fallback:true });
        lastCheckResult = { data:local, raw, refined:false };
      }
    }
  } else {
    lastCheckResult = { data:local, raw, refined:false };
  }
}

// ────────────────────────── 配平·计算模式 ──────────────────────────
const eqInput=$("#eqinput"), condInput=$("#cond"), eqResult=$("#eqresult");
$("#eqgo").addEventListener("click", doEquation);
eqInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doEquation(); });
$$(".chip.eq").forEach(c=>c.addEventListener("click",()=>{ eqInput.value=c.dataset.e; condInput.value=""; doEquation(); }));

let eqSeq=0;
async function doEquation(){
  const raw=eqInput.value.trim();
  if(!raw){ eqResult.innerHTML=""; return; }
  const seq=++eqSeq;
  eqResult.innerHTML = `<div class="loading">${t("loading_eq")}</div>`;
  try{
    const r=await fetch("/api/equation?input="+encodeURIComponent(raw)+"&condition="+encodeURIComponent(condInput.value.trim()));
    const j=await r.json();
    if(seq!==eqSeq) return;
    renderEquation(j, raw);
  }catch(e){
    if(seq===eqSeq) eqResult.innerHTML = errHtml(t("err_eq"));
  }
}

// ────────────────────────── 渲染：判定报告 ──────────────────────────
const HAZ_CN={ toxic:"剧毒", corrosive:"腐蚀", explosive:"爆炸", oxidize:"易氧化", unstable:"不稳定", charged:"带电" };
const HAZ_EN={ toxic:"Toxic", corrosive:"Corrosive", explosive:"Explosive", oxidize:"Oxidizer", unstable:"Unstable", charged:"Charged" };
const SRC_CN={
  pubchem:"PubChem 联网证实", "workers-ai":"云端 AI（Qwen3-30B）",
  "knowledge-base":"本地知识库", "rule-fallback":"价键规则（联网不可用）",
  rule:"价键规则推断"
};
const SRC_EN={
  pubchem:"PubChem confirmed", "workers-ai":"Cloud AI (Qwen3-30B)",
  "knowledge-base":"Local KB", "rule-fallback":"Valence rules (offline)",
  rule:"Valence rule"
};

function renderReport(res, raw, opts={}){
  if(!res || res.ok===false){ resultBox.innerHTML=errHtml(res&&res.error?res.error:(lang==="cn"?"无法解析":"Cannot parse")); return; }

  // —— 章戳：waiting 状态优先 ——
  let stampText, stampCls;
  if(opts.waiting){
    stampText = t("stamp.waiting"); stampCls = "stamp-waiting";
  } else {
    stampText = t("stamp."+res.verdict) || res.verdict;
    stampCls = "stamp-"+res.verdict;
  }

  const isEn = lang==="en";
  const srcMap = isEn ? SRC_EN : SRC_CN;
  const hazMap = isEn ? HAZ_EN : HAZ_CN;
  let srcText = srcMap[res.source] || (res.confidence==="high" ? srcMap["knowledge-base"] : srcMap.rule);
  if(opts.fallback) srcText = isEn ? "Local rules (online failed)" : "价键规则（联网失败回退）";
  if(res.fromCache) srcText += isEn ? " · cached" : " · 缓存";

  const elementsHtml=Object.keys(res.elements).map(k=>`${k}${res.elements[k]===1?"":sub(res.elements[k])}`).join(" ");
  const chargeHtml=(res.charge&&res.charge!==0)?`<span><b>${t("meta_charge")}</b> <span class="el">${res.charge>0?"+":""}${res.charge}</span></span>`:"";
  const massHtml=(res.mass&&isFinite(res.mass))?`<span><b>${t("meta_mass")}</b> <span class="el">${(+res.mass).toFixed(2)} g/mol</span></span>`:"";

  // —— 元素质量分数组成表 ——
  const comp = res.composition;
  const compHtml=(comp&&comp.length)?`<div class="sec"><h4>${t("sec_composition")}</h4>`+
    `<table class="comp-table"><thead><tr><th>${isEn?"Symbol":"符号"}</th><th>${isEn?"Element":"元素"}</th><th>${isEn?"Count":"原子数"}</th><th>${isEn?"Mass %":"质量分数"}</th></tr></thead><tbody>`+
    comp.map(r=>`<tr><td class="sym">${r.symbol}</td><td class="elname">${isEn?(r.nameEn||""):(r.name||"")}</td><td class="num">${r.count}</td>`+
      `<td class="bar-cell"><div class="comp-bar-track"><div class="comp-bar-fill" style="width:${r.massPct}%"></div></div></td><td class="masspct">${r.massPct}%</td></tr>`).join("")+
    `</tbody></table></div>`:"";

  // —— 酸根结构标签 ——
  const rad = res.radical;
  const radHtml = rad ? `<div class="sec"><h4>${t("sec_radical")}</h4><span class="radical-tag">${escapeHtml(isEn?rad.en:rad.cn)}</span></div>` : "";

  const sourcesHtml=(res.sources&&res.sources.length)?
    `<div class="sec"><h4>${t("sec_sources")}</h4><div class="related">`+
    res.sources.map(s=>`<a class="rel" href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.label)} ↗</a>`).join("")+`</div></div>`:"";

  const hazHtml=(res.hazards&&res.hazards.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_hazards")}</h4><div class="hazards">`+
    res.hazards.map(tg=>hazMap[tg]?`<span class="haz haz-${tg}">${hazMap[tg]}</span>`:"").join("")+`</div></div>`:"";
  const warnsHtml=(res.warnings&&res.warnings.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_warnings")}</h4>`+res.warnings.map(w=>`<div class="warn">${escapeHtml(w)}</div>`).join("")+`</div>`:"";
  const notesHtml=(res.notes&&res.notes.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_notes")}</h4><ul class="note-list">`+res.notes.map(n=>`<li>${escapeHtml(n)}</li>`).join("")+`</ul></div>`:"";
  const relatedHtml=(res.related&&res.related.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_related")}</h4><div class="related">`+res.related.map(r=>`<button class="rel" data-f="${r}">${prettyFormula(r)}</button>`).join("")+`</div></div>`:"";
  const colorsHtml=(res.colors&&res.colors.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_colors")}</h4><div class="colorrow">`+
    res.colors.map(c=>`<span class="cchip"><span class="cdot" style="background:${c.hex||"#ccc"}"></span>${escapeHtml(c.form)}：${escapeHtml(c.color)}${c.ion?`<span class="cion">${t("lbl_ion")}：${escapeHtml(c.ion)}</span>`:""}</span>`).join("")+
    `</div></div>`:"";
  const redoxHtml=(res.redox&&res.redox.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_redox")}</h4>`+
    res.redox.map(r=>`<div class="rx-item"><span class="rx-cond">${escapeHtml(r.condition)}</span><span class="rx-behavior">${escapeHtml(r.behavior)}</span>${r.detail?`<span class="rx-detail">${escapeHtml(r.detail)}</span>`:""}</div>`).join("")+
    `</div>`:"";
  const solubilityHtml=(res.solubility&&res.solubility.length && !opts.waiting)?
    `<div class="sec"><h4>${t("sec_solubility")}</h4>`+
    res.solubility.map(s=>`<div class="sol-item"><span class="sol-solv">${escapeHtml(s.solvent)}</span><span class="sol-val">${escapeHtml(s.value)}</span>${s.note?`<span class="sol-note">${escapeHtml(s.note)}</span>`:""}</div>`).join("")+
    `</div>`:"";
  const deepHtml = opts.deep ? `<div class="sec"><div class="loading">${t("loading_deep")}</div></div>` : "";
  const reportHtml = (!opts.waiting && res.source && res.source!=="knowledge-base") ?
    `<div class="sec"><button class="chip" id="report-btn">${t("report_btn")}</button><span class="rep-hint" id="report-hint"></span></div>` : "";

  resultBox.innerHTML=`
    <article class="report">
      <div class="report-head">
        <div>
          <div class="rep-formula">${prettyFormula(res.normalized||raw)}</div>
          ${res.name?`<div class="rep-name">${escapeHtml(res.name)}</div>`:""}
        </div>
        <div class="stamp ${stampCls}">${stampText}</div>
      </div>
      <div class="meta">
        <span><b>${t("meta_composition")}</b> <span class="el">${elementsHtml||"—"}</span></span>
        ${massHtml}
        ${chargeHtml}
        <span><b>${t("meta_source")}</b> ${srcText}</span>
      </div>
      ${radHtml}
      ${compHtml}
      ${deepHtml}
      ${hazHtml}
      ${colorsHtml}
      ${redoxHtml}
      ${solubilityHtml}
      ${warnsHtml}
      ${notesHtml}
      ${sourcesHtml}
      ${relatedHtml}
      ${reportHtml}
    </article>`;
  resultBox.querySelectorAll("button.rel").forEach(b=>b.addEventListener("click",()=>{ input.value=b.dataset.f; updatePreview(); doCheck(); }));
  const repBtn = resultBox.querySelector("#report-btn");
  if(repBtn) repBtn.addEventListener("click", ()=>doReport(raw, repBtn));
  resultBox.scrollIntoView({behavior:"smooth",block:"nearest"});
}

// ────────────────────────── 渲染：配平与计算 ──────────────────────────
let lastEq=null;
function renderEquation(j, raw){
  if(!j || j.ok===false){ eqResult.innerHTML=errHtml(j&&j.error?j.error:"无法处理该方程式"); return; }
  lastEq=j;
  // 剂量相关：多个变体
  if(j.mode==="dosage" && Array.isArray(j.variants) && j.variants.length){
    const blocks=j.variants.map((v,i)=>eqBlockHTML(v,i)).join("");
    eqResult.innerHTML=`<article class="report">
      <div class="report-head">
        <div><div class="rep-eq">${escapeHtml(j.title||"剂量相关反应")}</div>
        <div class="rep-sub">${escapeHtml(j.note||"")}</div></div>
        <div class="stamp stamp-type">用量相关</div>
      </div>
      ${blocks}
    </article>`;
    j.variants.forEach((v,i)=>{ const c=eqResult.querySelector("#vblock-"+i); if(c) wireCalc(c, v); });
    eqResult.scrollIntoView({behavior:"smooth",block:"nearest"});
    return;
  }
  // 单一方程式
  eqResult.innerHTML=`<article class="report">${eqHeaderHTML(j)}${eqBlockHTML(j,0)}</article>`;
  const c=eqResult.querySelector("#vblock-0"); if(c) wireCalc(c, j);
  eqResult.scrollIntoView({behavior:"smooth",block:"nearest"});
}

// 单一方程式头部：方程式 + 类型章 + 方式/条件/缓存/可逆 + 不存在警告
function eqHeaderHTML(j){
  const typeStamp=j.type?`<div class="stamp stamp-type">${escapeHtml(j.type)}</div>`:"";
  const modeText = j.mode==="completion" ? (j.ai?"AI 补全产物":"本地规则补全") : j.mode==="balance" ? "方程式配平" : (j.mode||"");
  const condHtml = j.condition?`<span><b>条件</b> ${escapeHtml(j.condition)}</span>`:"";
  const cacheHtml = j.fromCache?`<span><b>缓存</b> 是</span>`:"";
  const revHtml = j.reversible?`<span class="revtag">⇌ 可逆反应</span>`:"";
  const noteHtml = j.note?`<div class="rep-sub">${escapeHtml(j.note)}</div>`:"";
  const nonHtml = (j.nonexistent&&j.nonexistent.length)?`<div class="sec"><div class="warn">注意：以下物质经判断通常不存在或极不稳定：${j.nonexistent.map(prettyFormula).join("、")}，请核对化学式。</div></div>`:"";
  return `<div class="report-head">
      <div><div class="rep-eq">${escapeHtml(j.equation)}</div>${noteHtml}</div>
      ${typeStamp}
    </div>
    <div class="meta"><span><b>方式</b> ${modeText}</span>${condHtml}${cacheHtml}${revHtml}</div>
    ${nonHtml}`;
}

// 一个方程式块：变体标签(若有) + 物种表 + 计量计算器
function eqBlockHTML(j, idx){
  const labelHtml = j.label?`<div class="sec"><h4>${escapeHtml(j.label)}</h4><div class="rep-eq small">${escapeHtml(j.equation)}</div>${j.note?`<div class="rep-sub">${escapeHtml(j.note)}</div>`:""}</div>`:"";
  const sideTag=(isLeft)=>isLeft?`<span class="sidetag">反应物</span>`:`<span class="sidetag p">生成物</span>`;
  const colorDot=(s)=>{ if(s.colors&&s.colors.length){const c=s.colors[0];return `<span class="cdot" style="background:${c.hex}" title="${c.form}：${c.color}"></span>`;} return "";};
  const mkRow=(s,isLeft)=>`<tr><td class="f">${sideTag(isLeft)}${prettyFormula(s.formula)}${s.state||""}${colorDot(s)}</td>`+
    `<td class="num">${s.coeff}</td>`+
    `<td class="num">${s.molarMass!=null?s.molarMass.toFixed(2):"—"}</td>`+
    `<td class="n">${s.name?escapeHtml(s.name):""}</td></tr>`;
  const tableRows = j.left.map(s=>mkRow(s,true)).join("") + j.right.map(s=>mkRow(s,false)).join("");
  const options=j.species.map((s,i)=>`<option value="${i}">${prettyFormula(s.formula)}</option>`).join("");
  return `<div class="vblock" id="vblock-${idx}">
    ${labelHtml}
    <div class="sec">
      <h4>配平系数 · 摩尔质量</h4>
      <table class="eqtable"><thead><tr><th>物质</th><th>系数</th><th>M (g/mol)</th><th>名称</th></tr></thead><tbody>${tableRows}</tbody></table>
    </div>
    <div class="sec calc">
      <h4>化学计量计算</h4>
      <div class="calc-row">
        <select class="calc-sp">${options}</select>
        <input class="calc-amt" type="number" step="any" placeholder="数量" style="width:110px"/>
        <span class="unit"><button data-u="g" class="active">g</button><button data-u="mol">mol</button></span>
        <button class="btn calc-go" style="padding:9px 18px">计算</button>
      </div>
      <div class="calc-result"></div>
    </div>
  </div>`;
}

// 绑定某容器内的计量计算器（每个方程式块独立）
function wireCalc(container, j){
  if(!container) return;
  let unit="g";
  container.querySelectorAll(".unit button").forEach(b=>b.addEventListener("click",()=>{
    unit=b.dataset.u;
    container.querySelectorAll(".unit button").forEach(x=>x.classList.toggle("active",x===b));
  }));
  container.querySelector(".calc-go").addEventListener("click",()=>{
    const sp=j.species[+container.querySelector(".calc-sp").value];
    const amt=parseFloat(container.querySelector(".calc-amt").value);
    const out=container.querySelector(".calc-result");
    if(!isFinite(amt)||amt<=0){ out.innerHTML=`<div class="err">请输入一个正数。</div>`; return; }
    const anchorMoles = unit==="g" ? (sp.molarMass? amt/sp.molarMass : NaN) : amt;
    if(!isFinite(anchorMoles)){ out.innerHTML=`<div class="err">该物质缺少摩尔质量，无法按克换算。</div>`; return; }
    const u=anchorMoles/sp.coeff;
    const trs=j.species.map(s=>{
      const moles=u*s.coeff;
      const grams=s.molarMass!=null? moles*s.molarMass : null;
      return `<tr><td class="f">${prettyFormula(s.formula)}</td><td class="num">${s.coeff}</td>`+
        `<td class="num">${fmt(moles)} mol</td><td class="num">${grams!=null?fmt(grams)+" g":"—"}</td></tr>`;
    }).join("");
    out.innerHTML=`<table class="eqtable"><thead><tr><th>物质</th><th>系数</th><th>物质的量</th><th>质量</th></tr></thead><tbody>${trs}</tbody></table>`;
  });
}

// 上报刷新：限流后强制联网重查并更新缓存
function getDeviceId(){
  try{
    let id=localStorage.getItem("chemcheck_did");
    if(!id){ id=(crypto.randomUUID?crypto.randomUUID():"d"+Date.now()+Math.random().toString(16).slice(2)); localStorage.setItem("chemcheck_did",id); }
    return id;
  }catch(e){ return ""; }
}
async function doReport(formula, btn){
  const hint=resultBox.querySelector("#report-hint");
  btn.disabled=true; if(hint) hint.textContent=" 联网刷新中…";
  try{
    const r=await fetch("/api/report?formula="+encodeURIComponent(formula)+"&did="+encodeURIComponent(getDeviceId()));
    const j=await r.json();
    if(j.ok && j.result){ renderReport(j.result, formula, {}); }
    else{
      if(hint) hint.textContent=" "+(j.error||"刷新失败");
      btn.disabled=false;
    }
  }catch(e){ if(hint) hint.textContent=" 请求失败"; btn.disabled=false; }
}

function fmt(x){ if(x>=1000|| (x>0&&x<0.01)) return x.toExponential(3); return (Math.round(x*1000)/1000).toString(); }
function sub(n){const m={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"};return String(n).split("").map(c=>m[c]||c).join("");}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function errHtml(msg){return `<div class="err"><b>出错了。</b><br/>${escapeHtml(msg)}</div>`;}

updatePreview();
