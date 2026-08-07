// chem-engine.js
// 化学式解析 + 存在性判定 + 注意事项 引擎（纯逻辑，浏览器与 Worker 共用）
// 设计目标：
//   1) 解析任意化学式（支持嵌套括号、水合点 ·、电荷 + / -、方括号配合物）
//   2) 校验语法与元素符号（118 种元素）
//   3) 基于价键/氧化态规则 + 知识库，快速判定物质是否“可能存在/有条件存在/不可能存在”
//   4) 给出中文注意事项（不稳定、易氧化、剧毒、腐蚀、爆炸等）
// 注意：覆盖“所有化学式”无法靠穷举，本引擎采用【知识库 + 规则回退】双轨策略。

// ---------------------------------------------------------------------------
// 周期表（符号 -> 名称/序号/常见氧化态）
// commonOS：该元素常见的氧化态集合（用于规则回退判定）
// fixedOS：在一般化合物中几乎固定的氧化态（用于价键平衡）
// ---------------------------------------------------------------------------
export const ELEMENTS = {
  H:{n:1,zh:"氢",en:"Hydrogen",commonOS:[-1,0,1],fixedOS:1,metal:false},
  He:{n:2,zh:"氦",en:"Helium",commonOS:[0],fixedOS:0,metal:false},
  Li:{n:3,zh:"锂",en:"Lithium",commonOS:[1],fixedOS:1,metal:true},
  Be:{n:4,zh:"铍",en:"Beryllium",commonOS:[2],fixedOS:2,metal:true},
  B:{n:5,zh:"硼",en:"Boron",commonOS:[3],fixedOS:3,metal:false},
  C:{n:6,zh:"碳",en:"Carbon",commonOS:[-4,-2,-1,0,2,4],fixedOS:null,metal:false},
  N:{n:7,zh:"氮",en:"Nitrogen",commonOS:[-3,-2,-1,0,1,2,3,4,5],fixedOS:null,metal:false},
  O:{n:8,zh:"氧",en:"Oxygen",commonOS:[-2,-1,0,1,2],fixedOS:-2,metal:false},
  F:{n:9,zh:"氟",en:"Fluorine",commonOS:[-1],fixedOS:-1,metal:false},
  Ne:{n:10,zh:"氖",en:"Neon",commonOS:[0],fixedOS:0,metal:false},
  Na:{n:11,zh:"钠",en:"Sodium",commonOS:[1],fixedOS:1,metal:true},
  Mg:{n:12,zh:"镁",en:"Magnesium",commonOS:[2],fixedOS:2,metal:true},
  Al:{n:13,zh:"铝",en:"Aluminium",commonOS:[3],fixedOS:3,metal:true},
  Si:{n:14,zh:"硅",en:"Silicon",commonOS:[-4,2,4],fixedOS:4,metal:false},
  P:{n:15,zh:"磷",en:"Phosphorus",commonOS:[-3,0,3,5],fixedOS:null,metal:false},
  S:{n:16,zh:"硫",en:"Sulfur",commonOS:[-2,0,2,4,6],fixedOS:null,metal:false},
  Cl:{n:17,zh:"氯",en:"Chlorine",commonOS:[-1,0,1,3,4,5,7],fixedOS:null,metal:false},
  Ar:{n:18,zh:"氩",en:"Argon",commonOS:[0],fixedOS:0,metal:false},
  K:{n:19,zh:"钾",en:"Potassium",commonOS:[1],fixedOS:1,metal:true},
  Ca:{n:20,zh:"钙",en:"Calcium",commonOS:[2],fixedOS:2,metal:true},
  Sc:{n:21,zh:"钪",en:"Scandium",commonOS:[3],fixedOS:3,metal:true},
  Ti:{n:22,zh:"钛",en:"Titanium",commonOS:[2,3,4],fixedOS:null,metal:true},
  V:{n:23,zh:"钒",en:"Vanadium",commonOS:[2,3,4,5],fixedOS:null,metal:true},
  Cr:{n:24,zh:"铬",en:"Chromium",commonOS:[2,3,6],fixedOS:null,metal:true},
  Mn:{n:25,zh:"锰",en:"Manganese",commonOS:[2,3,4,6,7],fixedOS:null,metal:true},
  Fe:{n:26,zh:"铁",en:"Iron",commonOS:[2,3,6],fixedOS:null,metal:true},
  Co:{n:27,zh:"钴",en:"Cobalt",commonOS:[2,3],fixedOS:null,metal:true},
  Ni:{n:28,zh:"镍",en:"Nickel",commonOS:[2,3],fixedOS:null,metal:true},
  Cu:{n:29,zh:"铜",en:"Copper",commonOS:[1,2],fixedOS:null,metal:true},
  Zn:{n:30,zh:"锌",en:"Zinc",commonOS:[2],fixedOS:2,metal:true},
  Ga:{n:31,zh:"镓",en:"Gallium",commonOS:[3],fixedOS:3,metal:true},
  Ge:{n:32,zh:"锗",en:"Germanium",commonOS:[4],fixedOS:4,metal:false},
  As:{n:33,zh:"砷",en:"Arsenic",commonOS:[-3,3,5],fixedOS:null,metal:false},
  Se:{n:34,zh:"硒",en:"Selenium",commonOS:[-2,4,6],fixedOS:null,metal:false},
  Br:{n:35,zh:"溴",en:"Bromine",commonOS:[-1,1,3,5,7],fixedOS:null,metal:false},
  Kr:{n:36,zh:"氪",en:"Krypton",commonOS:[0,2],fixedOS:0,metal:false},
  Rb:{n:37,zh:"铷",en:"Rubidium",commonOS:[1],fixedOS:1,metal:true},
  Sr:{n:38,zh:"锶",en:"Strontium",commonOS:[2],fixedOS:2,metal:true},
  Y:{n:39,zh:"钇",en:"Yttrium",commonOS:[3],fixedOS:3,metal:true},
  Zr:{n:40,zh:"锆",en:"Zirconium",commonOS:[4],fixedOS:4,metal:true},
  Nb:{n:41,zh:"铌",en:"Niobium",commonOS:[5],fixedOS:5,metal:true},
  Mo:{n:42,zh:"钼",en:"Molybdenum",commonOS:[4,5,6],fixedOS:null,metal:true},
  Tc:{n:43,zh:"锝",en:"Technetium",commonOS:[4,7],fixedOS:null,metal:true},
  Ru:{n:44,zh:"钌",en:"Ruthenium",commonOS:[3,4,8],fixedOS:null,metal:true},
  Rh:{n:45,zh:"铑",en:"Rhodium",commonOS:[3],fixedOS:3,metal:true},
  Pd:{n:46,zh:"钯",en:"Palladium",commonOS:[2,4],fixedOS:null,metal:true},
  Ag:{n:47,zh:"银",en:"Silver",commonOS:[1,2,3],fixedOS:null,metal:true},
  Cd:{n:48,zh:"镉",en:"Cadmium",commonOS:[2],fixedOS:2,metal:true},
  In:{n:49,zh:"铟",en:"Indium",commonOS:[3],fixedOS:3,metal:true},
  Sn:{n:50,zh:"锡",en:"Tin",commonOS:[2,4],fixedOS:null,metal:true},
  Sb:{n:51,zh:"锑",en:"Antimony",commonOS:[-3,3,5],fixedOS:null,metal:false},
  Te:{n:52,zh:"碲",en:"Tellurium",commonOS:[-2,4,6],fixedOS:null,metal:false},
  I:{n:53,zh:"碘",en:"Iodine",commonOS:[-1,1,3,5,7],fixedOS:null,metal:false},
  Xe:{n:54,zh:"氙",en:"Xenon",commonOS:[0,2,4,6,8],fixedOS:0,metal:false},
  Cs:{n:55,zh:"铯",en:"Caesium",commonOS:[1],fixedOS:1,metal:true},
  Ba:{n:56,zh:"钡",en:"Barium",commonOS:[2],fixedOS:2,metal:true},
  La:{n:57,zh:"镧",en:"Lanthanum",commonOS:[3],fixedOS:3,metal:true},
  Ce:{n:58,zh:"铈",en:"Cerium",commonOS:[3,4],fixedOS:null,metal:true},
  Pr:{n:59,zh:"镨",en:"Praseodymium",commonOS:[3,4],fixedOS:null,metal:true},
  Nd:{n:60,zh:"钕",en:"Neodymium",commonOS:[3],fixedOS:3,metal:true},
  Pm:{n:61,zh:"钷",en:"Promethium",commonOS:[3],fixedOS:3,metal:true},
  Sm:{n:62,zh:"钐",en:"Samarium",commonOS:[3],fixedOS:3,metal:true},
  Eu:{n:63,zh:"铕",en:"Europium",commonOS:[2,3],fixedOS:null,metal:true},
  Gd:{n:64,zh:"钆",en:"Gadolinium",commonOS:[3],fixedOS:3,metal:true},
  Tb:{n:65,zh:"铽",en:"Terbium",commonOS:[3,4],fixedOS:null,metal:true},
  Dy:{n:66,zh:"镝",en:"Dysprosium",commonOS:[3],fixedOS:3,metal:true},
  Ho:{n:67,zh:"钬",en:"Holmium",commonOS:[3],fixedOS:3,metal:true},
  Er:{n:68,zh:"铒",en:"Erbium",commonOS:[3],fixedOS:3,metal:true},
  Tm:{n:69,zh:"铥",en:"Thulium",commonOS:[3],fixedOS:3,metal:true},
  Yb:{n:70,zh:"镱",en:"Ytterbium",commonOS:[2,3],fixedOS:null,metal:true},
  Lu:{n:71,zh:"镥",en:"Lutetium",commonOS:[3],fixedOS:3,metal:true},
  Hf:{n:72,zh:"铪",en:"Hafnium",commonOS:[4],fixedOS:4,metal:true},
  Ta:{n:73,zh:"钽",en:"Tantalum",commonOS:[5],fixedOS:5,metal:true},
  W:{n:74,zh:"钨",en:"Tungsten",commonOS:[4,5,6],fixedOS:null,metal:true},
  Re:{n:75,zh:"铼",en:"Rhenium",commonOS:[4,6,7],fixedOS:null,metal:true},
  Os:{n:76,zh:"锇",en:"Osmium",commonOS:[4,6,8],fixedOS:null,metal:true},
  Ir:{n:77,zh:"铱",en:"Iridium",commonOS:[3,4],fixedOS:null,metal:true},
  Pt:{n:78,zh:"铂",en:"Platinum",commonOS:[2,4],fixedOS:null,metal:true},
  Au:{n:79,zh:"金",en:"Gold",commonOS:[1,3],fixedOS:null,metal:true},
  Hg:{n:80,zh:"汞",en:"Mercury",commonOS:[1,2],fixedOS:null,metal:true},
  Tl:{n:81,zh:"铊",en:"Thallium",commonOS:[1,3],fixedOS:null,metal:true},
  Pb:{n:82,zh:"铅",en:"Lead",commonOS:[2,4],fixedOS:null,metal:true},
  Bi:{n:83,zh:"铋",en:"Bismuth",commonOS:[3,5],fixedOS:null,metal:true},
  Po:{n:84,zh:"钋",en:"Polonium",commonOS:[2,4,6],fixedOS:null,metal:true},
  At:{n:85,zh:"砹",en:"Astatine",commonOS:[-1,1,3,5,7],fixedOS:null,metal:false},
  Rn:{n:86,zh:"氡",en:"Radon",commonOS:[0,2],fixedOS:0,metal:false},
  Fr:{n:87,zh:"钫",en:"Francium",commonOS:[1],fixedOS:1,metal:true},
  Ra:{n:88,zh:"镭",en:"Radium",commonOS:[2],fixedOS:2,metal:true},
  Ac:{n:89,zh:"锕",en:"Actinium",commonOS:[3],fixedOS:3,metal:true},
  Th:{n:90,zh:"钍",en:"Thorium",commonOS:[4],fixedOS:4,metal:true},
  Pa:{n:91,zh:"镤",en:"Protactinium",commonOS:[4,5],fixedOS:null,metal:true},
  U:{n:92,zh:"铀",en:"Uranium",commonOS:[3,4,5,6],fixedOS:null,metal:true},
  Np:{n:93,zh:"镎",en:"Neptunium",commonOS:[4,5,6,7],fixedOS:null,metal:true},
  Pu:{n:94,zh:"钚",en:"Plutonium",commonOS:[3,4,5,6,7],fixedOS:null,metal:true},
  Am:{n:95,zh:"镅",en:"Americium",commonOS:[3,4,5,6],fixedOS:null,metal:true},
  Cm:{n:96,zh:"锔",en:"Curium",commonOS:[3],fixedOS:3,metal:true},
  Bk:{n:97,zh:"锫",en:"Berkelium",commonOS:[3,4],fixedOS:null,metal:true},
  Cf:{n:98,zh:"锎",en:"Californium",commonOS:[3],fixedOS:3,metal:true},
  Es:{n:99,zh:"锿",en:"Einsteinium",commonOS:[3],fixedOS:3,metal:true},
  Fm:{n:100,zh:"镄",en:"Fermium",commonOS:[3],fixedOS:3,metal:true},
  Md:{n:101,zh:"钔",en:"Mendelevium",commonOS:[3],fixedOS:3,metal:true},
  No:{n:102,zh:"锘",en:"Nobelium",commonOS:[2,3],fixedOS:null,metal:true},
  Lr:{n:103,zh:"铹",en:"Lawrencium",commonOS:[3],fixedOS:3,metal:true},
  Rf:{n:104,zh:"𬬻",en:"Rutherfordium",commonOS:[4],fixedOS:4,metal:true},
  Db:{n:105,zh:"𬭊",en:"Dubnium",commonOS:[5],fixedOS:5,metal:true},
  Sg:{n:106,zh:"𬭳",en:"Seaborgium",commonOS:[6],fixedOS:6,metal:true},
  Bh:{n:107,zh:"𬭛",en:"Bohrium",commonOS:[7],fixedOS:7,metal:true},
  Hs:{n:108,zh:"𬭶",en:"Hassium",commonOS:[8],fixedOS:8,metal:true},
  Mt:{n:109,zh:"鿏",en:"Meitnerium",commonOS:[9],fixedOS:9,metal:true},
  Ds:{n:110,zh:"𫟼",en:"Darmstadtium",commonOS:[8],fixedOS:8,metal:true},
  Rg:{n:111,zh:"𬬭",en:"Roentgenium",commonOS:[9],fixedOS:9,metal:true},
  Cn:{n:112,zh:"鿔",en:"Copernicium",commonOS:[2],fixedOS:2,metal:true},
  Nh:{n:113,zh:"鿭",en:"Nihonium",commonOS:[3],fixedOS:3,metal:true},
  Fl:{n:114,zh:"𫓧",en:"Flerovium",commonOS:[2],fixedOS:2,metal:true},
  Mc:{n:115,zh:"镆",en:"Moscovium",commonOS:[3],fixedOS:3,metal:true},
  Lv:{n:116,zh:"𫟷",en:"Livermorium",commonOS:[2],fixedOS:2,metal:true},
  Ts:{n:117,zh:"鿬",en:"Tennessine",commonOS:[-1],fixedOS:-1,metal:false},
  Og:{n:118,zh:"鿫",en:"Oganesson",commonOS:[0,2],fixedOS:0,metal:false}
};

