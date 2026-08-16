// chem-structure.js — 化学式 → 结构式(SMILES) 映射与查询
// 纯数据 + 查询逻辑，浏览器/Worker 共用（本模块仅浏览器使用，Worker 不依赖）。
// 结构式渲染由前端动态加载 public/vendor/smiles-drawer.min.mjs 完成（见 app.js）。
//
// 设计原则：
//   1) 化学式本身不携带结构信息，结构必须靠映射/预置。本表覆盖 KNOWNS 知识库
//      中可合理给出分子/离子结构的物质，以及常见有机分子的同分异构体。
//   2) 同分异构体：ISOMER_STRUCTURES 以"分子式"(如 C2H6O) 为键，值为全部常见
//      异构体（SMILES + 名称），渲染时全部画出。示例：输入 C2H6O → 乙醇 + 二甲醚。
//   3) 无机离子化合物用离子式 SMILES（[M+n].[X-...]），如 CuSO4 →
//      [Cu+2].[O-]S(=O)(=O)[O-]，体现组成与酸根骨架。
//   4) 无法合理表示结构的（金属单质、复杂共价巨型结构、晶格氧化物等）不收录，
//      前端显示"暂无结构式"。

import { parseFormula } from "./chem-engine.js";

// ─────────────────────────────────────────────────────────────────────────────
// FORMULA_STRUCTURES：键 = KNOWNS 规范化化学式；值 = 结构数组 [{smiles,name,note?}]
// name: {cn,en}；note 用于补充（如水合物标注）。
// ─────────────────────────────────────────────────────────────────────────────

// 常见离子/分子片段模板（仅用于本文件内部拼写，可读性优先）
const I = {
  Na: "[Na+]", K: "[K+]", Ca: "[Ca+2]", Mg: "[Mg+2]", Ba: "[Ba+2]", Al: "[Al+3]",
  Fe2: "[Fe+2]", Fe3: "[Fe+3]", Cu2: "[Cu+2]", Cu1: "[Cu+]", Zn: "[Zn+2]",
  Mn: "[Mn+2]", Ni: "[Ni+2]", Co: "[Co+2]", Cr: "[Cr+3]", Pb: "[Pb+2]",
  Pb4: "[Pb+4]", Sn: "[Sn+2]", Sn4: "[Sn+4]", Ag: "[Ag+]", Hg2: "[Hg+2]",
  Hg22: "[Hg+][Hg+]", NH4: "[NH4+]", Bi: "[Bi+3]",
  O2i: "[O-2]", Cl: "[Cl-]", Br: "[Br-]", Ii: "[I-]", S2i: "[S-2]",
  OH: "[OH-]", Ac: "[O-]C(C)=O", NO3: "[O-][N+](=O)[O-]",
  SO4: "[O-]S(=O)(=O)[O-]", SO3: "[O-]S(=O)[O-]", CO3: "[O-]C(=O)[O-]",
  PO4: "[O-]P(=O)([O-])[O-]", HPO4: "[O-]P(=O)(O)[O-]", H2PO4: "[O-]P(=O)(O)O",
  HCO3: "[O-]C(=O)O", ClO: "[O-]Cl", ClO3: "[O-]Cl(=O)=O", ClO4: "[O-]Cl(=O)(=O)=O",
  MnO4: "[O-][Mn](=O)(=O)=O", Cr2O7: "[O-][Cr](=O)(=O)O[Cr](=O)(=O)[O-]",
  S2O3: "[O-]S(=O)(=O)[S-]", CrO4: "[O-][Cr](=O)(=O)[O-]", AlO2: "[O-][Al]=O",
};
// 二元离子化合物（阳离子 × n + 阴离子 × m）
const salt = (cat, catN, anion, anionN) =>
  Array(catN).fill(cat).concat(Array(anionN).fill(anion)).join(".");

