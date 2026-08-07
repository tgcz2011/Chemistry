// src/chem-reactions.js — 本地无机反应补全 + 方程式增强（纯逻辑，不依赖 env/AI）
// 能力：
//   1) 常见反应本地补全（中和/复分解/置换等）
//   2) 状态符号：沉淀 ↓ / 气体 ↑（依据溶解度与气体表）
//   3) 可逆反应识别（⇌）
//   4) 剂量相关反应：同一对反应物因「少量/过量」产生不同方程式，给出全部分步与总反应

// ===== 反应物离子拆分表：值 = [阳离子符号, 阳离子电荷] =====
const ACID = { "HCl":["Cl",1],"H2SO4":["SO4",2],"HNO3":["NO3",1],"H3PO4":["PO4",3],"H2CO3":["CO3",2],"CH3COOH":["CH3COO",1],"H2S":["S",2],"HF":["F",1],"HBr":["Br",1],"HI":["I",1],"H2SO3":["SO3",2] };
const BASE = { "NaOH":["Na",1],"KOH":["K",1],"LiOH":["Li",1],"Ca(OH)2":["Ca",2],"Mg(OH)2":["Mg",2],"Ba(OH)2":["Ba",2],"Cu(OH)2":["Cu",2],"Zn(OH)2":["Zn",2],"Fe(OH)2":["Fe",2],"Fe(OH)3":["Fe",3],"Al(OH)3":["Al",3] };
const CARBONATE = { "Na2CO3":["Na",1],"K2CO3":["K",1],"CaCO3":["Ca",2],"MgCO3":["Mg",2],"BaCO3":["Ba",2],"ZnCO3":["Zn",2],"CuCO3":["Cu",2],"FeCO3":["Fe",2],"Al2(CO3)3":["Al",3] };
const BICARB = { "NaHCO3":["Na",1],"KHCO3":["K",1],"Ca(HCO3)2":["Ca",2],"Mg(HCO3)2":["Mg",2] };
const METAL_OXIDE = { "Na2O":["Na",1],"K2O":["K",1],"CaO":["Ca",2],"MgO":["Mg",2],"BaO":["Ba",2],"CuO":["Cu",2],"ZnO":["Zn",2],"FeO":["Fe",2],"Al2O3":["Al",3],"Fe2O3":["Fe",3] };
const ACTIVE_METAL = { "Na":1,"K":1,"Li":1,"Ca":2,"Ba":2,"Mg":2,"Al":3,"Zn":2,"Fe":2,"Sn":2,"Pb":2 };
const NONMETAL_OXIDE = { "CO2":["CO3",2],"SO2":["SO3",2],"SO3":["SO4",2],"N2O5":["NO3",1],"P2O5":["PO4",3] };

// ===== 气体（在溶液/固相反应中逸出标 ↑）=====
const GASES = new Set(["CO2","H2","O2","NH3","H2S","SO2","NO","NO2","CO","Cl2","CH4","C2H2","C2H4","N2O","O3","F2"]);

// ===== 常见难溶物（在溶液反应中析出标 ↓）=====
const INSOLUBLE = new Set([
  // 氢氧化物
  "Mg(OH)2","Al(OH)3","Zn(OH)2","Fe(OH)2","Fe(OH)3","Cu(OH)2","Mn(OH)2","Cr(OH)3","Ni(OH)2","Co(OH)2","AgOH",
  // 碳酸盐
  "CaCO3","BaCO3","MgCO3","ZnCO3","CuCO3","FeCO3","Ag2CO3","PbCO3","MnCO3",
  // 硫酸盐
  "BaSO4","PbSO4",
  // 卤化银等
  "AgCl","AgBr","AgI","PbI2","Hg2Cl2",
  // 硫化物
  "FeS","CuS","PbS","ZnS","MnS","HgS","Ag2S","CdS","NiS","CoS",
  // 其他
  "Ag3PO4","Ca3(PO4)2","BaSO3","CaSO3","CaC2O4","BaC2O4","Ag2O","H2SiO3","SiO2"
]);

// ===== 可逆反应（⇌）签名：排序后的「左|右」物种集合 =====
const REVERSIBLE_SETS = [
  [["N2","H2"],["NH3"]],
  [["H2","I2"],["HI"]],
  [["SO2","O2"],["SO3"]],
  [["NH3","H2O"],["NH3.H2O"]],
  [["CO2","H2O"],["H2CO3"]],
  [["Cl2","H2O"],["HCl","HClO"]],
  [["SO2","H2O"],["H2SO3"]],
  [["CH3COOH","C2H5OH"],["CH3COOC2H5","H2O"]],
];
const REVERSIBLE_SIGS = new Set(REVERSIBLE_SETS.map(([l,r])=>sig(l,r)));
function sig(left,right){ return [...left].sort().join("+")+"|"+[...right].sort().join("+"); }