// ---------------------------------------------------------------------------
// 知识库：特殊/重要的物质（存在性判定优先查这里）
// verdict: "yes" 稳定存在 | "conditional" 仅特定条件/亚稳/瞬态存在
//          | "unstable" 可生成但极易分解 | "no" 实际不存在/不可能
// tags: 用于前端高亮（toxic 剧毒 / corrosive 腐蚀 / explosive 爆炸 / oxidize 易氧化 / unstable 不稳定 ...）
// ---------------------------------------------------------------------------
export const KNOWNS = {
  // —— 用户重点举例：银的氢氧化物 ——
  "AgOH":{verdict:"unstable",name:"氢氧化银",formula:"AgOH",
    note:["氢氧化银在水中几乎不能独立存在：一旦生成（Ag⁺ + OH⁻）立即脱水生成棕黑色的氧化银 Ag₂O（2AgOH → Ag₂O + H₂O）。",
          "只在极低温、极稀溶液中可瞬时存在；在空气中、光照或受热时迅速转化为 Ag₂O，并可能进一步被氧化/分解。",
          "因此通常不说“制得氢氧化银”，而是得到氧化银沉淀。"],
    related:["Ag2O"],tags:["unstable","oxidize"]},

  // —— 其他贵金属氢氧化物 ——
  "AuOH":{verdict:"unstable",name:"氢氧化金(I)",formula:"AuOH",
    note:["金(I)的氢氧化物极不稳定，生成即歧化/脱水为 Au₂O（并析出 Au）。实际以 Au₂O₃·xH₂O（水合氧化金）形式存在。"],
    related:["Au2O3"],tags:["unstable"]},
  "Au(OH)3":{verdict:"conditional",name:"氢氧化金(III)",formula:"Au(OH)3",
    note:["游离的 Au(OH)₃ 并不稳定，实际多以水合氧化物 Au₂O₃·xH₂O 形式存在；是两性偏酸物质，溶于强碱生成金酸盐。"],
    related:["Au2O3"],tags:["unstable"]},

  // —— 过渡金属氢氧化物：空气中易氧化 ——
  "Fe(OH)2":{verdict:"yes",name:"氢氧化亚铁",formula:"Fe(OH)2",
    note:["白色沉淀，极易被空气氧化：先变灰绿色，最终生成红褐色的水合氧化铁 Fe(OH)₃（实际为 Fe₂O₃·xH₂O）。",
          "制取与保存需在隔绝空气（如煮沸除氧的水、惰性气氛）下进行。"],
    related:["Fe(OH)3","FeO","Fe3O4"],tags:["oxidize"]},
  "Fe(OH)3":{verdict:"yes",name:"氢氧化铁",formula:"Fe(OH)3",
    note:["红褐色沉淀，受热或久置脱水生成 Fe₂O₃·xH₂O（铁红）；本身并非严格化学计量物，常以水合氧化铁形式存在。"],
    related:["Fe2O3"],tags:["unstable"]},
  "Cu(OH)2":{verdict:"yes",name:"氢氧化铜",formula:"Cu(OH)2",
    note:["蓝色沉淀；加热或久置分解为黑色 CuO（Cu(OH)₂ → CuO + H₂O）。",
          "溶于氨水形成深蓝色 [Cu(NH₃)₄]²⁺ 配离子；与葡萄糖等还原糖共热生成砖红色 Cu₂O（斐林/班氏试剂原理）。"],
    related:["CuO","Cu2O"],tags:["unstable"]},
  "Mn(OH)2":{verdict:"yes",name:"氢氧化锰(II)",formula:"Mn(OH)2",
    note:["白色沉淀，在空气中迅速被氧化为棕黑色的 MnO(OH)₂ / MnO₂ 水合物。"],
    related:["MnO2"],tags:["oxidize"]},
  "Co(OH)2":{verdict:"yes",name:"氢氧化钴(II)",formula:"Co(OH)2",
    note:["粉红色/蓝色沉淀，在空气中可被氧化为棕褐色的 Co(OH)₃（实际常以 CoO(OH) 形式）。"],
    related:["Co(OH)3"],tags:["oxidize"]},
  "Ni(OH)2":{verdict:"yes",name:"氢氧化镍(II)",formula:"Ni(OH)2",
    note:["苹果绿色沉淀，可被强氧化剂（如 NaClO）氧化为黑色的 NiO(OH)，是镍氢/镍镉电池正极反应。"],
    related:["NiO(OH)"],tags:["oxidize"]},
  "Cr(OH)3":{verdict:"yes",name:"氢氧化铬(III)",formula:"Cr(OH)3",
    note:["灰绿色两性氢氧化物：溶于酸生成 Cr³⁺，溶于强碱生成亮绿色的 [Cr(OH)₄]⁻（亚铬酸盐）。"],
    related:["Cr2O3"],tags:["unstable"]},
  "Hg2(OH)2":{verdict:"no",name:"（亚汞）氢氧化汞(I)",formula:"Hg2(OH)2",
    note:["亚汞离子 Hg₂²⁺ 的氢氧化物并不存在：生成时立即歧化分解为 Hg（液态）与 HgO。",
          "因此 Hg₂²⁺ 盐的溶液加碱得到的是 Hg + HgO 混合物，而非 Hg₂(OH)₂。"],
    related:["HgO","Hg"],tags:["unstable"]},
  "Pb(OH)2":{verdict:"yes",name:"氢氧化铅(II)",formula:"Pb(OH)2",
    note:["白色两性氢氧化物：溶于酸生成 Pb²⁺，溶于强碱生成 [Pb(OH)₃]⁻ / [Pb(OH)₄]²⁻。",
          "铅化合物均有毒，操作需谨慎。"],
    related:["PbO"],tags:["toxic","unstable"]},
  "Zn(OH)2":{verdict:"yes",name:"氢氧化锌",formula:"Zn(OH)2",
    note:["白色两性氢氧化物：溶于酸生成 Zn²⁺，溶于过量强碱生成 [Zn(OH)₄]²⁻（锌酸盐）。"],
    related:["ZnO"],tags:["unstable"]},
  "Al(OH)3":{verdict:"yes",name:"氢氧化铝",formula:"Al(OH)3",
    note:["白色胶状沉淀，典型两性氢氧化物：溶于酸生成 Al³⁺，溶于强碱生成 [Al(OH)₄]⁻（偏铝酸盐）。",
          "不溶于过量氨水（借此可与 Zn²⁺ 等分离）。"],
    related:["Al2O3"],tags:["unstable"]},
  "Sn(OH)2":{verdict:"yes",name:"氢氧化亚锡",formula:"Sn(OH)2",
    note:["白色两性氢氧化物，易被空气氧化；溶于酸生成 Sn²⁺，溶于强碱生成亚锡酸盐。"],
    related:["SnO"],tags:["oxidize","toxic"]},
  "Bi(OH)3":{verdict:"yes",name:"氢氧化铋",formula:"Bi(OH)3",
    note:["白色沉淀，几乎不显两性（Bi³⁺ 碱性较强）；强氧化下可生成铋酸盐，但游离 Bi(OH)₃ 不稳定、易脱水。"],
    related:["Bi2O3"],tags:["unstable","toxic"]},
  "Mg(OH)2":{verdict:"yes",name:"氢氧化镁",formula:"Mg(OH)2",
    note:["白色难溶氢氧化物（镁乳），中强碱；加热分解为 MgO。可溶于铵盐溶液（因 NH₄⁺ 消耗 OH⁻）。"],
    related:["MgO"],tags:["unstable"]},
  "Ca(OH)2":{verdict:"yes",name:"氢氧化钙",formula:"Ca(OH)2",
    note:["熟石灰/消石灰，微溶于水（石灰水）；溶解度随温度升高而下降。强碱，用于建筑、中和酸性土壤。"],
    related:["CaO"],tags:[]},
  "NaOH":{verdict:"yes",name:"氢氧化钠",formula:"NaOH",
    note:["烧碱，强碱，易潮解并吸收 CO₂ 变质为 Na₂CO₃；具强腐蚀性，溶于水剧烈放热。"],
    related:["Na2CO3"],tags:["corrosive"]},
  "KOH":{verdict:"yes",name:"氢氧化钾",formula:"KOH",
    note:["强碱，性质类似 NaOH，易潮解、腐蚀；常用于制钾盐与碱性电池电解液。"],
    related:[],tags:["corrosive"]},
  "NH4OH":{verdict:"conditional",name:"氢氧化铵（氨水）",formula:"NH4OH",
    note:["“氢氧化铵 NH₄OH”是旧写法；实际溶液中并不存在独立的 NH₄OH 分子，而是 NH₃·H₂O（一水合氨）与少量 NH₄⁺、OH⁻ 的平衡体系。",
          "市售“氨水”即 NH₃ 的水溶液。"],
    related:["NH3"],tags:["unstable"]},

  // —— 含氧酸（多数仅存于溶液）——
  "H2CO3":{verdict:"conditional",name:"碳酸",formula:"H2CO3",
    note:["碳酸只能在水中存在，无法分离出纯品：浓度稍高或受热即分解为 CO₂ + H₂O。",
          "其盐（碳酸盐）非常稳定且广泛存在。"],
    related:["CO2","Na2CO3"],tags:["unstable"]},
  "H2SO3":{verdict:"conditional",name:"亚硫酸",formula:"H2SO3",
    note:["仅存在于水溶液，游离态分解为 SO₂ + H₂O；是中等强度酸，有还原性（易被氧化为硫酸）。"],
    related:["SO2","H2SO4"],tags:["unstable","oxidize"]},
  "HClO":{verdict:"conditional",name:"次氯酸",formula:"HClO",
    note:["极不稳定的弱酸，见光迅速分解：2HClO → 2HCl + O₂。其盐（次氯酸盐，如 NaClO）稳定且常用作漂白/消毒。"],
    related:["NaClO"],tags:["unstable"]},
  "HClO2":{verdict:"conditional",name:"亚氯酸",formula:"HClO2",
    note:["不稳定中强酸，易分解；其盐（亚氯酸盐）可作漂白剂。"],
    related:[],tags:["unstable"]},
  "HClO3":{verdict:"yes",name:"氯酸",formula:"HClO3",
    note:["不稳定强酸，浓缩或受热易分解甚至爆炸；其盐（氯酸盐，如 KClO₃）是强氧化剂。"],
    related:["KClO3"],tags:["unstable","explosive"]},
  "HClO4":{verdict:"yes",name:"高氯酸",formula:"HClO4",
    note:["已知最强无机酸之一；稀溶液较稳定，但浓高氯酸是强氧化剂，与有机物接触有爆炸危险。"],
    related:[],tags:["corrosive","explosive"]},
  "H2S2O3":{verdict:"no",name:"硫代硫酸（游离）",formula:"H2S2O3",
    note:["游离的硫代硫酸极不稳定，无法分离；但其钠盐 Na₂S₂O₃（大苏打/海波）非常稳定，用作定影剂、脱氧剂。"],
    related:["Na2S2O3"],tags:["unstable"]},
  "HNO2":{verdict:"conditional",name:"亚硝酸",formula:"HNO2",
    note:["仅存在于冷水溶液，室温即分解：3HNO₂ → HNO₃ + 2NO + H₂O。其盐（亚硝酸盐）稳定但多数有毒、可致癌。"],
    related:["NaNO2"],tags:["unstable","toxic"]},

  // —— 过氧化物 / 超氧化物 ——
  "H2O2":{verdict:"yes",name:"过氧化氢",formula:"H2O2",
    note:["双氧水，较稳定存在于稀溶液；浓溶液或受热、见光、遇金属离子会剧烈分解为 H₂O + O₂，是强氧化剂。",
          "高浓度（>30%）有爆炸与强腐蚀性危险。"],
    related:["H2O"],tags:["oxidize","corrosive","explosive"]},
  "Na2O2":{verdict:"yes",name:"过氧化钠",formula:"Na2O2",
    note:["淡黄色固体，强氧化剂；与水剧烈反应生成 NaOH 并放出 O₂，与 CO₂ 反应生成 Na₂CO₃ 并供氧（潜水/航天用）。"],
    related:["Na2O"],tags:["oxidize","corrosive"]},
  "BaO2":{verdict:"yes",name:"过氧化钡",formula:"BaO2",
    note:["过氧化物，与酸反应放出 H₂O₂； historically 用于制过氧化氢。可溶性钡化合物有毒。"],
    related:["BaO"],tags:["oxidize","toxic"]},
  "KO2":{verdict:"yes",name:"超氧化钾",formula:"KO2",
    note:["橙黄色固体，与 CO₂ 反应放出 O₂（2KO₂ + CO₂ → K₂CO₃ + 1.5O₂），用作密闭空间（矿坑/潜水）供氧剂。"],
    related:[],tags:["oxidize"]},

  // —— 卤素含氧酸盐（强氧化/爆炸）——
  "NaClO":{verdict:"yes",name:"次氯酸钠",formula:"NaClO",
    note:["84 消毒液主要成分（有效氯）；溶液呈碱性、不稳定，与酸性洁厕剂混合会放出剧毒 Cl₂，严禁混用！"],
    related:["HClO"],tags:["oxidize","toxic"]},
  "Ca(ClO)2":{verdict:"yes",name:"次氯酸钙",formula:"Ca(ClO)2",
    note:["漂白粉/漂粉精的有效成分；遇酸或 CO₂ 放出 HClO，具漂白与消毒作用；与有机物混合可爆。"],
    related:[],tags:["oxidize","explosive"]},
  "KClO3":{verdict:"yes",name:"氯酸钾",formula:"KClO3",
    note:["强氧化剂，与硫、碳、磷或有机物混合受摩擦/加热即猛烈爆炸；曾用于火柴与烟火，现多被 KClO₄ 替代。"],
    related:[],tags:["oxidize","explosive"]},
  "KClO4":{verdict:"yes",name:"高氯酸钾",formula:"KClO4",
    note:["强氧化剂，较氯酸盐稳定；用于烟火、火箭推进剂。仍须远离可燃物的还原剂。"],
    related:[],tags:["oxidize","explosive"]},

  // —— 重金属盐：剧毒 ——
  "BaCl2":{verdict:"yes",name:"氯化钡",formula:"BaCl2",
    note:["可溶性钡盐，剧毒！Ba²⁺ 使蛋白质变性；中毒可用硫酸镁/硫酸钠解毒（生成不溶 BaSO₄）。"],
    related:["BaSO4"],tags:["toxic"]},
  "BaSO4":{verdict:"yes",name:"硫酸钡",formula:"BaSO4",
    note:["极难溶、不透过 X 射线，口服“钡餐”用于消化道造影；因不溶故无毒。"],
    related:["BaCl2"],tags:[]},
  "BaCO3":{verdict:"yes",name:"碳酸钡",formula:"BaCO3",
    note:["虽难溶，但溶于胃酸（HCl）释放有毒 Ba²⁺，故不可作“钡餐”；有毒。"],
    related:["BaSO4"],tags:["toxic"]},
  "HgCl2":{verdict:"yes",name:"氯化汞（升汞）",formula:"HgCl2",
    note:["剧毒！蛋白质凝固剂，稀溶液曾作消毒剂；Hg²⁺ 与 SnCl₂ 反应用于检验 Hg²⁺。"],
    related:["Hg2Cl2"],tags:["toxic","corrosive"]},
  "Hg2Cl2":{verdict:"yes",name:"氯化亚汞（甘汞）",formula:"Hg2Cl2",
    note:["白色难溶，曾入药；见光分解为 Hg + HgCl₂（变黑）；遇碱歧化为 Hg + HgO。"],
    related:["HgCl2"],tags:["toxic","unstable"]},
  "As2O3":{verdict:"yes",name:"三氧化二砷（砒霜）",formula:"As2O3",
    note:["剧毒！溶于碱生成亚砷酸盐；是经典毒药，也用于木材防腐与玻璃工业。"],
    related:[],tags:["toxic"]},
  "HgO":{verdict:"yes",name:"氧化汞",formula:"HgO",
    note:["红/黄两种变体，加热分解为 Hg + O₂；剧毒。"],
    related:[],tags:["toxic"]},

  // —— 氮/硫氧化物（毒/腐蚀）——
  "CO":{verdict:"yes",name:"一氧化碳",formula:"CO",
    note:["无色无味剧毒气体，与血红蛋白结合致缺氧；可燃，是煤气/不完全燃烧产物。"],
    related:["CO2"],tags:["toxic","oxidize"]},
  "NO":{verdict:"yes",name:"一氧化氮",formula:"NO",
    note:["无色气体，空气中立即与 O₂ 反应生成红棕色 NO₂；参与光化学烟雾与生物信号传导。"],
    related:["NO2"],tags:["oxidize","toxic"]},
  "NO2":{verdict:"yes",name:"二氧化氮",formula:"NO2",
    note:["红棕色有毒、腐蚀性气体；与 N₂O₄ 共存；溶于水生成 HNO₃ + NO。"],
    related:["N2O4","HNO3"],tags:["toxic","corrosive"]},
  "N2O":{verdict:"yes",name:"一氧化二氮（笑气）",formula:"N2O",
    note:["无色气体，可作麻醉/助推剂；助燃；长期吸入有神经毒性。"],
    related:[],tags:["oxidize","toxic"]},
  "SO2":{verdict:"yes",name:"二氧化硫",formula:"SO2",
    note:["刺激性有毒气体，是酸雨前体；有漂白性（与品红反应）与还原性。"],
    related:["SO3","H2SO3"],tags:["toxic","corrosive"]},
  "SO3":{verdict:"yes",name:"三氧化硫",formula:"SO3",
    note:["强腐蚀性，遇水剧烈生成硫酸并放热；是硫酸工业的关键中间体。"],
    related:["H2SO4"],tags:["corrosive"]},
  "H2S":{verdict:"yes",name:"硫化氢",formula:"H2S",
    note:["剧毒、臭鸡蛋味气体，可燃；与金属离子生成特征色硫化物沉淀，用于定性分析。"],
    related:[],tags:["toxic","oxidize"]},

  // —— 常见酸碱盐（稳定）——
  "H2O":{verdict:"yes",name:"水",formula:"H2O",note:["最普遍的溶剂，中性。"],related:[],tags:[]},
  "H2SO4":{verdict:"yes",name:"硫酸",formula:"H2SO4",
    note:["强酸，浓硫酸具强腐蚀性、脱水性与强氧化性；稀释时务必“酸入水”并搅拌。"],
    related:[],tags:["corrosive"]},
  "HNO3":{verdict:"yes",name:"硝酸",formula:"HNO3",
    note:["强酸、强氧化剂；浓硝酸见光变黄（分解出 NO₂），具强腐蚀性，使皮肤/蛋白质黄染。"],
    related:[],tags:["corrosive","oxidize"]},
  "HCl":{verdict:"yes",name:"氯化氢/盐酸",formula:"HCl",
    note:["气态为氯化氢，水溶液为盐酸（强酸）；浓盐酸易挥发，与 NH₃ 生成白烟 NH₄Cl。"],
    related:["NH4Cl"],tags:["corrosive"]},
  "H3PO4":{verdict:"yes",name:"磷酸",formula:"H3PO4",note:["中强三元酸，无毒，用于肥料与食品添加剂。"],related:[],tags:[]},
  "HF":{verdict:"yes",name:"氢氟酸",formula:"HF",
    note:["剧毒且腐蚀玻璃/硅酸盐；渗入组织破坏钙镁、侵蚀骨骼，灼伤初期不痛但可致命，须专用防护与急救（葡萄糖酸钙）。"],
    related:[],tags:["toxic","corrosive"]},
  "NaCl":{verdict:"yes",name:"氯化钠",formula:"NaCl",note:["食盐主要成分，稳定。"],related:[],tags:[]},
  "Na2CO3":{verdict:"yes",name:"碳酸钠",formula:"Na2CO3",note:["纯碱/苏打，稳定；水溶液呈碱性。"],related:["NaHCO3"],tags:[]},
  "NaHCO3":{verdict:"yes",name:"碳酸氢钠",formula:"NaHCO3",note:["小苏打，受热或遇酸放出 CO₂；可作膨松剂与抗酸剂。"],related:["Na2CO3"],tags:[]},
  "CaCO3":{verdict:"yes",name:"碳酸钙",formula:"CaCO3",note:["石灰石/贝壳/骨骸主要成分；难溶，遇酸放出 CO₂。"],related:[],tags:[]},
  "CaO":{verdict:"yes",name:"氧化钙",formula:"CaO",note:["生石灰，遇水剧烈放热生成 Ca(OH)₂（熟石灰）。"],related:["Ca(OH)2"],tags:["corrosive"]},
  "CuSO4":{verdict:"yes",name:"硫酸铜",formula:"CuSO4",note:["无水物白色，五水合物 CuSO₄·5H₂O 为蓝色胆矾；溶液与过量 NH₃ 生成深蓝配离子。"],related:["CuSO4.5H2O"],tags:["toxic"]},
  "CuSO4.5H2O":{verdict:"yes",name:"五水硫酸铜（胆矾）",formula:"CuSO4.5H2O",
    note:["蓝色晶体，加热逐步失水变为白色无水 CuSO₄；是常见铜盐与杀菌剂（波尔多液组分）。"],
    related:["CuSO4"],tags:["toxic"]},
  "AgNO3":{verdict:"yes",name:"硝酸银",formula:"AgNO3",
    note:["无色晶体，见光分解变黑（生成 Ag）；用于镀银、试剂与“银镜反应”。溶液具氧化性/腐蚀性。"],
    related:[],tags:["corrosive","oxidize"]},
  "AgCl":{verdict:"yes",name:"氯化银",formula:"AgCl",note:["白色凝乳状沉淀，见光变紫黑（分解出 Ag）；不溶于水与稀酸，溶于氨水/硫代硫酸钠。"],related:["AgBr","AgI"],tags:["unstable"]},
  "AgBr":{verdict:"yes",name:"溴化银",formula:"AgBr",note:["淡黄色，感光材料（胶片）主要成分；见光分解。"],related:["AgCl","AgI"],tags:["unstable"]},
  "AgI":{verdict:"yes",name:"碘化银",formula:"AgI",note:["黄色，用于人工降雨（作冰核）与感光。"],related:["AgCl","AgBr"],tags:[]},
  "Ag2O":{verdict:"yes",name:"氧化银",formula:"Ag2O",note:["棕黑色，由 AgOH 脱水或 Ag⁺ 加碱得到；见光分解；用作纽扣电池正极。"],related:["AgOH"],tags:["unstable"]},
  "Ag2CO3":{verdict:"yes",name:"碳酸银",formula:"Ag2CO3",note:["黄色沉淀，见光分解；微溶。"],related:[],tags:["unstable"]},
  "Ag3PO4":{verdict:"yes",name:"磷酸银",formula:"Ag3PO4",note:["黄色沉淀，用于催化与指示。"],related:[],tags:[]},
  "KMnO4":{verdict:"yes",name:"高锰酸钾",formula:"KMnO4",
    note:["紫红色强氧化剂；酸性条件被还原为 Mn²⁺（无色），中性/弱碱为 MnO₂（棕）。具腐蚀性。"],
    related:[],tags:["oxidize","corrosive"]},
  "K2Cr2O7":{verdict:"yes",name:"重铬酸钾",formula:"K2Cr2O7",
    note:["橙红色强氧化剂，实验室基准物质；Cr(VI) 化合物剧毒且有致癌性，废液须专门处理。"],
    related:["Na2Cr2O7"],tags:["oxidize","toxic"]},
  "CrO3":{verdict:"yes",name:"三氧化铬",formula:"CrO3",
    note:["暗红色，强氧化剂，遇有机物可燃烧；Cr(VI) 剧毒致癌。用于镀铬与清洗。"],
    related:[],tags:["oxidize","toxic","corrosive"]},
  "NH4Cl":{verdict:"yes",name:"氯化铵",formula:"NH4Cl",note:["白色盐，受热升华（实为分解再凝华）；用于化肥、焊药、干电池。"],related:[],tags:[]},
  "NH4NO3":{verdict:"yes",name:"硝酸铵",formula:"NH4NO3",
    note:["铵态氮肥；本身是氧化剂与可燃物的混合物，受强热或撞击可发生猛烈爆炸（多起重大事故）。储存须远离火种与还原性杂质。"],
    related:[],tags:["oxidize","explosive"]},
  "(NH4)2CO3":{verdict:"yes",name:"碳酸铵",formula:"(NH4)2CO3",
    note:["不稳定，室温即缓慢分解释放 NH₃ 与 CO₂（“鹿角书橱”气味来源）；用作发酵粉与嗅盐。"],
    related:[],tags:["unstable"]},
  "(NH4)2SO4":{verdict:"yes",name:"硫酸铵",formula:"(NH4)2SO4",note:["常用氮肥；长期施用使土壤酸化。"],related:[],tags:[]},
  "NH4HCO3":{verdict:"yes",name:"碳酸氢铵",formula:"NH4HCO3",note:["碳铵，易分解（NH₃↑+CO₂↑+H₂O）而“跑氨”，须深施覆土；常用化肥。"],related:[],tags:["unstable"]},
  "CaC2":{verdict:"yes",name:"碳化钙（电石）",formula:"CaC2",
    note:["遇水剧烈放出乙炔 C₂H₂（电石灯/气焊原理）；须防水密封保存。"],
    related:["C2H2"],tags:["unstable"]},
  "CaSO4.2H2O":{verdict:"yes",name:"二水硫酸钙（石膏）",formula:"CaSO4.2H2O",
    note:["石膏，加热至约 150℃ 部分脱水为熟石膏 CaSO₄·½H₂O（模型/固定），再高温成硬石膏。"],
    related:[],tags:[]},
  "SiO2":{verdict:"yes",name:"二氧化硅",formula:"SiO2",note:["石英/砂的主要成分；极稳定，是酸性氧化物（与强碱缓慢反应）。"],related:[],tags:[]},
  "FeO":{verdict:"conditional",name:"氧化亚铁",formula:"FeO",
    note:["非整比化合物，常写作 Fe₁₋ₓO；空气中易被氧化为 Fe₃O₄，须隔绝空气制备。"],
    related:["Fe3O4","Fe2O3"],tags:["oxidize","unstable"]},
  "Fe2O3":{verdict:"yes",name:"三氧化二铁",formula:"Fe2O3",note:["铁红/赤铁矿，稳定；用作颜料与催化剂。"],related:[],tags:[]},
  "Fe3O4":{verdict:"yes",name:"四氧化三铁",formula:"Fe3O4",note:["磁铁矿，含铁(II,III)；具磁性，稳定。"],related:[],tags:[]},
  "CuO":{verdict:"yes",name:"氧化铜",formula:"CuO",note:["黑色，稳定；溶于酸生成 Cu²⁺。"],related:[],tags:[]},
  "Cu2O":{verdict:"yes",name:"氧化亚铜",formula:"Cu2O",note:["砖红色，Cu(I) 氧化物；溶于酸发生歧化；用于船底防污漆与红色玻璃。"],related:[],tags:[]},
  "Al2O3":{verdict:"yes",name:"氧化铝",formula:"Al2O3",note:["刚玉/矾土，极稳定、高熔点；天然刚玉（红/蓝宝石）含杂质；用作磨料与载体。"],related:[],tags:[]},

  // —— 有机物（常见）——
  "CH4":{verdict:"yes",name:"甲烷",formula:"CH4",note:["天然气主要成分，易燃，是最简单的有机物。"],related:[],tags:["oxidize"]},
  "C2H6":{verdict:"yes",name:"乙烷",formula:"C2H6",note:["天然气组分，易燃。"],related:[],tags:["oxidize"]},
  "C2H4":{verdict:"yes",name:"乙烯",formula:"C2H4",note:["植物激素/化工原料，可燃，可被 KMnO₄ 氧化使紫红色褪去。"],related:[],tags:["oxidize"]},
  "C2H2":{verdict:"yes",name:"乙炔",formula:"C2H2",note:["电石气，燃烧火焰温度高（氧炔焰）；可燃。"],related:[],tags:["oxidize"]},
  "C6H6":{verdict:"yes",name:"苯",formula:"C6H6",note:["芳香烃，易燃有毒，长期接触损害造血系统（致癌）。"],related:[],tags:["toxic","oxidize"]},
  "C2H5OH":{verdict:"yes",name:"乙醇",formula:"C2H5OH",note:["酒精，可燃；饮用/消毒/燃料。"],related:[],tags:["oxidize"]},
  "CH3COOH":{verdict:"yes",name:"乙酸",formula:"CH3COOH",note:["醋酸，食醋主要成分；弱酸，可燃。"],related:[],tags:["corrosive"]},
  "CH3OH":{verdict:"yes",name:"甲醇",formula:"CH3OH",note:["剧毒！饮用致盲甚至致死；用作溶剂与燃料。"],related:[],tags:["toxic","oxidize"]},
  "C12H22O11":{verdict:"yes",name:"蔗糖",formula:"C12H22O11",note:["食糖，稳定；加热焦糖化，强热炭化。"],related:[],tags:[]},
  "NH3":{verdict:"yes",name:"氨",formula:"NH3",note:["刺激性气味气体，碱性，易溶于水成氨水；用于化肥与制冷。"],related:["NH4OH"],tags:["corrosive"]}
};

