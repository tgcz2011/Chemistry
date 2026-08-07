// src/chem-sources.js — 联网数据源（PubChem + Wikipedia）
// 仅服务端（Worker）使用。当本地知识库/规则无法确定时，用权威在线来源兜底：
//   PubChem：美国国家化学数据库（1.1 亿+ 化合物），公式搜索 → 证实存在性 + CID + 同义词(取中文名)
//   Wikipedia：中/英文条目摘要，WikiData 作为独立兜底
// 文档：PubChem PUG REST https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest

const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const WIKI_UA = "ChemCheck/1.0 (Cloudflare Worker; educational chemistry tool)";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// 把化学式规整为 PubChem 可接受的形式：去状态、电荷、水合点、前导系数，保留元素/数字/括号
function toPureFormula(s){
  let out = String(s).replace(/\s+/g,"");
  out = out.replace(/\((s|l|g|aq)\)$/i,"");
  out = out.replace(/\^([0-9]*[+-])$/,"");
  out = out.replace(/([\]\)\}a-z])(\d*[+-])$/,(m,p1)=>p1);
  out = out.split(/[·•*.]/)[0] || out;      // 水合物取主段
  out = out.replace(/^(\d+)/,"");
  out = out.replace(/[^A-Za-z0-9()\[\]{}]/g,"");
  return out.trim();
}

// 按化学式查 PubChem（公式搜索是异步的：可能返回 Waiting.ListKey，需轮询）
export async function searchPubChem(formula, opts={}){
  const maxHits = opts.maxHits ?? 5;
  const timeoutMs = opts.timeoutMs ?? 9000;
  const pure = toPureFormula(formula);
  if(!pure) return { ok:false, hits:[], reason:"no-pure-formula" };

  const props = "MolecularFormula,MolecularWeight,IUPACName,Title,CanonicalSMILES";
  let url = `${PUBCHEM_BASE}/compound/formula/${encodeURIComponent(pure)}/property/${props}/JSON?MaxRecords=${maxHits*2}`;
  const deadline = Date.now()+timeoutMs;

  try{
    let polls=0;
    while(Date.now()<deadline && polls<4){
      polls++;
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(), Math.min(4000, deadline-Date.now()));
      let resp;
      try{ resp = await fetch(url,{ signal:ctrl.signal, headers:{Accept:"application/json","User-Agent":WIKI_UA} }); }
      finally{ clearTimeout(timer); }

      if(resp.status===404||resp.status===400) return { ok:false, hits:[], reason:"not-found", pure };
      if(resp.status===503||resp.status===504) return { ok:false, hits:[], reason:"unavailable" };
      if(!resp.ok) return { ok:false, hits:[], reason:"http-"+resp.status };

      const data = await resp.json();
      if(data?.Waiting?.ListKey){
        url = `${PUBCHEM_BASE}/compound/listkey/${data.Waiting.ListKey}/property/${props}/JSON`;
        await sleep(700);
        continue;
      }
      const rows = data?.PropertyTable?.Properties ?? [];
      if(rows.length===0) return { ok:false, hits:[], reason:"empty", pure };
      const hits = rows.slice(0,maxHits).map(r=>({
        cid:r.CID, molecularFormula:r.MolecularFormula, molecularWeight:r.MolecularWeight,
        iupacName:r.IUPACName, title:r.Title, smiles:r.CanonicalSMILES
      }));
      return { ok:true, hits, count:rows.length, pure };
    }
    return { ok:false, hits:[], reason:"timeout" };
  }catch(e){
    return { ok:false, hits:[], reason: e && e.name==="AbortError" ? "timeout" : "error" };
  }
}

// 取某 CID 的同义词，返回首个含中文的名称（作为中文名候选）
export async function pubchemChineseName(cid, timeoutMs=5000){
  const url = `${PUBCHEM_BASE}/compound/cid/${cid}/synonyms/TXT`;
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const resp = await fetch(url,{ signal:ctrl.signal, headers:{Accept:"text/plain","User-Agent":WIKI_UA} });
    if(!resp.ok) return null;
    const text = await resp.text();
    const syns = text.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,40);
    const cn = syns.find(s=>/[\u4e00-\u9fff]/.test(s));
    return cn || null;
  }catch{ return null; } finally{ clearTimeout(timer); }
}

