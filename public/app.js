// app.js — 前端逻辑
// 判定：本地知识库/规则即时判定，未收录自动调用 Workers AI 深度判定
// 配平·计算：调用 /api/equation，展示配平方程式、摩尔质量，并提供化学计量计算器
import { analyze, prettyFormula, verdictText, TEMPLATES } from "/chem-engine.js";

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

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
  if(!raw){ resultBox.innerHTML=""; return; }
  const seq = ++checkSeq;
  let local;
  try{ local = analyze(raw); }catch(e){ local=null; }
  if(!local){ resultBox.innerHTML = errHtml("无法解析该化学式，请检查元素符号、括号与电荷写法。"); return; }
  if(!local.ok){ resultBox.innerHTML = errHtml(local.error||"无法解析"); return; }
  renderReport(local, raw, { deep: local.confidence!=="high" });

  // 未收录 → 自动调用 Workers AI 深度判定
  if(local.confidence!=="high"){
    try{
      const r=await fetch("/api/check?formula="+encodeURIComponent(raw)+"&deep=1");
      if(r.ok){
        const ai=await r.json();
        if(seq===checkSeq && ai && ai.ok) renderReport(ai, raw, { deep:false, refined:true });
      }
    }catch(e){ /* 保持本地结果 */ }
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
  eqResult.innerHTML = `<div class="loading">正在配平 / 调用云端…</div>`;
  try{
    const r=await fetch("/api/equation?input="+encodeURIComponent(raw)+"&condition="+encodeURIComponent(condInput.value.trim()));
    const j=await r.json();
    if(seq!==eqSeq) return;
    renderEquation(j, raw);
  }catch(e){
    if(seq===eqSeq) eqResult.innerHTML = errHtml("请求失败，请稍后再试。");
  }
}

// ────────────────────────── 渲染：判定报告 ──────────────────────────
const STAMP={ yes:"稳定存在", conditional:"特定条件", unstable:"极不稳定", no:"不存在" };
const HAZ={ toxic:"剧毒", corrosive:"腐蚀", explosive:"爆炸", oxidize:"易氧化", unstable:"不稳定", charged:"带电" };