export const FORMULA_STRUCTURES = {
  // ── 单质 / 同核分子 ──
  "H2":   [{ smiles:"[H][H]", name:{cn:"氢气（H–H）", en:"Hydrogen (H–H)"} }],
  "O2":   [{ smiles:"O=O",    name:{cn:"氧气（O=O）", en:"Oxygen (O=O)"} }],
  "N2":   [{ smiles:"N#N",    name:{cn:"氮气（N≡N）", en:"Nitrogen (N≡N)"} }],
  "Cl2":  [{ smiles:"ClCl",   name:{cn:"氯气（Cl–Cl）", en:"Chlorine (Cl–Cl)"} }],
  "P4":   [{ smiles:"P12P3P1P23", name:{cn:"白磷（P₄ 四面体）", en:"White phosphorus (P₄ tetrahedron)"} }],
  "P":    [{ smiles:"P12P3P1P23", name:{cn:"磷单质（P₄ 环）", en:"Phosphorus (P₄ ring)"} }],

  // ── 水与常见氧化物 / 分子 ──
  "H2O":  [{ smiles:"O",      name:{cn:"水（H₂O）", en:"Water (H₂O)"} }],
  "H2O2": [{ smiles:"OO",     name:{cn:"过氧化氢（H–O–O–H）", en:"Hydrogen peroxide (H–O–O–H)"} }],
  "CO":   [{ smiles:"[C-]#[O+]", name:{cn:"一氧化碳（C≡O）", en:"Carbon monoxide (C≡O)"} }],
  "CO2":  [{ smiles:"O=C=O",  name:{cn:"二氧化碳（O=C=O）", en:"Carbon dioxide (O=C=O)"} }],
  "NO":   [{ smiles:"[N]=[O]",name:{cn:"一氧化氮（N=O）", en:"Nitric oxide (N=O)"} }],
  "NO2":  [{ smiles:"O=[N+][O-]", name:{cn:"二氧化氮（O=N–O·）", en:"Nitrogen dioxide (O=N–O·)"} }],
  "N2O":  [{ smiles:"[N-]=[N+]=O", name:{cn:"一氧化二氮（N≡N⁺–O⁻）", en:"Nitrous oxide (N≡N⁺–O⁻)"} }],
  "SO2":  [{ smiles:"O=S=O",  name:{cn:"二氧化硫（O=S=O）", en:"Sulfur dioxide (O=S=O)"} }],
  "SO3":  [{ smiles:"O=S(=O)=O", name:{cn:"三氧化硫（O=S(=O)=O）", en:"Sulfur trioxide (O=S(=O)=O)"} }],
  "SiO2": [{ smiles:"O=[Si]=O", name:{cn:"二氧化硅（O=Si=O，示意）", en:"Silicon dioxide (O=Si=O, schematic)"} }],
  "CrO3": [{ smiles:"O=[Cr](=O)=O", name:{cn:"三氧化铬（O=Cr(=O)=O）", en:"Chromium trioxide (O=Cr(=O)=O)"} }],
  "N2O3": [{ smiles:"O=N-O-N=O", name:{cn:"三氧化二氮（O=N–O–N=O）", en:"Dinitrogen trioxide (O=N–O–N=O)"} }],
  "N2O5": [{ smiles:"[O-][N+](=O)O[N+](=O)[O-]", name:{cn:"五氧化二氮（O₂N–O–NO₂）", en:"Dinitrogen pentoxide (O₂N–O–NO₂)"} }],
  "Cl2O": [{ smiles:"O(Cl)Cl", name:{cn:"一氧化二氯（Cl–O–Cl）", en:"Dichlorine monoxide (Cl–O–Cl)"} }],
  "Cl2O7":[{ smiles:"O=Cl(=O)(=O)OCl(=O)(=O)=O", name:{cn:"七氧化二氯（ClO₃–O–ClO₃）", en:"Dichlorine heptoxide (ClO₃–O–ClO₃)"} }],
  "Mn2O7":[{ smiles:"O=[Mn](=O)(=O)O[Mn](=O)(=O)=O", name:{cn:"高锰酸酐（O₃Mn–O–MnO₃）", en:"Manganese heptoxide (O₃Mn–O–MnO₃)"} }],
  "H2S":  [{ smiles:"S",      name:{cn:"硫化氢（H₂S）", en:"Hydrogen sulfide (H₂S)"} }],
  "NH3":  [{ smiles:"N",      name:{cn:"氨（NH₃）", en:"Ammonia (NH₃)"} }],
  "HCN":  [{ smiles:"C#N",    name:{cn:"氰化氢（H–C≡N）", en:"Hydrogen cyanide (H–C≡N)"} }],
  "HSCN": [{ smiles:"SC#N",   name:{cn:"硫氰酸（H–S–C≡N）", en:"Thiocyanic acid (H–S–C≡N)"} }],
  "HCl":  [{ smiles:"Cl",     name:{cn:"氯化氢（H–Cl）", en:"Hydrogen chloride (H–Cl)"} }],
  "HBr":  [{ smiles:"Br",     name:{cn:"溴化氢（H–Br）", en:"Hydrogen bromide (H–Br)"} }],
  "HI":   [{ smiles:"I",      name:{cn:"碘化氢（H–I）", en:"Hydrogen iodide (H–I)"} }],
  "HF":   [{ smiles:"F",      name:{cn:"氟化氢（H–F）", en:"Hydrogen fluoride (H–F)"} }],
  "CaC2": [{ smiles:`${I.Ca}.${"[C-]#[C-]"}`, name:{cn:"碳化钙（[C≡C]²⁻）", en:"Calcium carbide ([C≡C]²⁻)"} }],

  // ── 含氧酸（中性分子式）──
  "H2CO3": [{ smiles:"OC(=O)O", name:{cn:"碳酸（HO–C(=O)–OH）", en:"Carbonic acid (HO–C(=O)–OH)"} }],
  "H2SO3": [{ smiles:"OS(=O)O", name:{cn:"亚硫酸（HO–S(=O)–OH）", en:"Sulfurous acid (HO–S(=O)–OH)"} }],
  "H2SO4": [{ smiles:"OS(=O)(=O)O", name:{cn:"硫酸（HO–S(=O)₂–OH）", en:"Sulfuric acid (HO–S(=O)₂–OH)"} }],
  "H2S2O3":[{ smiles:"OS(=O)(=O)S", name:{cn:"硫代硫酸（HO–S(=O)₂–SH）", en:"Thiosulfuric acid (HO–S(=O)₂–SH)"} }],
  "HNO2": [{ smiles:"ON=O",   name:{cn:"亚硝酸（HO–N=O）", en:"Nitrous acid (HO–N=O)"} }],
  "HNO3": [{ smiles:"O=[N+]([O-])O", name:{cn:"硝酸（HO–NO₂）", en:"Nitric acid (HO–NO₂)"} }],
  "H3PO4":[{ smiles:"OP(=O)(O)O", name:{cn:"磷酸（HO–P(=O)(OH)₂）", en:"Phosphoric acid (HO–P(=O)(OH)₂)"} }],
  "H3BO3":[{ smiles:"OB(O)O", name:{cn:"硼酸（B(OH)₃）", en:"Boric acid (B(OH)₃)"} }],
  "H2SiO3":[{ smiles:"O=[Si](O)O", name:{cn:"偏硅酸（(HO)₂Si=O）", en:"Metasilicic acid ((HO)₂Si=O)"} }],
  "HClO": [{ smiles:"OCl",    name:{cn:"次氯酸（HO–Cl）", en:"Hypochlorous acid (HO–Cl)"} }],
  "HClO2":[{ smiles:"O=ClO",  name:{cn:"亚氯酸（HO–Cl=O）", en:"Chlorous acid (HO–Cl=O)"} }],
  "HClO3":[{ smiles:"O=Cl(=O)O", name:{cn:"氯酸（HO–Cl(=O)₂）", en:"Chloric acid (HO–Cl(=O)₂)"} }],
  "HClO4":[{ smiles:"O=Cl(=O)(=O)O", name:{cn:"高氯酸（HO–Cl(=O)₃）", en:"Perchloric acid (HO–Cl(=O)₃)"} }],

  // ── 碱 ──
  "NaOH":   [{ smiles: salt(I.Na,1,I.OH,1), name:{cn:"氢氧化钠", en:"Sodium hydroxide"} }],
  "KOH":    [{ smiles: salt(I.K,1,I.OH,1),  name:{cn:"氢氧化钾", en:"Potassium hydroxide"} }],
  "NH4OH":  [{ smiles: salt(I.NH4,1,I.OH,1), name:{cn:"氨水（NH₄OH）", en:"Ammonium hydroxide"} }],
  "Ca(OH)2":[{ smiles: salt(I.Ca,1,I.OH,2), name:{cn:"氢氧化钙", en:"Calcium hydroxide"} }],
  "Mg(OH)2":[{ smiles: salt(I.Mg,1,I.OH,2), name:{cn:"氢氧化镁", en:"Magnesium hydroxide"} }],
  "Al(OH)3":[{ smiles: salt(I.Al,1,I.OH,3), name:{cn:"氢氧化铝", en:"Aluminum hydroxide"} }],
  "Fe(OH)2":[{ smiles: salt(I.Fe2,1,I.OH,2), name:{cn:"氢氧化亚铁", en:"Iron(II) hydroxide"} }],
  "Fe(OH)3":[{ smiles: salt(I.Fe3,1,I.OH,3), name:{cn:"氢氧化铁", en:"Iron(III) hydroxide"} }],
  "Cu(OH)2":[{ smiles: salt(I.Cu2,1,I.OH,2), name:{cn:"氢氧化铜", en:"Copper(II) hydroxide"} }],
  "Mn(OH)2":[{ smiles: salt(I.Mn,1,I.OH,2), name:{cn:"氢氧化锰(II)", en:"Manganese(II) hydroxide"} }],
  "Co(OH)2":[{ smiles: salt(I.Co,1,I.OH,2), name:{cn:"氢氧化钴(II)", en:"Cobalt(II) hydroxide"} }],
  "Ni(OH)2":[{ smiles: salt(I.Ni,1,I.OH,2), name:{cn:"氢氧化镍(II)", en:"Nickel(II) hydroxide"} }],
  "Cr(OH)3":[{ smiles: salt(I.Cr,1,I.OH,3), name:{cn:"氢氧化铬(III)", en:"Chromium(III) hydroxide"} }],
  "Pb(OH)2":[{ smiles: salt(I.Pb,1,I.OH,2), name:{cn:"氢氧化铅(II)", en:"Lead(II) hydroxide"} }],
  "Zn(OH)2":[{ smiles: salt(I.Zn,1,I.OH,2), name:{cn:"氢氧化锌", en:"Zinc hydroxide"} }],
  "Sn(OH)2":[{ smiles: salt(I.Sn,1,I.OH,2), name:{cn:"氢氧化亚锡", en:"Tin(II) hydroxide"} }],
  "Bi(OH)3":[{ smiles: salt(I.Bi,1,I.OH,3), name:{cn:"氢氧化铋(III)", en:"Bismuth(III) hydroxide"} }],
  "AgOH":   [{ smiles: salt(I.Ag,1,I.OH,1), name:{cn:"氢氧化银（生成即分解）", en:"Silver hydroxide (decomposes immediately)"} }],
  "AuOH":   [{ smiles: salt(I.Ag,1,I.OH,1), name:{cn:"氢氧化金(I)（歧化分解）", en:"Gold(I) hydroxide (disproportionates)"} }],
  "Au(OH)3":[{ smiles: salt(I.Ag,1,I.OH,1), name:{cn:"氢氧化金(III)（示意）", en:"Gold(III) hydroxide (schematic)"} }],
  "Hg2(OH)2":[{ smiles: salt(I.Hg22,1,I.OH,2), name:{cn:"氢氧化亚汞(I)（实际不存在）", en:"Mercury(I) hydroxide (does not exist)"} }],

  // ── 卤化物盐 ──
  "NaCl":   [{ smiles: salt(I.Na,1,I.Cl,1), name:{cn:"氯化钠", en:"Sodium chloride"} }],
  "KCl":    [{ smiles: salt(I.K,1,I.Cl,1), name:{cn:"氯化钾", en:"Potassium chloride"} }],
  "NaBr":   [{ smiles: salt(I.Na,1,I.Br,1), name:{cn:"溴化钠", en:"Sodium bromide"} }],
  "KBr":    [{ smiles: salt(I.K,1,I.Br,1), name:{cn:"溴化钾", en:"Potassium bromide"} }],
  "NaI":    [{ smiles: salt(I.Na,1,I.Ii,1), name:{cn:"碘化钠", en:"Sodium iodide"} }],
  "KI":     [{ smiles: salt(I.K,1,I.Ii,1), name:{cn:"碘化钾", en:"Potassium iodide"} }],
  "AgCl":   [{ smiles: salt(I.Ag,1,I.Cl,1), name:{cn:"氯化银", en:"Silver chloride"} }],
  "AgBr":   [{ smiles: salt(I.Ag,1,I.Br,1), name:{cn:"溴化银", en:"Silver bromide"} }],
  "AgI":    [{ smiles: salt(I.Ag,1,I.Ii,1), name:{cn:"碘化银", en:"Silver iodide"} }],
  "MgCl2":  [{ smiles: salt(I.Mg,1,I.Cl,2), name:{cn:"氯化镁", en:"Magnesium chloride"} }],
  "CaCl2":  [{ smiles: salt(I.Ca,1,I.Cl,2), name:{cn:"氯化钙", en:"Calcium chloride"} }],
  "BaCl2":  [{ smiles: salt(I.Ba,1,I.Cl,2), name:{cn:"氯化钡", en:"Barium chloride"} }],
  "AlCl3":  [{ smiles: salt(I.Al,1,I.Cl,3), name:{cn:"氯化铝", en:"Aluminum chloride"} }],
  "FeCl2":  [{ smiles: salt(I.Fe2,1,I.Cl,2), name:{cn:"氯化亚铁", en:"Iron(II) chloride"} }],
  "FeCl3":  [{ smiles: salt(I.Fe3,1,I.Cl,3), name:{cn:"氯化铁", en:"Iron(III) chloride"} }],
  "CuCl":   [{ smiles: salt(I.Cu1,1,I.Cl,1), name:{cn:"氯化亚铜", en:"Copper(I) chloride"} }],
  "CuCl2":  [{ smiles: salt(I.Cu2,1,I.Cl,2), name:{cn:"氯化铜", en:"Copper(II) chloride"} }],
  "ZnCl2":  [{ smiles: salt(I.Zn,1,I.Cl,2), name:{cn:"氯化锌", en:"Zinc chloride"} }],
  "MnCl2":  [{ smiles: salt(I.Mn,1,I.Cl,2), name:{cn:"氯化锰(II)", en:"Manganese(II) chloride"} }],
  "NiCl2":  [{ smiles: salt(I.Ni,1,I.Cl,2), name:{cn:"氯化镍(II)", en:"Nickel(II) chloride"} }],
  "CoCl2":  [{ smiles: salt(I.Co,1,I.Cl,2), name:{cn:"氯化钴(II)", en:"Cobalt(II) chloride"} }],
  "CrCl3":  [{ smiles: salt(I.Cr,1,I.Cl,3), name:{cn:"氯化铬(III)", en:"Chromium(III) chloride"} }],
  "PbCl2":  [{ smiles: salt(I.Pb,1,I.Cl,2), name:{cn:"氯化铅(II)", en:"Lead(II) chloride"} }],
  "SnCl2":  [{ smiles: salt(I.Sn,1,I.Cl,2), name:{cn:"氯化亚锡", en:"Tin(II) chloride"} }],
  "SnCl4":  [{ smiles: salt(I.Sn4,1,I.Cl,4), name:{cn:"氯化锡(IV)", en:"Tin(IV) chloride"} }],
  "HgCl2":  [{ smiles: salt(I.Hg2,1,I.Cl,2), name:{cn:"氯化汞（升汞）", en:"Mercury(II) chloride"} }],
  "Hg2Cl2": [{ smiles: salt(I.Hg22,1,I.Cl,2), name:{cn:"氯化亚汞（甘汞）", en:"Mercury(I) chloride"} }],
  "NH4Cl":  [{ smiles: salt(I.NH4,1,I.Cl,1), name:{cn:"氯化铵", en:"Ammonium chloride"} }],

  // ── 氧化物（离子/分子式）──
  "CaO":   [{ smiles: salt(I.Ca,1,I.O2i,1), name:{cn:"氧化钙", en:"Calcium oxide"} }],
  "MgO":   [{ smiles: salt(I.Mg,1,I.O2i,1), name:{cn:"氧化镁", en:"Magnesium oxide"} }],
  "Na2O":  [{ smiles: salt(I.Na,2,I.O2i,1), name:{cn:"氧化钠", en:"Sodium oxide"} }],
  "K2O":   [{ smiles: salt(I.K,2,I.O2i,1), name:{cn:"氧化钾", en:"Potassium oxide"} }],
  "CuO":   [{ smiles: salt(I.Cu2,1,I.O2i,1), name:{cn:"氧化铜", en:"Copper(II) oxide"} }],
  "Cu2O":  [{ smiles: salt(I.Cu1,2,I.O2i,1), name:{cn:"氧化亚铜", en:"Copper(I) oxide"} }],
  "FeO":   [{ smiles: salt(I.Fe2,1,I.O2i,1), name:{cn:"氧化亚铁", en:"Iron(II) oxide"} }],
  "Fe2O3": [{ smiles: salt(I.Fe3,2,I.O2i,3), name:{cn:"氧化铁", en:"Iron(III) oxide"} }],
  "Fe3O4": [{ smiles:"[Fe+2].[Fe+3].[Fe+3].[O-2].[O-2].[O-2].[O-2]", name:{cn:"四氧化三铁（FeO·Fe₂O₃）", en:"Iron(II,III) oxide (FeO·Fe₂O₃)"} }],
  "Al2O3": [{ smiles: salt(I.Al,2,I.O2i,3), name:{cn:"氧化铝", en:"Aluminum oxide"} }],
  "ZnO":   [{ smiles: salt(I.Zn,1,I.O2i,1), name:{cn:"氧化锌", en:"Zinc oxide"} }],
  "PbO":   [{ smiles: salt(I.Pb,1,I.O2i,1), name:{cn:"氧化铅（密陀僧）", en:"Lead(II) oxide"} }],
  "PbO2":  [{ smiles: salt(I.Pb4,1,I.O2i,2), name:{cn:"二氧化铅", en:"Lead(IV) oxide"} }],
  "Pb3O4": [{ smiles:"[Pb+2].[Pb+2].[Pb+4].[O-2].[O-2].[O-2].[O-2]", name:{cn:"四氧化三铅（Pb₂PbO₄）", en:"Lead(II,IV) oxide (Pb₂PbO₄)"} }],
  "HgO":   [{ smiles: salt(I.Hg2,1,I.O2i,1), name:{cn:"氧化汞", en:"Mercury(II) oxide"} }],
  "Ag2O":  [{ smiles: salt(I.Ag,2,I.O2i,1), name:{cn:"氧化银", en:"Silver oxide"} }],
  "Na2O2": [{ smiles: salt(I.Na,2,"[O-][O-]",1), name:{cn:"过氧化钠（O–O²⁻）", en:"Sodium peroxide (O–O²⁻)"} }],
  "BaO2":  [{ smiles: salt(I.Ba,1,"[O-][O-]",1), name:{cn:"过氧化钡（O–O²⁻）", en:"Barium peroxide (O–O²⁻)"} }],
  "KO2":   [{ smiles: salt(I.K,1,"[O-][O]",1), name:{cn:"超氧化钾（O₂⁻）", en:"Potassium superoxide (O₂⁻)"} }],

  // ── 含氧酸盐（离子式）──
  // 硫酸盐
  "Na2SO4": [{ smiles: salt(I.Na,2,I.SO4,1), name:{cn:"硫酸钠", en:"Sodium sulfate"} }],
  "K2SO4":  [{ smiles: salt(I.K,2,I.SO4,1), name:{cn:"硫酸钾", en:"Potassium sulfate"} }],
  "MgSO4":  [{ smiles: salt(I.Mg,1,I.SO4,1), name:{cn:"硫酸镁", en:"Magnesium sulfate"} }],
  "CaSO4.2H2O": [{ smiles: salt(I.Ca,1,I.SO4,1), name:{cn:"二水硫酸钙（石膏）", en:"Calcium sulfate dihydrate (gypsum)", note:"晶格含 2 个结晶水"} }],
  "BaSO4":  [{ smiles: salt(I.Ba,1,I.SO4,1), name:{cn:"硫酸钡", en:"Barium sulfate"} }],
  "ZnSO4":  [{ smiles: salt(I.Zn,1,I.SO4,1), name:{cn:"硫酸锌", en:"Zinc sulfate"} }],
  "FeSO4":  [{ smiles: salt(I.Fe2,1,I.SO4,1), name:{cn:"硫酸亚铁", en:"Iron(II) sulfate"} }],
  "Fe2(SO4)3": [{ smiles: salt(I.Fe3,2,I.SO4,3), name:{cn:"硫酸铁", en:"Iron(III) sulfate"} }],
  "CuSO4":  [{ smiles: salt(I.Cu2,1,I.SO4,1), name:{cn:"硫酸铜", en:"Copper(II) sulfate"} }],
  "CuSO4.5H2O": [{ smiles: salt(I.Cu2,1,I.SO4,1), name:{cn:"五水硫酸铜（胆矾）", en:"Copper(II) sulfate pentahydrate", note:"晶格含 5 个结晶水"} }],
  "MnSO4":  [{ smiles: salt(I.Mn,1,I.SO4,1), name:{cn:"硫酸锰(II)", en:"Manganese(II) sulfate"} }],
  "NiSO4":  [{ smiles: salt(I.Ni,1,I.SO4,1), name:{cn:"硫酸镍(II)", en:"Nickel(II) sulfate"} }],
  "CoSO4":  [{ smiles: salt(I.Co,1,I.SO4,1), name:{cn:"硫酸钴(II)", en:"Cobalt(II) sulfate"} }],
  "Al2(SO4)3": [{ smiles: salt(I.Al,2,I.SO4,3), name:{cn:"硫酸铝", en:"Aluminum sulfate"} }],
  "Cr2(SO4)3": [{ smiles: salt(I.Cr,2,I.SO4,3), name:{cn:"硫酸铬(III)", en:"Chromium(III) sulfate"} }],
  "(NH4)2SO4": [{ smiles: salt(I.NH4,2,I.SO4,1), name:{cn:"硫酸铵", en:"Ammonium sulfate"} }],
  "KAl(SO4)2": [{ smiles:"[K+].[Al+3].[O-]S(=O)(=O)[O-].[O-]S(=O)(=O)[O-]", name:{cn:"硫酸铝钾（明矾）", en:"Potassium alum"} }],
  // 碳酸盐
  "Na2CO3": [{ smiles: salt(I.Na,2,I.CO3,1), name:{cn:"碳酸钠", en:"Sodium carbonate"} }],
  "K2CO3":  [{ smiles: salt(I.K,2,I.CO3,1), name:{cn:"碳酸钾", en:"Potassium carbonate"} }],
  "CaCO3":  [{ smiles: salt(I.Ca,1,I.CO3,1), name:{cn:"碳酸钙", en:"Calcium carbonate"} }],
  "BaCO3":  [{ smiles: salt(I.Ba,1,I.CO3,1), name:{cn:"碳酸钡", en:"Barium carbonate"} }],
  "Ag2CO3": [{ smiles: salt(I.Ag,2,I.CO3,1), name:{cn:"碳酸银", en:"Silver carbonate"} }],
  "(NH4)2CO3": [{ smiles: salt(I.NH4,2,I.CO3,1), name:{cn:"碳酸铵", en:"Ammonium carbonate"} }],
  "NaHCO3": [{ smiles: salt(I.Na,1,I.HCO3,1), name:{cn:"碳酸氢钠（小苏打）", en:"Sodium bicarbonate"} }],
  "NH4HCO3":[{ smiles: salt(I.NH4,1,I.HCO3,1), name:{cn:"碳酸氢铵", en:"Ammonium bicarbonate"} }],
  // 硝酸盐
  "NaNO3":  [{ smiles: salt(I.Na,1,I.NO3,1), name:{cn:"硝酸钠", en:"Sodium nitrate"} }],
  "KNO3":   [{ smiles: salt(I.K,1,I.NO3,1), name:{cn:"硝酸钾", en:"Potassium nitrate"} }],
  "AgNO3":  [{ smiles: salt(I.Ag,1,I.NO3,1), name:{cn:"硝酸银", en:"Silver nitrate"} }],
  "NH4NO3": [{ smiles: salt(I.NH4,1,I.NO3,1), name:{cn:"硝酸铵", en:"Ammonium nitrate"} }],
  "Ca(NO3)2": [{ smiles: salt(I.Ca,1,I.NO3,2), name:{cn:"硝酸钙", en:"Calcium nitrate"} }],
  "Mg(NO3)2": [{ smiles: salt(I.Mg,1,I.NO3,2), name:{cn:"硝酸镁", en:"Magnesium nitrate"} }],
  "Pb(NO3)2": [{ smiles: salt(I.Pb,1,I.NO3,2), name:{cn:"硝酸铅", en:"Lead(II) nitrate"} }],
  "Cu(NO3)2": [{ smiles: salt(I.Cu2,1,I.NO3,2), name:{cn:"硝酸铜", en:"Copper(II) nitrate"} }],
  // 磷酸盐
  "Na3PO4": [{ smiles: salt(I.Na,3,I.PO4,1), name:{cn:"磷酸钠", en:"Sodium phosphate"} }],
  "K3PO4":  [{ smiles: salt(I.K,3,I.PO4,1), name:{cn:"磷酸钾", en:"Potassium phosphate"} }],
  "Ag3PO4": [{ smiles: salt(I.Ag,3,I.PO4,1), name:{cn:"磷酸银", en:"Silver phosphate"} }],
  "(NH4)3PO4": [{ smiles: salt(I.NH4,3,I.PO4,1), name:{cn:"磷酸铵", en:"Ammonium phosphate"} }],
  "Ca3(PO4)2": [{ smiles: salt(I.Ca,3,I.PO4,2), name:{cn:"磷酸钙", en:"Calcium phosphate"} }],
  "Mg3(PO4)2": [{ smiles: salt(I.Mg,3,I.PO4,2), name:{cn:"磷酸镁", en:"Magnesium phosphate"} }],
  "Na2HPO4": [{ smiles: salt(I.Na,2,I.HPO4,1), name:{cn:"磷酸氢二钠", en:"Disodium hydrogen phosphate"} }],
  "NaH2PO4": [{ smiles: salt(I.Na,1,I.H2PO4,1), name:{cn:"磷酸二氢钠", en:"Sodium dihydrogen phosphate"} }],
  // 亚硫酸盐 / 硫代硫酸盐 / 硫化物
  "Na2SO3": [{ smiles: salt(I.Na,2,I.SO3,1), name:{cn:"亚硫酸钠", en:"Sodium sulfite"} }],
  "Na2S2O3":[{ smiles: salt(I.Na,2,I.S2O3,1), name:{cn:"硫代硫酸钠", en:"Sodium thiosulfate"} }],
  "Na2S":  [{ smiles: salt(I.Na,2,I.S2i,1), name:{cn:"硫化钠", en:"Sodium sulfide"} }],
  "Ag2S":  [{ smiles: salt(I.Ag,2,I.S2i,1), name:{cn:"硫化银", en:"Silver sulfide"} }],
  "CuS":   [{ smiles: salt(I.Cu2,1,I.S2i,1), name:{cn:"硫化铜", en:"Copper(II) sulfide"} }],
  "Cu2S":  [{ smiles: salt(I.Cu1,2,I.S2i,1), name:{cn:"硫化亚铜", en:"Copper(I) sulfide"} }],
  "ZnS":   [{ smiles: salt(I.Zn,1,I.S2i,1), name:{cn:"硫化锌", en:"Zinc sulfide"} }],
  "HgS":   [{ smiles: salt(I.Hg2,1,I.S2i,1), name:{cn:"硫化汞（朱砂）", en:"Mercury(II) sulfide"} }],
  "MnS":   [{ smiles: salt(I.Mn,1,I.S2i,1), name:{cn:"硫化锰(II)", en:"Manganese(II) sulfide"} }],
  "NiS":   [{ smiles: salt(I.Ni,1,I.S2i,1), name:{cn:"硫化镍(II)", en:"Nickel(II) sulfide"} }],
  "CoS":   [{ smiles: salt(I.Co,1,I.S2i,1), name:{cn:"硫化钴(II)", en:"Cobalt(II) sulfide"} }],
  // 氯酸盐 / 高氯酸盐 / 次氯酸盐 / 高锰酸盐 / 重铬酸盐
  "KClO3": [{ smiles: salt(I.K,1,I.ClO3,1), name:{cn:"氯酸钾", en:"Potassium chlorate"} }],
  "KClO4": [{ smiles: salt(I.K,1,I.ClO4,1), name:{cn:"高氯酸钾", en:"Potassium perchlorate"} }],
  "NaClO": [{ smiles: salt(I.Na,1,I.ClO,1), name:{cn:"次氯酸钠", en:"Sodium hypochlorite"} }],
  "Ca(ClO)2": [{ smiles: salt(I.Ca,1,I.ClO,2), name:{cn:"次氯酸钙", en:"Calcium hypochlorite"} }],
  "KMnO4": [{ smiles: salt(I.K,1,I.MnO4,1), name:{cn:"高锰酸钾", en:"Potassium permanganate"} }],
  "K2Cr2O7":[{ smiles: salt(I.K,2,I.Cr2O7,1), name:{cn:"重铬酸钾", en:"Potassium dichromate"} }],
  // 醋酸铅
  "Pb(Ac)2": [{ smiles: salt(I.Pb,1,I.Ac,2), name:{cn:"醋酸铅（乙酸铅）", en:"Lead(II) acetate"} }],

  // ── 其它（偏铝酸盐 / 配合物）──
  "NaAlO2": [{ smiles: salt(I.Na,1,I.AlO2,1), name:{cn:"偏铝酸钠", en:"Sodium aluminate"} }],
  "K3[Fe(CN)6]": [{ smiles: salt(I.K,3,"[Fe+3]([C-]#N)([C-]#N)([C-]#N)([C-]#N)([C-]#N)[C-]#N",1), name:{cn:"铁氰化钾（赤血盐）", en:"Potassium ferricyanide"} }],
  "K4[Fe(CN)6]": [{ smiles: salt(I.K,4,"[Fe+2]([C-]#N)([C-]#N)([C-]#N)([C-]#N)([C-]#N)[C-]#N",1), name:{cn:"亚铁氰化钾（黄血盐）", en:"Potassium ferrocyanide"} }],
  "Fe(SCN)3": [{ smiles: salt(I.Fe3,1,"[S-]C#N",3), name:{cn:"硫氰化铁（血红色）", en:"Iron(III) thiocyanate"} }],

  // ── 有机物（KNOWNS 收录）──
  "CH4":      [{ smiles:"C", name:{cn:"甲烷", en:"Methane"} }],
  "C2H6":     [{ smiles:"CC", name:{cn:"乙烷", en:"Ethane"} }],
  "C2H4":     [{ smiles:"C=C", name:{cn:"乙烯", en:"Ethene"} }],
  "C2H2":     [{ smiles:"C#C", name:{cn:"乙炔", en:"Ethyne"} }],
  "C6H6":     [{ smiles:"c1ccccc1", name:{cn:"苯（六元环）", en:"Benzene (six-membered ring)"} }],
  "C7H8":     [{ smiles:"Cc1ccccc1", name:{cn:"甲苯", en:"Toluene"} }],
  "CH3OH":    [{ smiles:"CO", name:{cn:"甲醇", en:"Methanol"} }],
  "CH5N":     [{ smiles:"CN", name:{cn:"甲胺", en:"Methylamine"} }],
  "C2H5OH":   [{ smiles:"CCO", name:{cn:"乙醇", en:"Ethanol"} }],
  "CH3COOH":  [{ smiles:"CC(=O)O", name:{cn:"乙酸（醋酸）", en:"Acetic acid"} }],
  "C12H22O11":[{ smiles:"OCC1OC(OC2(CO)OC(CO)C(O)C2O)C(O)C(O)C1O", name:{cn:"蔗糖（双糖，示意）", en:"Sucrose (disaccharide, schematic)"} }],
};