// 归一化：统一上标、去除空格、规范水合点
export function normalizeFormula(raw){
  let s = String(raw).trim();
  s = s.replace(/\s+/g,"");
  s = s.replace(/[·•・]/g,".");          // 各种中点 -> 小数点
  s = s.replace(/\^([+-]?\d*)/g,(m,sign)=> sign); // H2O^ -> H2O, Fe^3+ -> Fe3+
  // 处理显式电荷：把末尾的 +N / -N 形式标准化（在解析时单独处理）
  return s;
}

// 词法分析
function tokenize(src){
  const tokens=[];
  let i=0;
  while(i<src.length){
    const c=src[i];
    if(/[A-Z]/.test(c)){
      let sym=c; i++;
      while(i<src.length && /[a-z]/.test(src[i])){ sym+=src[i]; i++; }
      tokens.push({t:"EL",v:sym});
    } else if(/[a-z]/.test(c)){
      // 小写字母开头（不规范），尝试当作元素符号的一部分容错
      throw new Error("化学式应以大写元素符号开头（"+c+" 处）");
    } else if(c==="("){ tokens.push({t:"LP"}); i++; }
    else if(c===")"){ tokens.push({t:"RP"}); i++; }
    else if(c==="["){ tokens.push({t:"LB"}); i++; }
    else if(c==="]"){ tokens.push({t:"RB"}); i++; }
    else if(c==="{"){ tokens.push({t:"LC"}); i++; }
    else if(c==="}"){ tokens.push({t:"RC"}); i++; }
    else if(c==="."){ tokens.push({t:"DOT"}); i++; }
    else if(/[0-9]/.test(c)){
      let num=c; i++;
      while(i<src.length && /[0-9]/.test(src[i])){ num+=src[i]; i++; }
      tokens.push({t:"NUM",v:parseInt(num,10)});
    } else if(c==="+"||c==="-"){
      let sign=c; i++;
      let num="";
      while(i<src.length && /[0-9]/.test(src[i])){ num+=src[i]; i++; }
      const mag = num===""?1:parseInt(num,10);
      tokens.push({t:"CHG",v:sign==="+"?mag:-mag});
    } else if(c==="^"){
      // 上标电荷，格式 ^+ 或 ^3+ 或 ^- 等
      i++;
      let s="";
      while(i<src.length && /[+\-0-9]/.test(src[i])){ s+=src[i]; i++; }
      const m=s.match(/^([+-]?)(\d*)$/);
      if(m){
        const sign=m[1]==="-"?-1:1;
        const mag=m[2]===""?1:parseInt(m[2],10);
        tokens.push({t:"CHG",v:sign*mag});
      }
    } else {
      throw new Error("无法识别的字符："+c);
    }
  }
  return tokens;
}