// ---- Wikipedia（中/英），WikiData 兜底 ----
function stripHtml(s){ return String(s).replace(/<[^>]+>/g,"").replace(/&[a-z]+;/gi," ").replace(/\s+/g," ").trim(); }

async function wikiOneLang(query, lang, timeoutMs){
  const apiBase = lang==="zh" ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const restBase = lang==="zh" ? "https://zh.wikipedia.org/api/rest_v1/page/summary/" : "https://en.wikipedia.org/api/rest_v1/page/summary/";
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const sResp = await fetch(`${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`,{ signal:ctrl.signal, headers:{Accept:"application/json","User-Agent":WIKI_UA} });
    if(!sResp.ok) return null;
    const sJson = await sResp.json();
    const title = sJson?.query?.search?.[0]?.title;
    if(!title) return null;
    let extract = stripHtml(sJson?.query?.search?.[0]?.snippet ?? "");
    let url = (lang==="zh"?"https://zh.wikipedia.org/wiki/":"https://en.wikipedia.org/wiki/")+encodeURIComponent(title);
    try{
      const mResp = await fetch(restBase+encodeURIComponent(title.replace(/ /g,"_")),{ signal:ctrl.signal, headers:{Accept:"application/json","User-Agent":WIKI_UA} });
      if(mResp.ok){ const mJson=await mResp.json(); if(mJson?.extract) extract=stripHtml(mJson.extract); if(mJson?.content_urls?.desktop?.page) url=mJson.content_urls.desktop.page; }
    }catch{ /* snippet 兜底 */ }
    return { title, lang, extract:extract.slice(0,500), url, source:"wikipedia" };
  }catch{ return null; } finally{ clearTimeout(timer); }
}

async function wikidata(query, lang, timeoutMs){
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${lang}&format=json&limit=1&origin=*`;
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const resp = await fetch(url,{ signal:ctrl.signal, headers:{Accept:"application/json","User-Agent":WIKI_UA} });
    if(!resp.ok) return null;
    const data = await resp.json();
    const ent = data?.search?.[0];
    if(!ent) return null;
    const label=ent.label||"", desc=ent.description||"";
    if(!label && !desc) return null;
    return { title:label, lang, extract:[label,desc].filter(Boolean).join("：").slice(0,300), url:`https://www.wikidata.org/wiki/${ent.id}`, source:"wikidata" };
  }catch{ return null; } finally{ clearTimeout(timer); }
}

async function wikiWithFallback(query, lang, timeoutMs){
  let hit = await wikiOneLang(query, lang, timeoutMs).catch(()=>null);
  if(hit) return hit;
  return await wikidata(query, lang, timeoutMs).catch(()=>null);
}

// 用化学式搜（中英文并行）
export async function searchWiki(formula, timeoutMs=6000){
  const [zh,en] = await Promise.all([ wikiWithFallback(formula,"zh",timeoutMs), wikiWithFallback(formula,"en",timeoutMs) ]);
  return { ok:!!(zh||en), zh:zh||undefined, en:en||undefined };
}

// PubChem 命中后用英文名搜英文维基、用化学式搜中文维基
export async function searchWikiByName(nameEn, formula, timeoutMs=6000){
  const [en, zhByName, zhByFormula] = await Promise.all([
    nameEn? wikiWithFallback(nameEn,"en",timeoutMs) : Promise.resolve(null),
    nameEn? wikiWithFallback(nameEn,"zh",timeoutMs) : Promise.resolve(null),
    wikiWithFallback(formula,"zh",timeoutMs)
  ]);
  const zh = zhByName || zhByFormula;
  return { ok:!!(zh||en), zh:zh||undefined, en:en||undefined };
}
