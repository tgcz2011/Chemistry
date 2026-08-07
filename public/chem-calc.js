// chem-calc.js — 化学计算模块（摩尔质量 + 方程式代数配平）
// 依赖 chem-engine.js 的 parseFormula（元素计数解析）

import { parseFormula } from "./chem-engine.js";

// 标准原子量（合成元素取近似值）
export const ATOMIC_MASS = {
  H:1.008,He:4.0026,Li:6.94,Be:9.0122,B:10.81,C:12.011,N:14.007,O:15.999,F:18.998,Ne:20.180,
  Na:22.990,Mg:24.305,Al:26.982,Si:28.085,P:30.974,S:32.06,Cl:35.45,Ar:39.948,K:39.098,Ca:40.078,
  Sc:44.956,Ti:47.867,V:50.942,Cr:51.996,Mn:54.938,Fe:55.845,Co:58.933,Ni:58.693,Cu:63.546,Zn:65.38,
  Ga:69.723,Ge:72.630,As:74.922,Se:78.971,Br:79.904,Kr:83.798,Rb:85.468,Sr:87.62,Y:88.906,Zr:91.224,
  Nb:92.906,Mo:95.95,Tc:98,Ru:101.07,Rh:102.906,Pd:106.42,Ag:107.8682,Cd:112.414,In:114.818,Sn:118.710,
  Sb:121.760,Te:127.60,I:126.904,Xe:131.293,Cs:132.905,Ba:137.327,La:138.905,Ce:140.116,Pr:140.908,Nd:144.242,
  Pm:145,Sm:150.36,Eu:151.964,Gd:157.25,Tb:158.925,Dy:162.500,Ho:164.930,Er:167.259,Tm:168.934,Yb:173.045,
  Lu:174.967,Hf:178.49,Ta:180.948,W:183.84,Re:186.207,Os:190.23,Ir:192.217,Pt:195.084,Au:196.967,Hg:200.592,
  Tl:204.38,Pb:207.2,Bi:208.980,Po:209,At:210,Rn:222,Fr:223,Ra:226,Ac:227,Th:232.038,Pa:231.036,U:238.029,
  Np:237,Pu:244,Am:243,Cm:247,Bk:247,Cf:251,Es:252,Fm:257,Md:258,No:259,Lr:266,Rf:267,Db:268,Sg:269,Bh:270,
  Hs:277,Mt:278,Ds:281,Rg:282,Cn:285,Nh:286,Fl:289,Mc:290,Lv:293,Ts:294,Og:294
};

// 摩尔质量（g/mol）。hydrate 按总元素计（含结晶水）
export function molarMass(formula){
  const p = parseFormula(formula);
  if(!p.ok) return null;
  let m = 0;
  for(const sym of Object.keys(p.elements)){
    const w = ATOMIC_MASS[sym];
    if(w==null) return null;
    m += w * p.elements[sym];
  }
  return m;
}

// 解析方程式："a+b = c+d" / "a+b -> c+d" / 仅反应物 "a+b"
export function parseEquation(input){
  let s = String(input).trim();
  s = s.replace(/\s+/g,"");
  // 统一箭头
  s = s.replace(/→|⟶|⟹|=>|->|—>/g,"=");
  const eqParts = s.split("=");
  const cleanSpecies = (part)=>{
    return part.split("+").map(x=>x.trim()).filter(x=>x.length>0);
  };
  if(eqParts.length===1){
    // 仅反应物
    return { reactantsOnly:true, left:cleanSpecies(eqParts[0]), right:[] };
  }
  if(eqParts.length>2) return { error:"方程式中包含多个箭头/等号" };
  const left = cleanSpecies(eqParts[0]);
  const right = cleanSpecies(eqParts[1]);
  if(left.length===0||right.length===0) return { error:"方程式两侧均需至少一种物质" };
  return { reactantsOnly:false, left, right };
}

// 去掉物质前的系数（配平由本模块重新计算）
function stripCoeff(species){
  return String(species).replace(/^\d+/,"");
}