// 解析：返回 {ok, error, elements, charge, parts, raw}
// parts: 水合物的各段（如 CuSO4.5H2O -> [段1, 段2]）
export function parseFormula(raw){
  try{
    const src=normalizeFormula(raw);
    if(src==="") return {ok:false,error:"空化学式"};
    const tokens=tokenize(src);
    // 按 DOT 分段
    const segments=splitByDot(tokens);
    const elements={};
    let charge=0;
    let chargeSeen=false;
    for(const seg of segments){
      let toks=seg.toks;
      // 段首的数字是整体系数（如水合物 CuSO4.5H2O 中的 5）
      let leadMul=1;
      if(toks.length && toks[0].t==="NUM"){ leadMul=toks[0].v; toks=toks.slice(1); }
      const r=parseSegment(toks,0);
      if(r.rest.length>0) return {ok:false,error:"化学式解析残留："+JSON.stringify(r.rest)};
      if(leadMul!==1) for(const k of Object.keys(r.counts)) r.counts[k]*=leadMul;
      mergeCounts(elements,r.counts);
      if(seg.chg!==null){
        if(chargeSeen) return {ok:false,error:"化合物含有多个独立电荷"};
        charge=seg.chg; chargeSeen=true;
      }
    }
    // 校验元素符号
    for(const sym of Object.keys(elements)){
      if(!ELEMENTS[sym]) return {ok:false,error:"未知元素符号："+sym};
    }
    if(Object.keys(elements).length===0) return {ok:false,error:"未解析到任何元素"};
    return {ok:true,elements,charge,parts:segments.map(s=>s.text),raw};
  }catch(e){
    return {ok:false,error:e.message||String(e)};
  }
}