// ===== 剂量相关反应（少量/过量产物不同）=====
// 每个变体只写物种（left/right），系数由代数配平器计算，保证守恒。
const DOSAGE = [
  { reactants:["CO2","Ca(OH)2"], title:"CO₂ 通入澄清石灰水", variants:[
    { label:"CO₂ 少量", left:["Ca(OH)2","CO2"], right:["CaCO3","H2O"], note:"生成白色碳酸钙沉淀，石灰水变浑浊" },
    { label:"CO₂ 过量（第二步）", left:["CaCO3","CO2","H2O"], right:["Ca(HCO3)2"], note:"继续通入 CO₂，沉淀溶解，生成可溶的碳酸氢钙" },
    { label:"CO₂ 过量（总反应）", left:["Ca(OH)2","CO2"], right:["Ca(HCO3)2"], note:"= 少量与过量两步之和" },
  ]},
  { reactants:["CO2","NaOH"], title:"CO₂ 通入 NaOH 溶液", variants:[
    { label:"CO₂ 少量", left:["NaOH","CO2"], right:["Na2CO3","H2O"], note:"生成碳酸钠" },
    { label:"CO₂ 过量", left:["NaOH","CO2"], right:["NaHCO3"], note:"生成碳酸氢钠" },
    { label:"分步（第二步）", left:["Na2CO3","CO2","H2O"], right:["NaHCO3"], note:"碳酸钠继续吸收 CO₂" },
  ]},
  { reactants:["CO2","KOH"], title:"CO₂ 通入 KOH 溶液", variants:[
    { label:"CO₂ 少量", left:["KOH","CO2"], right:["K2CO3","H2O"], note:"生成碳酸钾" },
    { label:"CO₂ 过量", left:["KOH","CO2"], right:["KHCO3"], note:"生成碳酸氢钾" },
  ]},
  { reactants:["SO2","NaOH"], title:"SO₂ 通入 NaOH 溶液", variants:[
    { label:"SO₂ 少量", left:["NaOH","SO2"], right:["Na2SO3","H2O"], note:"生成亚硫酸钠" },
    { label:"SO₂ 过量", left:["NaOH","SO2"], right:["NaHSO3"], note:"生成亚硫酸氢钠" },
  ]},
  { reactants:["SO2","Ca(OH)2"], title:"SO₂ 通入澄清石灰水", variants:[
    { label:"SO₂ 少量", left:["Ca(OH)2","SO2"], right:["CaSO3","H2O"], note:"生成白色亚硫酸钙沉淀" },
    { label:"SO₂ 过量（总反应）", left:["Ca(OH)2","SO2"], right:["Ca(HSO3)2"], note:"沉淀溶解生成可溶的亚硫酸氢钙" },
  ]},
  { reactants:["Na2CO3","HCl"], title:"向 Na₂CO₃ 溶液滴加稀盐酸", variants:[
    { label:"HCl 少量（第一步）", left:["Na2CO3","HCl"], right:["NaHCO3","NaCl"], note:"先生成碳酸氢钠，无气泡" },
    { label:"HCl 过量（总反应）", left:["Na2CO3","HCl"], right:["NaCl","H2O","CO2"], note:"继续加盐酸产生气泡" },
    { label:"分步（第二步）", left:["NaHCO3","HCl"], right:["NaCl","H2O","CO2"], note:"碳酸氢钠与盐酸反应放 CO₂" },
  ]},
  { reactants:["AlCl3","NaOH"], title:"向 AlCl₃ 溶液滴加 NaOH", variants:[
    { label:"NaOH 少量", left:["AlCl3","NaOH"], right:["Al(OH)3","NaCl"], note:"生成白色氢氧化铝沉淀" },
    { label:"NaOH 过量（第二步）", left:["Al(OH)3","NaOH"], right:["NaAlO2","H2O"], note:"沉淀溶于过量强碱，生成偏铝酸钠" },
    { label:"NaOH 过量（总反应）", left:["AlCl3","NaOH"], right:["NaAlO2","NaCl","H2O"], note:"两步之和" },
  ]},
  { reactants:["NaAlO2","HCl"], title:"向 NaAlO₂ 溶液滴加盐酸", variants:[
    { label:"HCl 少量", left:["NaAlO2","HCl","H2O"], right:["Al(OH)3","NaCl"], note:"生成白色氢氧化铝沉淀" },
    { label:"HCl 过量（总反应）", left:["NaAlO2","HCl"], right:["AlCl3","NaCl","H2O"], note:"沉淀溶于过量盐酸" },
  ]},
  { reactants:["AgNO3","NH3.H2O"], title:"向 AgNO₃ 溶液滴加氨水", variants:[
    { label:"氨水少量", left:["AgNO3","NH3.H2O"], right:["AgOH","NH4NO3"], note:"先生成 AgOH（迅速脱水为褐色 Ag₂O）沉淀" },
    { label:"氨水过量", left:["AgOH","NH3.H2O"], right:["[Ag(NH3)2]OH","H2O"], note:"沉淀溶解，生成银氨溶液 [Ag(NH₃)₂]⁺" },
  ]},
  { reactants:["Fe","HNO3"], title:"Fe 与稀硝酸", cond:"稀", variants:[
    { label:"Fe 少量", left:["Fe","HNO3"], right:["Fe(NO3)3","NO","H2O"], note:"Fe 少量被氧化为 Fe³⁺" },
    { label:"Fe 过量", left:["Fe","HNO3"], right:["Fe(NO3)2","NO","H2O"], note:"Fe 过量时 Fe³⁺ 被还原为 Fe²⁺" },
  ]},
  { reactants:["Cl2","FeBr2"], title:"Cl₂ 通入 FeBr₂ 溶液", variants:[
    { label:"Cl₂ 少量", left:["FeBr2","Cl2"], right:["FeBr3","FeCl3"], note:"先氧化还原性更强的 Fe²⁺" },
    { label:"Cl₂ 过量", left:["FeBr2","Cl2"], right:["FeCl3","Br2"], note:"Fe²⁺ 与 Br⁻ 都被氧化" },
  ]},
  { reactants:["P","Cl2"], title:"磷在氯气中反应", variants:[
    { label:"Cl₂ 少量", left:["P","Cl2"], right:["PCl3"], note:"生成三氯化磷" },
    { label:"Cl₂ 过量", left:["P","Cl2"], right:["PCl5"], note:"生成五氯化磷" },
  ]},
  { reactants:["C","O2"], title:"碳在氧气中燃烧", variants:[
    { label:"O₂ 充足", left:["C","O2"], right:["CO2"], note:"充分燃烧生成二氧化碳" },
    { label:"O₂ 不足", left:["C","O2"], right:["CO"], note:"不充分燃烧生成一氧化碳" },
  ]},
  { reactants:["NaHCO3","Ca(OH)2"], title:"NaHCO₃ 与 Ca(OH)₂", variants:[
    { label:"Ca(OH)₂ 少量", left:["NaHCO3","Ca(OH)2"], right:["CaCO3","Na2CO3","H2O"], note:"" },
    { label:"Ca(OH)₂ 过量", left:["NaHCO3","Ca(OH)2"], right:["CaCO3","NaOH","H2O"], note:"" },
  ]},
];
// 以「排序后的反应物」为键建立索引
const DOSAGE_MAP = new Map();
for(const d of DOSAGE){ DOSAGE_MAP.set([...d.reactants].sort().join("+"), d); }

