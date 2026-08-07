// src/chem-reactions.js — 本地无机反应补全引擎（纯逻辑，不依赖 env/AI）
// 覆盖常见反应类型，让常见方程式无需 AI 即可即时补全；覆盖不了的由调用方回退到 AI。
//
// 支持的类型：
//   酸 + 碱           → 盐 + 水            （酸碱中和）
//   酸 + 碳酸盐/碳酸氢盐 → 盐 + 水 + CO2   （复分解）
//   酸 + 金属氧化物     → 盐 + 水           （复分解）
//   活泼金属 + 酸       → 盐 + 氢气         （置换，默认稀酸）
//   碱 + 非金属氧化物   → 盐 + 水           （复分解）

// 各类反应物的「离子拆分」表：值 = [阳离子符号, 阳离子电荷]
const ACID = { "HCl":["Cl",1],"H2SO4":["SO4",2],"HNO3":["NO3",1],"H3PO4":["PO4",3],"H2CO3":["CO3",2],"CH3COOH":["CH3COO",1],"H2S":["S",2],"HF":["F",1],"HBr":["Br",1],"HI":["I",1],"H2SO3":["SO3",2] };
const BASE = { "NaOH":["Na",1],"KOH":["K",1],"LiOH":["Li",1],"Ca(OH)2":["Ca",2],"Mg(OH)2":["Mg",2],"Ba(OH)2":["Ba",2],"Cu(OH)2":["Cu",2],"Zn(OH)2":["Zn",2],"Fe(OH)2":["Fe",2],"Fe(OH)3":["Fe",3],"Al(OH)3":["Al",3] };
const CARBONATE = { "Na2CO3":["Na",1],"K2CO3":["K",1],"CaCO3":["Ca",2],"MgCO3":["Mg",2],"BaCO3":["Ba",2],"ZnCO3":["Zn",2],"CuCO3":["Cu",2],"FeCO3":["Fe",2],"Al2(CO3)3":["Al",3] };
const BICARB = { "NaHCO3":["Na",1],"KHCO3":["K",1],"Ca(HCO3)2":["Ca",2],"Mg(HCO3)2":["Mg",2] };
const METAL_OXIDE = { "Na2O":["Na",1],"K2O":["K",1],"CaO":["Ca",2],"MgO":["Mg",2],"BaO":["Ba",2],"CuO":["Cu",2],"ZnO":["Zn",2],"FeO":["Fe",2],"Al2O3":["Al",3],"Fe2O3":["Fe",3] };
const ACTIVE_METAL = { "Na":1,"K":1,"Li":1,"Ca":2,"Ba":2,"Mg":2,"Al":3,"Zn":2,"Fe":2,"Sn":2,"Pb":2 }; // 金属活动性在氢之前
const NONMETAL_OXIDE = { "CO2":["CO3",2],"SO2":["SO3",2],"SO3":["SO4",2],"N2O5":["NO3",1],"P2O5":["PO4",3] }; // 酸性氧化物 → 对应含氧酸根

// 将单个反应物分类并拆出阳离子/阴离子
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

// 由阳离子 + 阴离子按电荷守恒生成盐的化学式
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

// 主入口：给一组反应物，尝试本地补全产物；无法覆盖返回 null
export function localCompleteReaction(reactants) {
  if (!Array.isArray(reactants) || reactants.length !== 2) return null;
  const A = classify(reactants[0]);
  const B = classify(reactants[1]);
  if (!A || !B) return null;
  const out = (right, type, note) => ({ left: reactants.slice(), right, type, note, _ai: false });
  const is = (x, t) => x.type === t;
  const pair = (t1, t2) => (is(A, t1) && is(B, t2)) || (is(A, t2) && is(B, t1));
  const get = (t) => is(A, t) ? A : B;

  if (pair("acid", "base")) {
    const ac = get("acid"), ba = get("base");
    return out([makeSalt(ba.cat.sym, ba.cat.q, ac.an.sym, ac.an.q), "H2O"], "酸碱中和", "酸与碱中和生成盐和水。");
  }
  if (pair("acid", "carbonate")) {
    const ac = get("acid"), cb = get("carbonate");
    return out([makeSalt(cb.cat.sym, cb.cat.q, ac.an.sym, ac.an.q), "H2O", "CO2"], "复分解", "酸与碳酸盐反应生成盐、水和二氧化碳。");
  }
  if (pair("acid", "bicarbonate")) {
    const ac = get("acid"), bc = get("bicarbonate");
    return out([makeSalt(bc.cat.sym, bc.cat.q, ac.an.sym, ac.an.q), "H2O", "CO2"], "复分解", "酸与碳酸氢盐反应生成盐、水和二氧化碳。");
  }
  if (pair("acid", "metalOxide")) {
    const ac = get("acid"), mo = get("metalOxide");
    return out([makeSalt(mo.cat.sym, mo.cat.q, ac.an.sym, ac.an.q), "H2O"], "复分解", "酸与金属氧化物反应生成盐和水。");
  }
  if (pair("activeMetal", "acid")) {
    const m = get("activeMetal"), ac = get("acid");
    return out([makeSalt(m.cat.sym, m.cat.q, ac.an.sym, ac.an.q), "H2"], "置换", "活泼金属与稀酸反应生成盐和氢气（金属活动性在氢之前）。");
  }
  if (pair("base", "nonmetalOxide")) {
    const ba = get("base"), no = get("nonmetalOxide");
    return out([makeSalt(ba.cat.sym, ba.cat.q, no.an.sym, no.an.q), "H2O"], "复分解", "碱与酸性氧化物反应生成盐和水。");
  }
  return null;
}