function splitByDot(tokens){
  const segs=[]; let cur=[];
  for(const tk of tokens){
    if(tk.t==="DOT"){ segs.push(cur); cur=[]; }
    else cur.push(tk);
  }
  segs.push(cur);
  // 还原每段文本（用于显示）与尾部电荷
  return segs.map(arr=>{
    const text=arr.map(t=>t.t==="NUM"?t.v:(t.t==="CHG"?(t.v>0?"+":"")+t.v:t.t==="EL"?t.v:"")).join("");
    let chg=null;
    // 电荷通常出现在段尾
    const last=arr[arr.length-1];
    if(last && last.t==="CHG"){ chg=last.v; arr=arr.slice(0,-1); }
    return {toks:arr,text,chg};
  }).filter(s=>s.toks.length>0 || s.chg!==null);
}

function mergeCounts(target,src){
  for(const k of Object.keys(src)) target[k]=(target[k]||0)+src[k];
}

// 解析一段（无 DOT），返回 {counts, rest}
function parseSegment(toks,pos){
  const counts={};
  while(pos<toks.length){
    const tk=toks[pos];
    if(tk.t==="EL"){
      const sym=tk.v;
      let cnt=1;
      if(toks[pos+1] && toks[pos+1].t==="NUM"){ cnt=toks[pos+1].v; pos++; }
      counts[sym]=(counts[sym]||0)+cnt;
      pos++;
    } else if(tk.t==="LP"||tk.t==="LB"||tk.t==="LC"){
      // 读取到匹配的 RP/RB/RC
      const closeType = tk.t==="LP"?"RP":tk.t==="LB"?"RB":"RC";
      let depth=1, j=pos+1; const inner=[];
      while(j<toks.length && depth>0){
        if(toks[j].t===tk.t) depth++;
        else if(toks[j].t===closeType) depth--;
        if(depth>0) inner.push(toks[j]);
        j++;
      }
      if(depth!==0) throw new Error("括号不匹配");
      const r=parseSegment(inner,0);
      if(r.rest.length>0) throw new Error("括号内解析残留");
      let mult=1;
      if(toks[j] && toks[j].t==="NUM"){ mult=toks[j].v; j++; }
      for(const k of Object.keys(r.counts)) counts[k]=(counts[k]||0)+r.counts[k]*mult;
      pos=j;
    } else if(tk.t==="CHG"){
      // 电荷出现说明是配合物/离子段结束；交还调用者处理
      return {counts,rest:toks.slice(pos)};
    } else if(tk.t==="RP"||tk.t==="RB"||tk.t==="RC"||tk.t==="DOT"){
      return {counts,rest:toks.slice(pos)};
    } else {
      throw new Error("意外的符号");
    }
  }
  return {counts,rest:[]};
}