function renderReport(res, raw, opts={}){
  if(!res || res.ok===false){ resultBox.innerHTML=errHtml(res&&res.error?res.error:"无法解析"); return; }
  const vcls="stamp-"+res.verdict;
  let srcText = res.source==="pubchem" ? "PubChem 联网证实"
    : res.source==="workers-ai" ? "云端 AI（Qwen3-30B）"
    : res.source==="knowledge-base" ? "本地知识库"
    : res.source==="rule-fallback" ? "价键规则（联网不可用）"
    : res.confidence==="high" ? "本地知识库" : "价键规则推断";
  if(res.fromCache) srcText += " · 缓存";
  const elementsHtml=Object.keys(res.elements).map(k=>`${k}${res.elements[k]===1?"":sub(res.elements[k])}`).join(" ");
  const chargeHtml=(res.charge&&res.charge!==0)?`<span><b>总电荷</b> <span class="el">${res.charge>0?"+":""}${res.charge}</span></span>`:"";
  const massHtml=(res.mass&&isFinite(res.mass))?`<span><b>摩尔质量</b> <span class="el">${(+res.mass).toFixed(2)} g/mol</span></span>`:"";
  const sourcesHtml=(res.sources&&res.sources.length)?
    `<div class="sec"><h4>数据来源</h4><div class="related">`+
    res.sources.map(s=>`<a class="rel" href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.label)} ↗</a>`).join("")+`</div></div>`:"";

  const hazHtml=(res.tags&&res.tags.length)?
    `<div class="sec"><h4>危险信息</h4><div class="hazards">`+
    res.tags.map(t=>HAZ[t]?`<span class="haz haz-${t}">${HAZ[t]}</span>`:"").join("")+`</div></div>`:"";
  const warnsHtml=(res.warnings&&res.warnings.length)?
    `<div class="sec"><h4>安全提示</h4>`+res.warnings.map(w=>`<div class="warn">${escapeHtml(w)}</div>`).join("")+`</div>`:"";
  const notesHtml=(res.notes&&res.notes.length)?
    `<div class="sec"><h4>说明与注意事项</h4><ul class="note-list">`+res.notes.map(n=>`<li>${escapeHtml(n)}</li>`).join("")+`</ul></div>`:"";
  const relatedHtml=(res.related&&res.related.length)?
    `<div class="sec"><h4>相关物质</h4><div class="related">`+res.related.map(r=>`<button class="rel" data-f="${r}">${prettyFormula(r)}</button>`).join("")+`</div></div>`:"";
  const deepHtml = opts.deep ? `<div class="sec"><div class="loading">联网深度判定中（PubChem / 维基 / AI）…</div></div>` : "";
  // 知识库精选条目不支持上报；其余（联网/规则）可上报刷新
  const reportHtml = (res.source && res.source!=="knowledge-base") ?
    `<div class="sec"><button class="chip" id="report-btn">结果有误？上报并联网刷新</button><span class="rep-hint" id="report-hint"></span></div>` : "";

  resultBox.innerHTML=`
    <article class="report">
      <div class="report-head">
        <div>
          <div class="rep-formula">${prettyFormula(res.normalized||raw)}</div>
          ${res.name?`<div class="rep-name">${escapeHtml(res.name)}</div>`:""}
        </div>
        <div class="stamp ${vcls}">${STAMP[res.verdict]||res.verdict}</div>
      </div>
      <div class="meta">
        <span><b>组成</b> <span class="el">${elementsHtml||"—"}</span></span>
        ${massHtml}
        ${chargeHtml}
        <span><b>判定来源</b> ${srcText}</span>
      </div>
      ${deepHtml}
      ${hazHtml}
      ${warnsHtml}
      ${notesHtml}
      ${sourcesHtml}
      ${relatedHtml}
      ${reportHtml}
    </article>`;
  // 仅给“相关物质”按钮（button.rel）绑定点击，来源链接 <a> 不受影响
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
  const typeStamp = j.type?`<div class="stamp stamp-type">${escapeHtml(j.type)}</div>`:"";
  const modeText = j.mode==="completion" ? (j.ai?"AI 补全产物":"本地规则补全") : "方程式配平";
  const noteHtml = j.note?`<div class="rep-sub">${escapeHtml(j.note)}</div>`:"";
  const condHtml = j.condition?`<span><b>条件</b> ${escapeHtml(j.condition)}</span>`:"";

  const rows = j.species.map(s=>{
    const isLeft = j.left.some(l=>l.formula===s.formula && l.coeff===s.coeff);
    // 归属按顺序：left 数组在前
    return s;
  });
  // 构造物种表（左=反应物，右=生成物）
  const sideTag=(isLeft)=>isLeft?`<span class="sidetag">反应物</span>`:`<span class="sidetag p">生成物</span>`;
  const mkRow=(s,isLeft)=>`<tr><td class="f">${sideTag(isLeft)}${prettyFormula(s.formula)}</td>`+
    `<td class="num">${s.coeff}</td>`+
    `<td class="num">${s.molarMass!=null?s.molarMass.toFixed(2):"—"}</td>`+
    `<td class="n">${s.name?escapeHtml(s.name):""}</td></tr>`;
  const tableRows = j.left.map(s=>mkRow(s,true)).join("") + j.right.map(s=>mkRow(s,false)).join("");

  // 计量计算器
  const options=j.species.map((s,i)=>`<option value="${i}">${prettyFormula(s.formula)}</option>`).join("");
  eqResult.innerHTML=`
    <article class="report">
      <div class="report-head">
        <div>
          <div class="rep-eq">${escapeHtml(j.equation)}</div>
          ${noteHtml}
        </div>
        ${typeStamp}
      </div>
      <div class="meta"><span><b>方式</b> ${modeText}</span>${condHtml}</div>
      <div class="sec">
        <h4>配平系数 · 摩尔质量</h4>
        <table class="eqtable">
          <thead><tr><th>物质</th><th>系数</th><th>M (g/mol)</th><th>名称</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="sec calc">
        <h4>化学计量计算</h4>
        <div class="calc-row">
          <select id="calc-sp">${options}</select>
          <input id="calc-amt" type="number" step="any" placeholder="数量" style="width:110px"/>
          <span class="unit">
            <button data-u="g" class="active">g</button><button data-u="mol">mol</button>
          </span>
          <button class="btn" id="calc-go" style="padding:9px 18px">计算</button>
        </div>
        <div class="calc-result" id="calc-out"></div>
      </div>
    </article>`;

  // 计算器逻辑
  let unit="g";
  eqResult.querySelectorAll(".unit button").forEach(b=>b.addEventListener("click",()=>{
    unit=b.dataset.u;
    eqResult.querySelectorAll(".unit button").forEach(x=>x.classList.toggle("active",x===b));
  }));
  eqResult.querySelector("#calc-go").addEventListener("click",()=>{
    const sp=j.species[+eqResult.querySelector("#calc-sp").value];
    const amt=parseFloat(eqResult.querySelector("#calc-amt").value);
    const out=eqResult.querySelector("#calc-out");
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
  eqResult.scrollIntoView({behavior:"smooth",block:"nearest"});
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