export function lookupDosage(reactants){
  if(!Array.isArray(reactants)) return null;
  return DOSAGE_MAP.get([...reactants].sort().join("+")) || null;
}

// ===== 反应物分类 =====
export function classify(f) {
  if (ACID[f]) return { type: "acid", cat: { sym: "H", q: 1 }, an: { sym: ACID[f][0], q: ACID[f][1] } };
  if (BASE[f]) return { type: "base", cat: { sym: BASE[f][0], q: BASE[f][1] }, an: { sym: "OH", q: 1 } };
  if (CARBONATE[f]) return { type: "carbonate", cat: { sym: CARBONATE[f][0], q: CARBONATE[f][1] }, an: { sym: "CO3", q: 2 } };
  if (BICARB[f]) return { type: "bicarbonate", cat: { sym: BICARB[f][0], q: BICARB[f][1] }, an: { sym: "HCO3", q: 1 } };
  if (METAL_OXIDE[f]) return { type: "metalOxide", cat: { sym: METAL_OXIDE[f][0], q: METAL_OXIDE[f][1] }, an: { sym: "O", q: 2 } };
  if (ACTIVE_METAL[f] != null) return { type: "activeMetal", cat: { sym: f, q: ACTIVE_METAL[f] }, an: null };
  if (NONMETAL_OXIDE[f]) return { type: "nonmetalOxide", cat: null, an: { sym: NONMETAL_OXIDE[f][0], q: NONMETAL_OXIDE[f][1] } };
  return null;
}