// ---------------------------------------------------------------------------
// 价键/氧化态规则回退：判断电荷是否可能平衡
// ---------------------------------------------------------------------------
function ruleCheck(parsed){
  const els=parsed.elements;
  // 带电离子：若整体电荷 != 0，则作为“物质”需与反离子结合
  if(parsed.charge!==0){
    return {balanced:true, charged:true, note:`该式表示一个带电离子（总电荷 ${parsed.charge>0?"+":""}${parsed.charge}），本身不是中性物质，需与带相反电荷的离子结合成盐/配合物。`};
  }
  // 计算“固定氧化态”元素贡献的净电荷
  let fixedSum=0;
  const variable=[]; // 可能变价的元素及其原子数
  for(const sym of Object.keys(els)){
    const e=ELEMENTS[sym];
    const n=els[sym];
    if(e.fixedOS!==null && e.fixedOS!==undefined){
      fixedSum += e.fixedOS*n;
    } else {
      variable.push({sym,n,os:e.commonOS});
    }
  }
  if(variable.length===0){
    // 全部固定氧化态
    if(fixedSum===0) return {balanced:true,charged:false,note:"各元素氧化态固定且加和为零，符合电中性，按价键规则可能存在。"};
    return {balanced:false,charged:false,note:`按固定氧化态计算净电荷为 ${fixedSum}（≠0），电荷无法平衡，此类中性物质在通常条件下不可能存在。`};
  }
  if(variable.length===1){
    // 单一变价元素吸收剩余电荷
    const v=variable[0];
    const need = -fixedSum / v.n;
    if(!Number.isInteger(need)) {
      // 试试过氧化物解释：若只剩 O 且 need 为 -1（即 O 取 -1）
      if(v.sym==="O" && need===-1) return {balanced:true,charged:false,note:"按过氧化物（O 取 -1）解释可满足电中性，可能为过氧化物/超氧化物。"};
      return {balanced:false,charged:false,note:`按电中性推算 ${v.sym} 所需氧化态为 ${fmtOS(need)}（非整数），不符合常规氧化态，通常不存在。`};
    }
    if(v.os.includes(need)){
      return {balanced:true,charged:false,note:`按电中性推算 ${v.sym} 取氧化态 ${fmtOS(need)}（属其常见氧化态），符合价键规则，可能存在。`};
    }
    // 不在常见集合，但尝试过氧化物特例
    if(v.sym==="O" && need===-1) return {balanced:true,charged:false,note:"按过氧化物（O 取 -1）解释可满足电中性，可能为过氧化物/超氧化物。"};
    return {balanced:false,charged:false,note:`按电中性推算 ${v.sym} 需取氧化态 ${fmtOS(need)}，但 ${v.sym} 的常见氧化态为 [${v.os.map(fmtOS).join(", ")}]，落在其外，通常不稳定或不存在。`};
  }
  // 多个变价元素：无法唯一判定，保守给出“可能存在（需具体结构）”
  return {balanced:true,charged:false,note:"含多个变价元素，无法仅凭化学式唯一确定氧化态；若实际结构中存在合理的氧化态组合使总电荷为零，则可能存在（如 Fe₃O₄ 为混合价）。"};
}