// 代数配平：输入完整方程式（可含/不含系数），返回整数系数
export function balanceEquation(input){
  const eq = parseEquation(input);
  if(eq.error) return { ok:false, error:eq.error };
  if(eq.reactantsOnly) return { ok:false, reactantsOnly:true, error:"仅含反应物，需补全产物" };

  const left = eq.left.map(stripCoeff);
  const right = eq.right.map(stripCoeff);
  const species = [...left, ...right];
  const nLeft = left.length;
  const n = species.length;

  // 解析每种物质的元素
  const parsed = species.map(sp=>{
    const p = parseFormula(sp);
    if(!p.ok) return null;
    if(p.charge!==0) return null; // 配平仅处理中性物质
    return p;
  });
  if(parsed.some(x=>!x)) return { ok:false, error:"某些物质无法解析或带电（配平仅支持中性物质）" };

  // 元素集合
  const elSet = new Set();
  parsed.forEach(p=>Object.keys(p.elements).forEach(e=>elSet.add(e)));
  const els = Array.from(elSet).sort();

  // 构造矩阵：行=元素，列=物质；左正右负
  const m = els.length;
  const A = [];
  for(let i=0;i<m;i++){
    const row = [];
    for(let j=0;j<n;j++){
      const cnt = parsed[j].elements[els[i]]||0;
      row.push(j<nLeft ? cnt : -cnt);
    }
    A.push(row);
  }

  // 浮点 RREF 求零空间
  const {M, pivots} = rrefFloat(A);
  const pivotSet = new Set(pivots);
  const freeCols = [];
  for(let c=0;c<n;c++) if(!pivotSet.has(c)) freeCols.push(c);

  if(freeCols.length===0) return { ok:false, error:"无法配平：方程式可能写错或物种组合不合理" };
  if(freeCols.length>1) return { ok:false, error:"配平不唯一（可能存在多种独立反应），请拆分为单一反应" };

  const freeCol = freeCols[0];
  const v = new Array(n).fill(0);
  v[freeCol] = 1;
  // pivot 行求出其余变量
  pivots.forEach((pcol,ridx)=>{
    v[pcol] = -M[ridx][freeCol];
  });

  // 归一化为最小正整数
  const coeffs = rationalize(v);
  if(!coeffs) return { ok:false, error:"无法配平为整数系数" };
  // 全部应为正；若全负则取反
  const allNeg = coeffs.every(c=>c<0);
  const allPos = coeffs.every(c=>c>0);
  let final = coeffs;
  if(allNeg) final = coeffs.map(c=>-c);
  else if(!allPos) return { ok:false, error:"该方程式物种守恒无法满足，请检查物质是否正确" };

  const g = gcdArray(final);
  final = final.map(c=>c/g);

  return {
    ok:true,
    left: left.map((f,i)=>({formula:f, coeff:final[i]})),
    right: right.map((f,i)=>({formula:f, coeff:final[nLeft+i]})),
    elements: els
  };
}

function rrefFloat(A){
  const M = A.map(r=>r.slice());
  const rows = M.length, cols = M[0].length;
  const pivots = [];
  let lead = 0;
  for(let r=0;r<rows && lead<cols;r++){
    let piv = -1;
    for(let k=r;k<rows;k++){ if(Math.abs(M[k][lead])>1e-9){ piv=k; break; } }
    if(piv===-1){ lead++; r--; continue; }
    const t = M[r]; M[r]=M[piv]; M[piv]=t;
    const pv = M[r][lead];
    for(let c=0;c<cols;c++) M[r][c]/=pv;
    for(let k=0;k<rows;k++){
      if(k!==r){ const f=M[k][lead]; if(Math.abs(f)>1e-12){ for(let c=0;c<cols;c++) M[k][c]-=f*M[r][c]; } }
    }
    pivots.push(lead); lead++;
  }
  return { M, pivots };
}

// 将实数向量有理化为最小正整数（系数通常很小）
function rationalize(v){
  const max = Math.max(...v.map(x=>Math.abs(x)));
  if(max<1e-9) return null;
  const norm = v.map(x=>x/max);
  for(let k=1;k<=2000;k++){
    const ints = norm.map(x=>Math.round(x*k));
    let ok = true;
    for(let i=0;i<norm.length;i++){
      if(Math.abs(ints[i]-norm[i]*k) > 1e-6){ ok=false; break; }
    }
    if(ok && ints.some(x=>x!==0)) return ints;
  }
  return null;
}

function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a||1; }
function gcdArray(arr){ return arr.reduce((acc,x)=>gcd(acc,x), Math.abs(arr[0])||1); }

// 生成美观方程式字符串（带下标）
export function prettyEquation(result){
  const subMap={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"};
  const subNum = s => String(s).replace(/\d/g,c=>subMap[c]);
  const side = list => list.map(o=>(o.coeff>1?o.coeff:"")+subNum(o.formula)).join(" + ");
  return side(result.left)+" → "+side(result.right);
}

// 化学计量：给某物质的量（{formula, moles} 或 {formula, grams}），计算各物质摩尔数与质量
export function stoichiometry(result, anchor){
  // result: balanceEquation 返回值；anchor: {formula, moles?} 或 {formula, grams?}
  const all = [...result.left, ...result.right];
  const spec = all.map(o=>({ formula:o.formula, coeff:o.coeff, mass:molarMass(o.formula) }));
  const a = spec.find(s=>s.formula===anchor.formula);
  if(!a) return { ok:false, error:"方程式中无该物质" };
  let anchorMoles = anchor.moles;
  if(anchorMoles==null && anchor.grams!=null && a.mass) anchorMoles = anchor.grams / a.mass;
  if(anchorMoles==null) return { ok:false, error:"无法确定锚点物质的量" };
  const unit = anchorMoles / a.coeff; // 每单位系数对应的摩尔数
  return {
    ok:true,
    species: spec.map(s=>({
      formula: s.formula,
      coeff: s.coeff,
      molarMass: s.mass,
      moles: unit * s.coeff,
      grams: s.mass!=null ? unit * s.coeff * s.mass : null
    }))
  };
}