// ─────────────────────────────────────────────────────────────────────────────
// ISOMER_STRUCTURES：键 = 分子式（如 C2H6O）；值 = 全部常见异构体。
// 用户在判定输入框输入分子式时，所有异构体全部画出。
// ─────────────────────────────────────────────────────────────────────────────
export const ISOMER_STRUCTURES = {
  "C2H6O": [
    { smiles:"CCO", name:{cn:"乙醇", en:"Ethanol"} },
    { smiles:"COC", name:{cn:"二甲醚", en:"Dimethyl ether"} },
  ],
  "C2H6S": [
    { smiles:"CCS", name:{cn:"乙硫醇", en:"Ethanethiol"} },
    { smiles:"CSC", name:{cn:"二甲硫醚", en:"Dimethyl sulfide"} },
  ],
  "C2H4O": [
    { smiles:"CC=O", name:{cn:"乙醛", en:"Acetaldehyde"} },
    { smiles:"C1CO1", name:{cn:"环氧乙烷", en:"Ethylene oxide"} },
  ],
  "C2H4O2": [
    { smiles:"CC(=O)O", name:{cn:"乙酸", en:"Acetic acid"} },
    { smiles:"COC=O", name:{cn:"甲酸甲酯", en:"Methyl formate"} },
  ],
  "C3H8O": [
    { smiles:"CCCO", name:{cn:"1-丙醇", en:"1-Propanol"} },
    { smiles:"CC(C)O", name:{cn:"2-丙醇（异丙醇）", en:"2-Propanol"} },
    { smiles:"CCOC", name:{cn:"甲乙醚", en:"Ethyl methyl ether"} },
  ],
  "C3H6O": [
    { smiles:"CC(=O)C", name:{cn:"丙酮", en:"Acetone"} },
    { smiles:"CCC=O", name:{cn:"丙醛", en:"Propanal"} },
    { smiles:"C=CCO", name:{cn:"烯丙醇", en:"Allyl alcohol"} },
  ],
  "C3H6O2": [
    { smiles:"CCC(=O)O", name:{cn:"丙酸", en:"Propanoic acid"} },
    { smiles:"CCOC=O", name:{cn:"甲酸乙酯", en:"Ethyl formate"} },
    { smiles:"CC(=O)OC", name:{cn:"乙酸甲酯", en:"Methyl acetate"} },
    { smiles:"CC(O)C(=O)O", name:{cn:"乳酸（2-羟基丙酸）", en:"Lactic acid"} },
  ],
  "C3H7NO": [
    { smiles:"CN(C)C=O", name:{cn:"二甲基甲酰胺（DMF）", en:"Dimethylformamide"} },
    { smiles:"CC(=O)N", name:{cn:"乙酰胺", en:"Acetamide"} },
  ],
  "C4H10": [
    { smiles:"CCCC", name:{cn:"正丁烷", en:"n-Butane"} },
    { smiles:"CC(C)C", name:{cn:"异丁烷", en:"Isobutane"} },
  ],
  "C4H10O": [
    { smiles:"CCCCO", name:{cn:"1-丁醇", en:"1-Butanol"} },
    { smiles:"CCC(C)O", name:{cn:"2-丁醇", en:"2-Butanol"} },
    { smiles:"CC(C)CO", name:{cn:"异丁醇", en:"Isobutanol"} },
    { smiles:"CC(C)(C)O", name:{cn:"叔丁醇", en:"tert-Butanol"} },
    { smiles:"CCOCC", name:{cn:"乙醚", en:"Diethyl ether"} },
    { smiles:"CCCOC", name:{cn:"甲基正丙基醚", en:"Methyl propyl ether"} },
    { smiles:"CC(C)OC", name:{cn:"甲基异丙基醚", en:"Methyl isopropyl ether"} },
  ],
  "C4H8": [
    { smiles:"C=CCC", name:{cn:"1-丁烯", en:"1-Butene"} },
    { smiles:"CC=CC", name:{cn:"2-丁烯", en:"2-Butene"} },
    { smiles:"CC(C)=C", name:{cn:"异丁烯", en:"Isobutene"} },
    { smiles:"C1CCC1", name:{cn:"环丁烷", en:"Cyclobutane"} },
  ],
  "C4H8O": [
    { smiles:"CCCC=O", name:{cn:"丁醛", en:"Butanal"} },
    { smiles:"CCC(=O)C", name:{cn:"丁酮（甲乙酮）", en:"Butanone"} },
    { smiles:"C1CCCO1", name:{cn:"四氢呋喃", en:"Tetrahydrofuran"} },
    { smiles:"C=CCOC", name:{cn:"烯丙基甲醚", en:"Allyl methyl ether"} },
  ],
  "C5H12": [
    { smiles:"CCCCC", name:{cn:"正戊烷", en:"n-Pentane"} },
    { smiles:"CC(C)CC", name:{cn:"异戊烷", en:"Isopentane"} },
    { smiles:"CC(C)(C)C", name:{cn:"新戊烷", en:"Neopentane"} },
  ],
  "C5H12O": [
    { smiles:"CCCCCO", name:{cn:"1-戊醇", en:"1-Pentanol"} },
    { smiles:"CCCCC(C)O", name:{cn:"2-戊醇", en:"2-Pentanol"} },
    { smiles:"CCCOCC", name:{cn:"乙基丙基醚", en:"Ethyl propyl ether"} },
    { smiles:"CC(C)OC(C)C", name:{cn:"二异丙醚", en:"Diisopropyl ether"} },
  ],
  "C6H12": [
    { smiles:"C1CCCCC1", name:{cn:"环己烷", en:"Cyclohexane"} },
    { smiles:"C=CCCCC", name:{cn:"1-己烯", en:"1-Hexene"} },
    { smiles:"CC1CCCCC1", name:{cn:"甲基环戊烷", en:"Methylcyclopentane"} },
  ],
  "C6H14": [
    { smiles:"CCCCCC", name:{cn:"正己烷", en:"n-Hexane"} },
    { smiles:"CC(C)CCC", name:{cn:"2-甲基戊烷", en:"2-Methylpentane"} },
    { smiles:"CCC(C)CC", name:{cn:"3-甲基戊烷", en:"3-Methylpentane"} },
    { smiles:"CC(C)(C)CC", name:{cn:"2,2-二甲基丁烷", en:"2,2-Dimethylbutane"} },
    { smiles:"CC(C)C(C)C", name:{cn:"2,3-二甲基丁烷", en:"2,3-Dimethylbutane"} },
  ],
  "C2H5N": [
    { smiles:"CCN", name:{cn:"乙胺", en:"Ethylamine"} },
    { smiles:"CNC", name:{cn:"二甲胺", en:"Dimethylamine"} },
  ],
};