function fmtOS(x){ return x>0?("+"+x):(""+x); }

// ---------------------------------------------------------------------------
// 主分析：综合知识库 + 规则
// ---------------------------------------------------------------------------
export function analyze(raw){
  const parsed=parseFormula(raw);
  if(!parsed.ok){
    return {ok:false,input:raw,error:parsed.error,verdict:null};
  }
  const normKey = canonicalKey(parsed);
  const known = KNOWNS[normKey] || KNOWNS[parsed.raw] || KNOWNS[parsed.raw.replace(/\./g,".")];
  const rule = ruleCheck(parsed);

  let verdict, confidence, notes=[], tags=[], name=null, related=[];
  if(known){
    verdict = known.verdict;
    confidence = "high";
    name = known.name;
    notes = known.note.slice();
    tags = known.tags.slice();
    related = known.related.slice();
  } else {
    // 规则回退
    if(rule.charged){
      verdict="conditional"; confidence="medium";
      notes=["未收录于知识库，但化学式语法有效。"];
      notes.push(rule.note);
      tags=["unstable"];
    } else if(rule.balanced){
      verdict="yes"; confidence="medium";
      notes=["未收录于知识库，但按价键/氧化态规则：电荷可平衡，通常可能存在。", rule.note];
      tags=[];
    } else {
      verdict="no"; confidence="medium";
      notes=["未收录于知识库，且按价键规则：电荷无法平衡，通常不可能作为中性稳定物质存在。", rule.note];
      tags=["unstable"];
    }
    // 仅对判定为“可能存在”的未知式给出猜测命名；不可能/带电离子不臆造名称
    name = (verdict==="yes") ? guessName(parsed) : null;
  }
  if(parsed.charge!==0){
    tags=tags.includes("charged")?tags:tags.concat(["charged"]);
  }
  return {
    ok:true,
    input:raw,
    normalized:parsed.raw,
    canonical:normKey,
    elements:parsed.elements,
    charge:parsed.charge,
    parts:parsed.parts,
    name,
    verdict,           // yes | conditional | unstable | no
    confidence,        // high | medium | low
    notes,
    warnings:buildWarnings(tags,known),
    tags,
    related,
    ruleNote: rule.note
  };
}