// 由阳离子+阴离子按电荷守恒生成盐
export function makeSalt(cation, cq, anion, aq) {
  const g = gcd(Math.abs(cq), Math.abs(aq));
  const cn = Math.abs(aq) / g, an = Math.abs(cq) / g;
  const cPart = cation + (cn === 1 ? "" : cn);
  let aPart;
  if (an === 1) aPart = anion;
  else aPart = (anion.length > 1 && /[A-Z][a-z]?[A-Z]/.test(anion)) ? `(${anion})${an}` : `${anion}${an}`;
  return cPart + aPart;
}
function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a || 1; }

// ===== 本地反应补全 =====
export function localCompleteReaction(reactants) {
  if (!Array.isArray(reactants) || reactants.length !== 2) return null;
  const A = classify(reactants[0]);
  const B = classify(reactants[1]);
  if (!A || !B) return null;
  const out = (right, type, note) => ({ left: reactants.slice(), right, type, note, _ai: false });
  const is = (x, t) => x.type === t;
  const pair = (t1, t2) => (is(A, t1) && is(B, t2)) || (is(A, t2) && is(B, t1));
  const get = (t) => is(A, t) ? A : B;

  if (pair("acid", "base")) { const ac=get("acid"),ba=get("base"); return out([makeSalt(ba.cat.sym,ba.cat.q,ac.an.sym,ac.an.q),"H2O"],"酸碱中和","酸与碱中和生成盐和水。"); }
  if (pair("acid", "carbonate")) { const ac=get("acid"),cb=get("carbonate"); return out([makeSalt(cb.cat.sym,cb.cat.q,ac.an.sym,ac.an.q),"H2O","CO2"],"复分解","酸与碳酸盐反应生成盐、水和二氧化碳。"); }
  if (pair("acid", "bicarbonate")) { const ac=get("acid"),bc=get("bicarbonate"); return out([makeSalt(bc.cat.sym,bc.cat.q,ac.an.sym,ac.an.q),"H2O","CO2"],"复分解","酸与碳酸氢盐反应生成盐、水和二氧化碳。"); }
  if (pair("acid", "metalOxide")) { const ac=get("acid"),mo=get("metalOxide"); return out([makeSalt(mo.cat.sym,mo.cat.q,ac.an.sym,ac.an.q),"H2O"],"复分解","酸与金属氧化物反应生成盐和水。"); }
  if (pair("activeMetal", "acid")) { const m=get("activeMetal"),ac=get("acid"); return out([makeSalt(m.cat.sym,m.cat.q,ac.an.sym,ac.an.q),"H2"],"置换","活泼金属与稀酸反应生成盐和氢气（金属活动性在氢之前）。"); }
  if (pair("base", "nonmetalOxide")) { const ba=get("base"),no=get("nonmetalOxide"); return out([makeSalt(ba.cat.sym,ba.cat.q,no.an.sym,no.an.q),"H2O"],"复分解","碱与酸性氧化物反应生成盐和水。"); }
  return null;
}

// ===== 状态符号（↓/↑）=====
// 单质判断：单个元素符号+可选下标（如 C、O2、Fe）
function isElemental(f){ return /^[A-Z][a-z]?\d*$/.test(f); }
// 仅当反应物全是单质（燃烧/化合等气相或固相反应）时不标注；
// 只要有一种反应物是化合物（酸/碱/盐/氧化物等，即溶液反应），就标注沉淀↓与气体↑。
export function annotateStates(left, right){
  const allElemental = left.every(s=> isElemental(s.formula));
  if(allElemental) return right;
  for(const p of right){
    if(INSOLUBLE.has(p.formula)) p.state = "↓";
    else if(GASES.has(p.formula)) p.state = "↑";
  }
  return right;
}

// ===== 可逆反应识别 =====
export function isReversible(leftFormulas, rightFormulas){
  return REVERSIBLE_SIGS.has(sig(leftFormulas, rightFormulas));
}

// 暴露集合（测试用）
export const _data = { GASES, INSOLUBLE, DOSAGE };