// 分子式（元素计数 → C2H6O 形式，元素按符号排序）
export function molecularFormula(parsed){
  const els = parsed.elements;
  return Object.keys(els).sort().map(k=>k+(els[k]>1?els[k]:"")).join("");
}

// 是否为"纯离子"SMILES（多个离子片段，离子间无共价键，如 [Na+].[Cl-]、[Ag+].[OH-]）
// 判定：剥离方括号内容后，仅剩 "." 分隔符而无任何共价连接符（-/=/#/环/括号）
export function isIonicFormula(smiles){
  const stripped = smiles.replace(/\[[^\]]*\]/g, "");
  return smiles.includes(".") && !/[-=#/\\()[0-9]/.test(stripped);
}

// 查询某化学式的结构式集合
// formula: 规范化化学式（如 "CuSO4"、"Ca(OH)2"、"C2H6O"）
// 返回 { key, structures:[{smiles,name,note?,ionic}], isomers:boolean } 或 null
export function lookupStructures(formula){
  const enrich = arr => arr.map(s=>({ ...s, ionic:isIonicFormula(s.smiles) }));
  const direct = FORMULA_STRUCTURES[formula];
  if (direct) return { key:formula, structures:enrich(direct), isomers:false };
  const parsed = parseFormula(formula);
  if (parsed.ok){
    const molF = molecularFormula(parsed);
    // 同分异构体优先（输入分子式 → 列出全部异构体）
    const iso = ISOMER_STRUCTURES[molF];
    if (iso) return { key:molF, structures:enrich(iso), isomers:true };
    // 水合物：回退主成分结构
    if (parsed.parts && parsed.parts.length>1){
      const main = parsed.parts[0];
      const mainS = FORMULA_STRUCTURES[main];
      if (mainS) return { key:main, structures:enrich(mainS), isomers:false };
    }
  }
  return null;
}