function canonicalKey(parsed){
  // 用于知识库匹配：按元素字母序+计数归一（忽略水合点书写差异的细化处理）
  const els=parsed.elements;
  const keys=Object.keys(els).sort();
  // 特殊处理水合物：转为 X.YH2O 形式
  const parts = parsed.parts||[];
  if(parts.length>1){
    // 取主段
    const main=parts[0];
    const waterPart=parts.slice(1).join(".");
    return main+"."+waterPart;
  }
  return keys.map(k=>k+ (els[k]===1?"":els[k])).join("");
}

function buildWarnings(tags,known){
  const map={
    toxic:["⚠ 剧毒：避免接触与误食，操作戴防护，废液按规定处理。"],
    corrosive:["⚠ 腐蚀性：避免接触皮肤/眼睛，稀释时遵循安全顺序并通风。"],
    explosive:["⚠ 爆炸/强氧化：远离可燃物、还原剂、撞击与高温。"],
    oxidize:["⚠ 易氧化/强氧化：密封避光、隔绝空气保存。"],
    unstable:["⚠ 不稳定：受热、光照或久置易分解，现配现用。"],
    charged:["该式表示离子，需与反离子组成中性物质。"]
  };
  const out=[];
  for(const t of tags){ if(map[t] && map[t][0]) out.push(map[t][0]); }
  return out;
}

// 简单中文命名（仅作兜底显示；二元化合物按「某化某」规则）
function guessName(parsed){
  const els=parsed.elements;
  const metals=Object.keys(els).filter(s=>ELEMENTS[s].metal);
  const nonmetals=Object.keys(els).filter(s=>!ELEMENTS[s].metal);
  // 二元：非金属 + 化 + 金属（如 氯化钙、氧化银）
  if(metals.length===1 && nonmetals.length===1){
    return ELEMENTS[nonmetals[0]].zh + "化" + ELEMENTS[metals[0]].zh;
  }
  if(nonmetals.length===1 && metals.length===0) return ELEMENTS[nonmetals[0]].zh+"单质";
  return null;
}

function sub(n){
  const m={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"};
  return String(n).split("").map(c=>m[c]||c).join("");
}

// 便捷：判断 verdict 的中文描述
export function verdictText(v){
  return {
    yes:"✅ 稳定存在",
    conditional:"🟡 仅特定条件下存在",
    unstable:"🟠 可生成但极不稳定/易分解",
    no:"❌ 通常不存在 / 不可能"
  }[v] || v;
}

// 常用基团/模板（用于前端便捷输入）
export const TEMPLATES = [
  {label:"( )",ins:"()",type:"wrap"},
  {label:"[ ]",ins:"[]",type:"wrap"},
  {label:"·",ins:"·",type:"ins"},
  {label:"OH⁻",ins:"(OH)",type:"ins"},
  {label:"SO₄²⁻",ins:"(SO4)",type:"ins"},
  {label:"CO₃²⁻",ins:"(CO3)",type:"ins"},
  {label:"NO₃⁻",ins:"(NO3)",type:"ins"},
  {label:"NH₄⁺",ins:"(NH4)",type:"ins"},
  {label:"PO₄³⁻",ins:"(PO4)",type:"ins"},
  {label:"H₂O",ins:"H2O",type:"ins"},
  {label:"²⁺",ins:"2+",type:"ins"},
  {label:"³⁺",ins:"3+",type:"ins"},
  {label:"⁻",ins:"-",type:"ins"}
];

// 便捷：把普通文本化学式美化为下标显示
export function prettyFormula(text){
  const subMap={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"};
  let out="";
  for(const ch of String(text)){
    if(/[0-9]/.test(ch)) out+=subMap[ch]||ch;
    else if(ch===".") out+="·";
    else out+=ch;
  }
  return out;
}
