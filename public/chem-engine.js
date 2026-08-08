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
// redox: 氧化还原性质（按条件分类）
// solubility: 溶解度（按溶剂分类）
// ---------------------------------------------------------------------------
export const KNOWNS = {
  // —— 用户重点举例：银的氢氧化物 ——
  "AgOH":{verdict:"unstable",name:"氢氧化银",formula:"AgOH",
    note:["氢氧化银在水中几乎不能独立存在：一旦生成（Ag⁺ + OH⁻）立即脱水生成棕黑色的氧化银 Ag₂O（2AgOH → Ag₂O + H₂O）。",
          "只在极低温、极稀溶液中可瞬时存在；在空气中、光照或受热时迅速转化为 Ag₂O，并可能进一步被氧化/分解。",
          "因此通常不说“制得氢氧化银”，而是得到氧化银沉淀。"],
    related:["Ag2O"],tags:["unstable","oxidize"],
    redox:[{condition:"在水中",behavior:"无显著氧化还原性",detail:"极不稳定，立即脱水为 Ag₂O"}],
    solubility:[{solvent:"水",value:"不溶",note:"生成即分解为 Ag₂O"}]},

  // —— 其他贵金属氢氧化物 ——
  "AuOH":{verdict:"unstable",name:"氢氧化金(I)",formula:"AuOH",
    note:["金(I)的氢氧化物极不稳定，生成即歧化/脱水为 Au₂O（并析出 Au）。实际以 Au₂O₃·xH₂O（水合氧化金）形式存在。"],
    related:["Au2O3"],tags:["unstable"],
    redox:[{condition:"生成时",behavior:"歧化",detail:"Au⁺ 歧化为 Au³⁺ 与 Au 单质"}],
    solubility:[{solvent:"水",value:"不溶",note:"生成即分解"}]},
  "Au(OH)3":{verdict:"conditional",name:"氢氧化金(III)",formula:"Au(OH)3",
    note:["游离的 Au(OH)₃ 并不稳定，实际多以水合氧化物 Au₂O₃·xH₂O 形式存在；是两性偏酸物质，溶于强碱生成金酸盐。"],
    related:["Au2O3"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"Au(III) 可被还原为 Au 单质"}],
    solubility:[{solvent:"水",value:"不溶",note:"以水合氧化物形式存在"},
      {solvent:"强碱",value:"可溶",note:"生成金酸盐 AuO₂⁻"}]},

  // —— 过渡金属氢氧化物：空气中易氧化 ——
  "Fe(OH)2":{verdict:"yes",name:"氢氧化亚铁",formula:"Fe(OH)2",
    note:["白色沉淀，极易被空气氧化：先变灰绿色，最终生成红褐色的水合氧化铁 Fe(OH)₃（实际为 Fe₂O₃·xH₂O）。",
          "制取与保存需在隔绝空气（如煮沸除氧的水、惰性气氛）下进行。"],
    related:["Fe(OH)3","FeO","Fe3O4"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Fe²⁺ 被氧化为 Fe³⁺，生成 Fe(OH)₃"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被 KMnO₄、HNO₃ 等氧化为 Fe³⁺"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 4.87×10⁻¹⁷"},
      {solvent:"酸",value:"可溶",note:"生成 Fe²⁺"}]},
  "Fe(OH)3":{verdict:"yes",name:"氢氧化铁",formula:"Fe(OH)3",
    note:["红褐色沉淀，受热或久置脱水生成 Fe₂O₃·xH₂O（铁红）；本身并非严格化学计量物，常以水合氧化铁形式存在。"],
    related:["Fe2O3"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Fe³⁺ 较稳定，强还原剂可还原为 Fe²⁺"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 2.79×10⁻³⁹"},
      {solvent:"酸",value:"可溶",note:"生成 Fe³⁺"}]},
  "Cu(OH)2":{verdict:"yes",name:"氢氧化铜",formula:"Cu(OH)2",
    note:["蓝色沉淀；加热或久置分解为黑色 CuO（Cu(OH)₂ → CuO + H₂O）。",
          "溶于氨水形成深蓝色 [Cu(NH₃)₄]²⁺ 配离子；与葡萄糖等还原糖共热生成砖红色 Cu₂O（斐林/班氏试剂原理）。"],
    related:["CuO","Cu2O"],tags:["unstable"],
    redox:[{condition:"与还原糖共热",behavior:"氧化性",detail:"Cu²⁺ 被还原为 Cu₂O"},
      {condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 CuO + H₂O"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 2.2×10⁻²⁰"},
      {solvent:"酸",value:"可溶",note:"生成 Cu²⁺"},
      {solvent:"氨水",value:"可溶",note:"生成 [Cu(NH₃)₄]²⁺"}]},
  "Mn(OH)2":{verdict:"yes",name:"氢氧化锰(II)",formula:"Mn(OH)2",
    note:["白色沉淀，在空气中迅速被氧化为棕黑色的 MnO(OH)₂ / MnO₂ 水合物。"],
    related:["MnO2"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Mn²⁺ 被氧化为 Mn(IV) 的 MnO(OH)₂"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被氧化为 MnO₂ 或更高价态"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 1.6×10⁻¹³"},
      {solvent:"酸",value:"可溶",note:"生成 Mn²⁺"}]},
  "Co(OH)2":{verdict:"yes",name:"氢氧化钴(II)",formula:"Co(OH)2",
    note:["粉红色/蓝色沉淀，在空气中可被氧化为棕褐色的 Co(OH)₃（实际常以 CoO(OH) 形式）。"],
    related:["Co(OH)3"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Co²⁺ 缓慢氧化为 Co³⁺"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被 Cl₂、NaClO 等氧化为 CoO(OH)"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 1.6×10⁻¹⁵"},
      {solvent:"酸",value:"可溶",note:"生成 Co²⁺"}]},
  "Ni(OH)2":{verdict:"yes",name:"氢氧化镍(II)",formula:"Ni(OH)2",
    note:["苹果绿色沉淀，可被强氧化剂（如 NaClO）氧化为黑色的 NiO(OH)，是镍氢/镍镉电池正极反应。"],
    related:["NiO(OH)"],tags:["oxidize"],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"Ni²⁺ 被氧化为 Ni³⁺ 的 NiO(OH)"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 5.5×10⁻¹⁶"},
      {solvent:"酸",value:"可溶",note:"生成 Ni²⁺"}]},
  "Cr(OH)3":{verdict:"yes",name:"氢氧化铬(III)",formula:"Cr(OH)3",
    note:["灰绿色两性氢氧化物：溶于酸生成 Cr³⁺，溶于强碱生成亮绿色的 [Cr(OH)₄]⁻（亚铬酸盐）。"],
    related:["Cr2O3"],tags:["unstable"],
    redox:[{condition:"在碱性条件下",behavior:"还原性",detail:"Cr(III) 可被 H₂O₂、NaClO 等氧化为 Cr(VI) 的 CrO₄²⁻"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Cr³⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 6.3×10⁻³¹"},
      {solvent:"酸",value:"可溶",note:"生成 Cr³⁺"},
      {solvent:"强碱",value:"可溶",note:"生成 [Cr(OH)₄]⁻"}]},
  "Hg2(OH)2":{verdict:"no",name:"（亚汞）氢氧化汞(I)",formula:"Hg2(OH)2",
    note:["亚汞离子 Hg₂²⁺ 的氢氧化物并不存在：生成时立即歧化分解为 Hg（液态）与 HgO。",
          "因此 Hg₂²⁺ 盐的溶液加碱得到的是 Hg + HgO 混合物，而非 Hg₂(OH)₂。"],
    related:["HgO","Hg"],tags:["unstable"],
    redox:[{condition:"生成时",behavior:"歧化",detail:"Hg₂²⁺ 歧化为 Hg 与 HgO"}],
    solubility:[{solvent:"水",value:"不溶",note:"无法独立存在，立即歧化分解"}]},
  "Pb(OH)2":{verdict:"yes",name:"氢氧化铅(II)",formula:"Pb(OH)2",
    note:["白色两性氢氧化物：溶于酸生成 Pb²⁺，溶于强碱生成 [Pb(OH)₃]⁻ / [Pb(OH)₄]²⁻。",
          "铅化合物均有毒，操作需谨慎。"],
    related:["PbO"],tags:["toxic","unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Pb²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 1.2×10⁻¹⁵"},
      {solvent:"酸",value:"可溶",note:"生成 Pb²⁺"},
      {solvent:"强碱",value:"可溶",note:"生成亚铅酸根"}]},
  "Zn(OH)2":{verdict:"yes",name:"氢氧化锌",formula:"Zn(OH)2",
    note:["白色两性氢氧化物：溶于酸生成 Zn²⁺，溶于过量强碱生成 [Zn(OH)₄]²⁻（锌酸盐）。"],
    related:["ZnO"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Zn²⁺ 稳定，不易被氧化或还原"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 3×10⁻¹⁷"},
      {solvent:"酸",value:"可溶",note:"生成 Zn²⁺"},
      {solvent:"强碱",value:"可溶",note:"生成 [Zn(OH)₄]²⁻"}]},
  "Al(OH)3":{verdict:"yes",name:"氢氧化铝",formula:"Al(OH)3",
    note:["白色胶状沉淀，典型两性氢氧化物：溶于酸生成 Al³⁺，溶于强碱生成 [Al(OH)₄]⁻（偏铝酸盐）。",
          "不溶于过量氨水（借此可与 Zn²⁺ 等分离）。"],
    related:["Al2O3"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Al³⁺ 极稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 3×10⁻³⁴"},
      {solvent:"酸",value:"可溶",note:"生成 Al³⁺"},
      {solvent:"强碱",value:"可溶",note:"生成 [Al(OH)₄]⁻"}]},
  "Sn(OH)2":{verdict:"yes",name:"氢氧化亚锡",formula:"Sn(OH)2",
    note:["白色两性氢氧化物，易被空气氧化；溶于酸生成 Sn²⁺，溶于强碱生成亚锡酸盐。"],
    related:["SnO"],tags:["oxidize","toxic"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Sn²⁺ 被氧化为 Sn⁴⁺"},
      {condition:"与氧化剂",behavior:"还原性",detail:"可还原 HgCl₂ 为 Hg（检验 Sn²⁺）"}],
    solubility:[{solvent:"水",value:"难溶",note:"两性氢氧化物"},
      {solvent:"酸",value:"可溶",note:"生成 Sn²⁺"},
      {solvent:"强碱",value:"可溶",note:"生成亚锡酸根"}]},
  "Bi(OH)3":{verdict:"yes",name:"氢氧化铋",formula:"Bi(OH)3",
    note:["白色沉淀，几乎不显两性（Bi³⁺ 碱性较强）；强氧化下可生成铋酸盐，但游离 Bi(OH)₃ 不稳定、易脱水。"],
    related:["Bi2O3"],tags:["unstable","toxic"],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"Bi(III) 可被氧化为 Bi(V) 铋酸盐"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Bi³⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"碱性较强，不显两性"},
      {solvent:"酸",value:"可溶",note:"生成 Bi³⁺"}]},
  "Mg(OH)2":{verdict:"yes",name:"氢氧化镁",formula:"Mg(OH)2",
    note:["白色难溶氢氧化物（镁乳），中强碱；加热分解为 MgO。可溶于铵盐溶液（因 NH₄⁺ 消耗 OH⁻）。"],
    related:["MgO"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mg²⁺ 极稳定"}],
    solubility:[{solvent:"水",value:"难溶",note:"Ksp 约 5.6×10⁻¹²"},
      {solvent:"铵盐溶液",value:"可溶",note:"NH₄⁺ 消耗 OH⁻ 促进溶解"}]},
  "Ca(OH)2":{verdict:"yes",name:"氢氧化钙",formula:"Ca(OH)2",
    note:["熟石灰/消石灰，微溶于水（石灰水）；溶解度随温度升高而下降。强碱，用于建筑、中和酸性土壤。"],
    related:["CaO"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ca²⁺ 极稳定"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 0.165g/100mL，温度升高溶解度下降"}]},
  "NaOH":{verdict:"yes",name:"氢氧化钠",formula:"NaOH",
    note:["烧碱，强碱，易潮解并吸收 CO₂ 变质为 Na₂CO₃；具强腐蚀性，溶于水剧烈放热。"],
    related:["Na2CO3"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 极稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 109g/100mL，溶解放热"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "KOH":{verdict:"yes",name:"氢氧化钾",formula:"KOH",
    note:["强碱，性质类似 NaOH，易潮解、腐蚀；常用于制钾盐与碱性电池电解液。"],
    related:[],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"K⁺ 极稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 112g/100mL，溶解放热"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "NH4OH":{verdict:"conditional",name:"氢氧化铵（氨水）",formula:"NH4OH",
    note:["“氢氧化铵 NH₄OH”是旧写法；实际溶液中并不存在独立的 NH₄OH 分子，而是 NH₃·H₂O（一水合氨）与少量 NH₄⁺、OH⁻ 的平衡体系。",
          "市售“氨水”即 NH₃ 的水溶液。"],
    related:["NH3"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"还原性",detail:"NH₃/NH₄⁺ 中 N 为 -3 价，可被强氧化剂氧化为 N₂"}],
    solubility:[{solvent:"水",value:"可溶",note:"NH₃ 极易溶于水，以 NH₃·H₂O 形式存在"}]},

  // —— 含氧酸（多数仅存于溶液）——
  "H2CO3":{verdict:"conditional",name:"碳酸",formula:"H2CO3",
    note:["碳酸只能在水中存在，无法分离出纯品：浓度稍高或受热即分解为 CO₂ + H₂O。",
          "其盐（碳酸盐）非常稳定且广泛存在。"],
    related:["CO2","Na2CO3"],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"C(IV) 较稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"仅存于水溶液，浓度低，受热分解"}]},
  "H2SO3":{verdict:"conditional",name:"亚硫酸",formula:"H2SO3",
    note:["仅存在于水溶液，游离态分解为 SO₂ + H₂O；是中等强度酸，有还原性（易被氧化为硫酸）。"],
    related:["SO2","H2SO4"],tags:["unstable","oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"S(IV) 被氧化为 S(VI) 的硫酸"},
      {condition:"与强还原剂",behavior:"氧化性",detail:"可被还原为 S 或 H₂S"}],
    solubility:[{solvent:"水",value:"可溶",note:"仅存于水溶液，由 SO₂ 溶于水生成"}]},
  "HClO":{verdict:"conditional",name:"次氯酸",formula:"HClO",
    note:["极不稳定的弱酸，见光迅速分解：2HClO → 2HCl + O₂。其盐（次氯酸盐，如 NaClO）稳定且常用作漂白/消毒。"],
    related:["NaClO"],tags:["unstable"],
    redox:[{condition:"见光时",behavior:"歧化",detail:"分解为 HCl + O₂"},
      {condition:"一般条件",behavior:"氧化性",detail:"Cl(I) 是强氧化剂，可氧化多种物质"}],
    solubility:[{solvent:"水",value:"可溶",note:"仅存于水溶液，见光分解"}]},
  "HClO2":{verdict:"conditional",name:"亚氯酸",formula:"HClO2",
    note:["不稳定中强酸，易分解；其盐（亚氯酸盐）可作漂白剂。"],
    related:[],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"歧化",detail:"Cl(III) 易歧化为 Cl⁻ 与 ClO₃⁻"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可氧化多种还原性物质"}],
    solubility:[{solvent:"水",value:"可溶",note:"仅存于水溶液，不稳定"}]},
  "HClO3":{verdict:"yes",name:"氯酸",formula:"HClO3",
    note:["不稳定强酸，浓缩或受热易分解甚至爆炸；其盐（氯酸盐，如 KClO₃）是强氧化剂。"],
    related:["KClO3"],tags:["unstable","explosive"],
    redox:[{condition:"浓缩或受热",behavior:"歧化",detail:"分解为 HClO₄ + ClO₂ + H₂O"},
      {condition:"一般条件",behavior:"氧化性",detail:"Cl(V) 是强氧化剂"}],
    solubility:[{solvent:"水",value:"易溶",note:"仅存于稀水溶液，浓缩即分解"}]},
  "HClO4":{verdict:"yes",name:"高氯酸",formula:"HClO4",
    note:["已知最强无机酸之一；稀溶液较稳定，但浓高氯酸是强氧化剂，与有机物接触有爆炸危险。"],
    related:[],tags:["corrosive","explosive"],
    redox:[{condition:"浓溶液",behavior:"氧化性",detail:"Cl(VII) 强氧化，与有机物接触爆炸"},
      {condition:"稀溶液",behavior:"无显著氧化还原性",detail:"稀溶液较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"可与水任意比互溶"}]},
  "H2S2O3":{verdict:"no",name:"硫代硫酸（游离）",formula:"H2S2O3",
    note:["游离的硫代硫酸极不稳定，无法分离；但其钠盐 Na₂S₂O₃（大苏打/海波）非常稳定，用作定影剂、脱氧剂。"],
    related:["Na2S2O3"],tags:["unstable"],
    redox:[{condition:"游离态",behavior:"歧化",detail:"立即分解为 S + SO₂ + H₂O"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"游离态无法存在"}]},
  "HNO2":{verdict:"conditional",name:"亚硝酸",formula:"HNO2",
    note:["仅存在于冷水溶液，室温即分解：3HNO₂ → HNO₃ + 2NO + H₂O。其盐（亚硝酸盐）稳定但多数有毒、可致癌。"],
    related:["NaNO2"],tags:["unstable","toxic"],
    redox:[{condition:"室温",behavior:"歧化",detail:"分解为 HNO₃ + NO"},
      {condition:"与还原剂",behavior:"氧化性",detail:"N(III) 可氧化 I⁻ 为 I₂"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"被氧化为 HNO₃"}],
    solubility:[{solvent:"水",value:"可溶",note:"仅存于冷水溶液，室温即分解"}]},

  // —— 过氧化物 / 超氧化物 ——
  "H2O2":{verdict:"yes",name:"过氧化氢",formula:"H2O2",
    note:["双氧水，较稳定存在于稀溶液；浓溶液或受热、见光、遇金属离子会剧烈分解为 H₂O + O₂，是强氧化剂。",
          "高浓度（>30%）有爆炸与强腐蚀性危险。"],
    related:["H2O"],tags:["oxidize","corrosive","explosive"],
    redox:[{condition:"一般条件",behavior:"既氧化又还原",detail:"O(-1) 既可作氧化剂（还原为 H₂O）又可作还原剂（氧化为 O₂）"},
      {condition:"见光/受热/遇金属离子",behavior:"歧化",detail:"分解为 H₂O + O₂"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶"}]},
  "Na2O2":{verdict:"yes",name:"过氧化钠",formula:"Na2O2",
    note:["淡黄色固体，强氧化剂；与水剧烈反应生成 NaOH 并放出 O₂，与 CO₂ 反应生成 Na₂CO₃ 并供氧（潜水/航天用）。"],
    related:["Na2O"],tags:["oxidize","corrosive"],
    redox:[{condition:"与水",behavior:"歧化",detail:"O(-1) 歧化为 O₂ 与 OH⁻"},
      {condition:"一般条件",behavior:"氧化性",detail:"强氧化剂，可氧化多种物质"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 NaOH + O₂"}]},
  "BaO2":{verdict:"yes",name:"过氧化钡",formula:"BaO2",
    note:["过氧化物，与酸反应放出 H₂O₂； historically 用于制过氧化氢。可溶性钡化合物有毒。"],
    related:["BaO"],tags:["oxidize","toxic"],
    redox:[{condition:"与酸",behavior:"无显著氧化还原性",detail:"生成 H₂O₂ 与 Ba²⁺"},
      {condition:"加热时",behavior:"歧化",detail:"高温分解为 BaO + O₂"}],
    solubility:[{solvent:"水",value:"难溶",note:"不溶于水"},
      {solvent:"稀酸",value:"可溶",note:"生成 H₂O₂ 与 Ba²⁺"}]},
  "KO2":{verdict:"yes",name:"超氧化钾",formula:"KO2",
    note:["橙黄色固体，与 CO₂ 反应放出 O₂（2KO₂ + CO₂ → K₂CO₃ + 1.5O₂），用作密闭空间（矿坑/潜水）供氧剂。"],
    related:[],tags:["oxidize"],
    redox:[{condition:"与水",behavior:"歧化",detail:"O(-1/2) 歧化为 O₂ 与 OH⁻"},
      {condition:"与 CO₂",behavior:"歧化",detail:"生成 K₂CO₃ + O₂"},
      {condition:"一般条件",behavior:"氧化性",detail:"强氧化剂"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水剧烈反应放出 O₂"}]},

  // —— 卤素含氧酸盐（强氧化/爆炸）——
  "NaClO":{verdict:"yes",name:"次氯酸钠",formula:"NaClO",
    note:["84 消毒液主要成分（有效氯）；溶液呈碱性、不稳定，与酸性洁厕剂混合会放出剧毒 Cl₂，严禁混用！"],
    related:["HClO"],tags:["oxidize","toxic"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"Cl(I) 强氧化剂，可漂白/消毒"},
      {condition:"在酸性条件下",behavior:"歧化",detail:"生成 Cl₂ 或 ClO₃⁻"}],
    solubility:[{solvent:"水",value:"易溶",note:"水溶液呈碱性"}]},
  "Ca(ClO)2":{verdict:"yes",name:"次氯酸钙",formula:"Ca(ClO)2",
    note:["漂白粉/漂粉精的有效成分；遇酸或 CO₂ 放出 HClO，具漂白与消毒作用；与有机物混合可爆。"],
    related:[],tags:["oxidize","explosive"],
    redox:[{condition:"遇酸或 CO₂",behavior:"氧化性",detail:"放出 HClO，强氧化漂白"},
      {condition:"受热",behavior:"歧化",detail:"生成 CaCl₂ + O₂ + Ca(ClO₃)₂"}],
    solubility:[{solvent:"水",value:"可溶",note:"溶于水，溶液浑浊"}]},
  "KClO3":{verdict:"yes",name:"氯酸钾",formula:"KClO3",
    note:["强氧化剂，与硫、碳、磷或有机物混合受摩擦/加热即猛烈爆炸；曾用于火柴与烟火，现多被 KClO₄ 替代。"],
    related:[],tags:["oxidize","explosive"],
    redox:[{condition:"加热（催化）",behavior:"歧化",detail:"MnO₂ 催化分解为 KCl + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"Cl(V) 强氧化剂，猛烈反应"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 7.1g/100mL，温度升高溶解度增大"}]},
  "KClO4":{verdict:"yes",name:"高氯酸钾",formula:"KClO4",
    note:["强氧化剂，较氯酸盐稳定；用于烟火、火箭推进剂。仍须远离可燃物的还原剂。"],
    related:[],tags:["oxidize","explosive"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"高温分解为 KCl + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"Cl(VII) 强氧化剂"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 1.5g/100mL"},
      {solvent:"热水",value:"可溶",note:"温度升高溶解度增大"}]},

  // —— 重金属盐：剧毒 ——
  "BaCl2":{verdict:"yes",name:"氯化钡",formula:"BaCl2",
    note:["可溶性钡盐，剧毒！Ba²⁺ 使蛋白质变性；中毒可用硫酸镁/硫酸钠解毒（生成不溶 BaSO₄）。"],
    related:["BaSO4"],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ba²⁺ 极稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 35.7g/100mL"}]},
  "BaSO4":{verdict:"yes",name:"硫酸钡",formula:"BaSO4",
    note:["极难溶、不透过 X 射线，口服“钡餐”用于消化道造影；因不溶故无毒。"],
    related:["BaCl2"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ba²⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 1.1×10⁻¹⁰，极难溶"},
      {solvent:"酸",value:"不溶",note:"不溶于稀酸"}]},
  "BaCO3":{verdict:"yes",name:"碳酸钡",formula:"BaCO3",
    note:["虽难溶，但溶于胃酸（HCl）释放有毒 Ba²⁺，故不可作“钡餐”；有毒。"],
    related:["BaSO4"],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ba²⁺ 与 CO₃²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 5.1×10⁻⁹"},
      {solvent:"酸",value:"可溶",note:"溶于酸放出 CO₂，释放有毒 Ba²⁺"}]},
  "HgCl2":{verdict:"yes",name:"氯化汞（升汞）",formula:"HgCl2",
    note:["剧毒！蛋白质凝固剂，稀溶液曾作消毒剂；Hg²⁺ 与 SnCl₂ 反应用于检验 Hg²⁺。"],
    related:["Hg2Cl2"],tags:["toxic","corrosive"],
    redox:[{condition:"与还原剂",behavior:"氧化性",detail:"Hg²⁺ 可被 SnCl₂ 还原为 Hg₂Cl₂ 或 Hg"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 6.9g/100mL"},
      {solvent:"乙醇",value:"易溶",note:"可溶于乙醇"}]},
  "Hg2Cl2":{verdict:"yes",name:"氯化亚汞（甘汞）",formula:"Hg2Cl2",
    note:["白色难溶，曾入药；见光分解为 Hg + HgCl₂（变黑）；遇碱歧化为 Hg + HgO。"],
    related:["HgCl2"],tags:["toxic","unstable"],
    redox:[{condition:"见光时",behavior:"歧化",detail:"分解为 Hg + HgCl₂"},
      {condition:"与碱",behavior:"歧化",detail:"歧化为 Hg + HgO"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可被还原为 Hg"}],
    solubility:[{solvent:"水",value:"不溶",note:"极难溶"},
      {solvent:"乙醇",value:"不溶",note:"不溶于乙醇"}]},
  "As2O3":{verdict:"yes",name:"三氧化二砷（砒霜）",formula:"As2O3",
    note:["剧毒！溶于碱生成亚砷酸盐；是经典毒药，也用于木材防腐与玻璃工业。"],
    related:[],tags:["toxic"],
    redox:[{condition:"与氧化剂",behavior:"还原性",detail:"As(III) 可被氧化为 As(V)"},
      {condition:"与还原剂",behavior:"氧化性",detail:"As(III) 可被还原为 As 单质"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 2.0g/100mL"},
      {solvent:"碱",value:"可溶",note:"生成亚砷酸盐"},
      {solvent:"酸",value:"微溶",note:"溶于盐酸"}]},
  "HgO":{verdict:"yes",name:"氧化汞",formula:"HgO",
    note:["红/黄两种变体，加热分解为 Hg + O₂；剧毒。"],
    related:[],tags:["toxic"],
    redox:[{condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 Hg + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可被还原为 Hg"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Hg²⁺"}]},

  // —— 氮/硫氧化物（毒/腐蚀）——
  "CO":{verdict:"yes",name:"一氧化碳",formula:"CO",
    note:["无色无味剧毒气体，与血红蛋白结合致缺氧；可燃，是煤气/不完全燃烧产物。"],
    related:["CO2"],tags:["toxic","oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂"},
      {condition:"与金属氧化物",behavior:"还原性",detail:"高温还原 Fe₂O₃、CuO 等"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 2.3mL/100mL"}]},
  "NO":{verdict:"yes",name:"一氧化氮",formula:"NO",
    note:["无色气体，空气中立即与 O₂ 反应生成红棕色 NO₂；参与光化学烟雾与生物信号传导。"],
    related:["NO2"],tags:["oxidize","toxic"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"与 O₂ 反应生成 NO₂"},
      {condition:"一般条件",behavior:"氧化性",detail:"可氧化某些还原剂"}],
    solubility:[{solvent:"水",value:"微溶",note:"难溶于水"}]},
  "NO2":{verdict:"yes",name:"二氧化氮",formula:"NO2",
    note:["红棕色有毒、腐蚀性气体；与 N₂O₄ 共存；溶于水生成 HNO₃ + NO。"],
    related:["N2O4","HNO3"],tags:["toxic","corrosive"],
    redox:[{condition:"溶于水",behavior:"歧化",detail:"生成 HNO₃ + NO"},
      {condition:"一般条件",behavior:"氧化性",detail:"N(IV) 强氧化剂"}],
    solubility:[{solvent:"水",value:"可溶",note:"与水反应生成 HNO₃ + NO"}]},
  "N2O":{verdict:"yes",name:"一氧化二氮（笑气）",formula:"N2O",
    note:["无色气体，可作麻醉/助推剂；助燃；长期吸入有神经毒性。"],
    related:[],tags:["oxidize","toxic"],
    redox:[{condition:"高温",behavior:"氧化性",detail:"分解为 N₂ + O₂，可助燃"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可氧化多种物质"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 60mL/100mL（体积比）"}]},
  "SO2":{verdict:"yes",name:"二氧化硫",formula:"SO2",
    note:["刺激性有毒气体，是酸雨前体；有漂白性（与品红反应）与还原性。"],
    related:["SO3","H2SO3"],tags:["toxic","corrosive"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"可被催化氧化为 SO₃"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"被 KMnO₄、Cl₂ 等氧化为 SO₄²⁻"},
      {condition:"与强还原剂",behavior:"氧化性",detail:"可被还原为 S 或 H₂S"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 9.4g/100mL，生成 H₂SO₃"}]},
  "SO3":{verdict:"yes",name:"三氧化硫",formula:"SO3",
    note:["强腐蚀性，遇水剧烈生成硫酸并放热；是硫酸工业的关键中间体。"],
    related:["H2SO4"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"S(VI) 是强氧化剂"},
      {condition:"高温时",behavior:"无显著氧化还原性",detail:"可分解为 SO₂ + O₂"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水剧烈反应生成 H₂SO₄"}]},
  "H2S":{verdict:"yes",name:"硫化氢",formula:"H2S",
    note:["剧毒、臭鸡蛋味气体，可燃；与金属离子生成特征色硫化物沉淀，用于定性分析。"],
    related:[],tags:["toxic","oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"可燃，被氧化为 S 或 SO₂"},
      {condition:"与氧化剂",behavior:"还原性",detail:"被 KMnO₄、Cl₂、HNO₃ 等氧化为 S 或 SO₄²⁻"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 0.38g/100mL，水溶液为氢硫酸"}]},

  // —— 常见酸碱盐（稳定）——
  "H2O":{verdict:"yes",name:"水",formula:"H2O",note:["最普遍的溶剂，中性。"],related:[],tags:[],
    redox:[{condition:"电解时",behavior:"既氧化又还原",detail:"电解水生成 H₂ + O₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"常温稳定"}],
    solubility:[{solvent:"一般溶剂",value:"可溶",note:"万能溶剂"}]},
  "H2SO4":{verdict:"yes",name:"硫酸",formula:"H2SO4",
    note:["强酸，浓硫酸具强腐蚀性、脱水性与强氧化性；稀释时务必“酸入水”并搅拌。"],
    related:[],tags:["corrosive"],
    redox:[{condition:"浓硫酸加热",behavior:"氧化性",detail:"可氧化 Cu、C 等，自身还原为 SO₂"},
      {condition:"稀溶液",behavior:"无显著氧化还原性",detail:"稀硫酸仅显酸性"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶，稀释剧烈放热"}]},
  "HNO3":{verdict:"yes",name:"硝酸",formula:"HNO3",
    note:["强酸、强氧化剂；浓硝酸见光变黄（分解出 NO₂），具强腐蚀性，使皮肤/蛋白质黄染。"],
    related:[],tags:["corrosive","oxidize"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"N(V) 强氧化剂，可氧化 Cu、C、S 等"},
      {condition:"见光时",behavior:"歧化",detail:"分解为 NO₂ + O₂ + H₂O"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶"}]},
  "HCl":{verdict:"yes",name:"氯化氢/盐酸",formula:"HCl",
    note:["气态为氯化氢，水溶液为盐酸（强酸）；浓盐酸易挥发，与 NH₃ 生成白烟 NH₄Cl。"],
    related:["NH4Cl"],tags:["corrosive"],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"Cl⁻ 可被 MnO₂、KMnO₄ 等氧化为 Cl₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"稀盐酸仅显酸性"}],
    solubility:[{solvent:"水",value:"易溶",note:"0°C 约 82.3g/100mL"}]},
  "H3PO4":{verdict:"yes",name:"磷酸",formula:"H3PO4",note:["中强三元酸，无毒，用于肥料与食品添加剂。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"P(V) 极稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 548g/100mL"}]},
  "HF":{verdict:"yes",name:"氢氟酸",formula:"HF",
    note:["剧毒且腐蚀玻璃/硅酸盐；渗入组织破坏钙镁、侵蚀骨骼，灼伤初期不痛但可致命，须专用防护与急救（葡萄糖酸钙）。"],
    related:[],tags:["toxic","corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"F⁻ 极稳定，难以被氧化或还原"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶"}]},
  "NaCl":{verdict:"yes",name:"氯化钠",formula:"NaCl",note:["食盐主要成分，稳定。"],related:[],tags:[],
    redox:[{condition:"熔融电解",behavior:"既氧化又还原",detail:"电解生成 Na + Cl₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 Cl⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 36.0g/100mL"}]},
  "Na2CO3":{verdict:"yes",name:"碳酸钠",formula:"Na2CO3",note:["纯碱/苏打，稳定；水溶液呈碱性。"],related:["NaHCO3"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 CO₃²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 21.5g/100mL"}]},
  "NaHCO3":{verdict:"yes",name:"碳酸氢钠",formula:"NaHCO3",note:["小苏打，受热或遇酸放出 CO₂；可作膨松剂与抗酸剂。"],related:["Na2CO3"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 HCO₃⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 9.6g/100mL"}]},
  "CaCO3":{verdict:"yes",name:"碳酸钙",formula:"CaCO3",note:["石灰石/贝壳/骨骸主要成分；难溶，遇酸放出 CO₂。"],related:[],tags:[],
    redox:[{condition:"高温",behavior:"无显著氧化还原性",detail:"分解为 CaO + CO₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ca²⁺ 与 CO₃²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 3.4×10⁻⁹"},
      {solvent:"酸",value:"可溶",note:"遇酸放出 CO₂"}]},
  "CaO":{verdict:"yes",name:"氧化钙",formula:"CaO",note:["生石灰，遇水剧烈放热生成 Ca(OH)₂（熟石灰）。"],related:["Ca(OH)2"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ca²⁺ 与 O²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 Ca(OH)₂ 并放热"}]},
  "CuSO4":{verdict:"yes",name:"硫酸铜",formula:"CuSO4",note:["无水物白色，五水合物 CuSO₄·5H₂O 为蓝色胆矾；溶液与过量 NH₃ 生成深蓝配离子。"],related:["CuSO4.5H2O"],tags:["toxic"],
    redox:[{condition:"与活泼金属",behavior:"氧化性",detail:"Cu²⁺ 可被 Fe、Zn 等还原为 Cu"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Cu²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 20.7g/100mL"}]},
  "CuSO4.5H2O":{verdict:"yes",name:"五水硫酸铜（胆矾）",formula:"CuSO4.5H2O",
    note:["蓝色晶体，加热逐步失水变为白色无水 CuSO₄；是常见铜盐与杀菌剂（波尔多液组分）。"],
    related:["CuSO4"],tags:["toxic"],
    redox:[{condition:"加热时",behavior:"无显著氧化还原性",detail:"逐步失水变为无水 CuSO₄"},
      {condition:"与活泼金属",behavior:"氧化性",detail:"Cu²⁺ 可被还原为 Cu"}],
    solubility:[{solvent:"水",value:"易溶",note:"同 CuSO₄"}]},
  "AgNO3":{verdict:"yes",name:"硝酸银",formula:"AgNO3",
    note:["无色晶体，见光分解变黑（生成 Ag）；用于镀银、试剂与“银镜反应”。溶液具氧化性/腐蚀性。"],
    related:[],tags:["corrosive","oxidize"],
    redox:[{condition:"见光时",behavior:"无显著氧化还原性",detail:"分解为 Ag + NO₂ + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"Ag⁺ 可被还原为 Ag"},
      {condition:"与活泼金属",behavior:"氧化性",detail:"可置换出 Ag"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 222g/100mL"}]},
  "AgCl":{verdict:"yes",name:"氯化银",formula:"AgCl",note:["白色凝乳状沉淀，见光变紫黑（分解出 Ag）；不溶于水与稀酸，溶于氨水/硫代硫酸钠。"],related:["AgBr","AgI"],tags:["unstable"],
    redox:[{condition:"见光时",behavior:"无显著氧化还原性",detail:"分解为 Ag + Cl₂"},
      {condition:"与强还原剂",behavior:"氧化性",detail:"Ag⁺ 可被还原为 Ag"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 1.8×10⁻¹⁰"},
      {solvent:"氨水",value:"可溶",note:"生成 [Ag(NH₃)₂]⁺"},
      {solvent:"硫代硫酸钠",value:"可溶",note:"生成 [Ag(S₂O₃)₂]³⁻"}]},
  "AgBr":{verdict:"yes",name:"溴化银",formula:"AgBr",note:["淡黄色，感光材料（胶片）主要成分；见光分解。"],related:["AgCl","AgI"],tags:["unstable"],
    redox:[{condition:"见光时",behavior:"无显著氧化还原性",detail:"分解为 Ag + Br₂"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 5.0×10⁻¹³"},
      {solvent:"氨水",value:"微溶",note:"部分溶解"},
      {solvent:"硫代硫酸钠",value:"可溶",note:"生成配离子"}]},
  "AgI":{verdict:"yes",name:"碘化银",formula:"AgI",note:["黄色，用于人工降雨（作冰核）与感光。"],related:["AgCl","AgBr"],tags:[],
    redox:[{condition:"见光时",behavior:"无显著氧化还原性",detail:"分解为 Ag + I₂"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 8.5×10⁻¹⁷"},
      {solvent:"氨水",value:"不溶",note:"不溶于氨水"},
      {solvent:"氰化钾",value:"可溶",note:"生成 [Ag(CN)₂]⁻"}]},
  "Ag2O":{verdict:"yes",name:"氧化银",formula:"Ag2O",note:["棕黑色，由 AgOH 脱水或 Ag⁺ 加碱得到；见光分解；用作纽扣电池正极。"],related:["AgOH"],tags:["unstable"],
    redox:[{condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 Ag + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"Ag⁺ 可被还原为 Ag"}],
    solubility:[{solvent:"水",value:"微溶",note:"微溶，水溶液呈碱性"},
      {solvent:"氨水",value:"可溶",note:"生成 [Ag(NH₃)₂]⁺"},
      {solvent:"酸",value:"可溶",note:"生成 Ag⁺"}]},
  "Ag2CO3":{verdict:"yes",name:"碳酸银",formula:"Ag2CO3",note:["黄色沉淀，见光分解；微溶。"],related:[],tags:["unstable"],
    redox:[{condition:"见光时",behavior:"无显著氧化还原性",detail:"分解为 Ag₂O + CO₂ 或 Ag + CO₂ + O₂"}],
    solubility:[{solvent:"水",value:"微溶",note:"Ksp 约 8.5×10⁻¹²"},
      {solvent:"酸",value:"可溶",note:"遇酸放出 CO₂"}]},
  "Ag3PO4":{verdict:"yes",name:"磷酸银",formula:"Ag3PO4",note:["黄色沉淀，用于催化与指示。"],related:[],tags:[],
    redox:[{condition:"与还原剂",behavior:"氧化性",detail:"Ag⁺ 可被还原为 Ag"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 8.9×10⁻¹⁷"},
      {solvent:"酸",value:"可溶",note:"溶于稀酸"},
      {solvent:"氨水",value:"可溶",note:"生成 [Ag(NH₃)₂]⁺"}]},
  "KMnO4":{verdict:"yes",name:"高锰酸钾",formula:"KMnO4",
    note:["紫红色强氧化剂；酸性条件被还原为 Mn²⁺（无色），中性/弱碱为 MnO₂（棕）。具腐蚀性。"],
    related:[],tags:["oxidize","corrosive"],
    redox:[{condition:"酸性条件下",behavior:"氧化性",detail:"Mn(VII) 被还原为 Mn²⁺"},
      {condition:"中性/弱碱性",behavior:"氧化性",detail:"被还原为 MnO₂"},
      {condition:"强碱性",behavior:"氧化性",detail:"被还原为 K₂MnO₄（绿色）"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 6.4g/100mL，紫红色溶液"}]},
  "K2Cr2O7":{verdict:"yes",name:"重铬酸钾",formula:"K2Cr2O7",
    note:["橙红色强氧化剂，实验室基准物质；Cr(VI) 化合物剧毒且有致癌性，废液须专门处理。"],
    related:["Na2Cr2O7"],tags:["oxidize","toxic"],
    redox:[{condition:"酸性条件下",behavior:"氧化性",detail:"Cr(VI) 被还原为 Cr³⁺"},
      {condition:"碱性条件下",behavior:"无显著氧化还原性",detail:"转化为 CrO₄²⁻（黄色）"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 12.5g/100mL"}]},
  "CrO3":{verdict:"yes",name:"三氧化铬",formula:"CrO3",
    note:["暗红色，强氧化剂，遇有机物可燃烧；Cr(VI) 剧毒致癌。用于镀铬与清洗。"],
    related:[],tags:["oxidize","toxic","corrosive"],
    redox:[{condition:"遇有机物",behavior:"氧化性",detail:"强氧化，遇有机物可燃烧"},
      {condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 Cr₂O₃ + O₂"}],
    solubility:[{solvent:"水",value:"易溶",note:"溶于水生成铬酸 H₂CrO₄"}]},
  "NH4Cl":{verdict:"yes",name:"氯化铵",formula:"NH4Cl",note:["白色盐，受热升华（实为分解再凝华）；用于化肥、焊药、干电池。"],related:[],tags:[],
    redox:[{condition:"受热",behavior:"无显著氧化还原性",detail:"分解为 NH₃ + HCl"},
      {condition:"与强碱",behavior:"无显著氧化还原性",detail:"生成 NH₃ + H₂O"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 37.2g/100mL，吸热"}]},
  "NH4NO3":{verdict:"yes",name:"硝酸铵",formula:"NH4NO3",
    note:["铵态氮肥；本身是氧化剂与可燃物的混合物，受强热或撞击可发生猛烈爆炸（多起重大事故）。储存须远离火种与还原性杂质。"],
    related:[],tags:["oxidize","explosive"],
    redox:[{condition:"受强热/撞击",behavior:"歧化",detail:"NH₄⁺ 与 NO₃⁻ 间发生氧化还原，爆炸分解为 N₂O/N₂ + H₂O"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"常温稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 192g/100mL，强烈吸热"}]},
  "(NH4)2CO3":{verdict:"yes",name:"碳酸铵",formula:"(NH4)2CO3",
    note:["不稳定，室温即缓慢分解释放 NH₃ 与 CO₂（“鹿角书橱”气味来源）；用作发酵粉与嗅盐。"],
    related:[],tags:["unstable"],
    redox:[{condition:"室温",behavior:"无显著氧化还原性",detail:"分解为 NH₃ + CO₂ + H₂O"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，水溶液呈碱性"}]},
  "(NH4)2SO4":{verdict:"yes",name:"硫酸铵",formula:"(NH4)2SO4",note:["常用氮肥；长期施用使土壤酸化。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"NH₄⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 70.6g/100mL"}]},
  "NH4HCO3":{verdict:"yes",name:"碳酸氢铵",formula:"NH4HCO3",note:["碳铵，易分解（NH₃↑+CO₂↑+H₂O）而“跑氨”，须深施覆土；常用化肥。"],related:[],tags:["unstable"],
    redox:[{condition:"室温/受热",behavior:"无显著氧化还原性",detail:"分解为 NH₃ + CO₂ + H₂O"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 21.6g/100mL"}]},
  "CaC2":{verdict:"yes",name:"碳化钙（电石）",formula:"CaC2",
    note:["遇水剧烈放出乙炔 C₂H₂（电石灯/气焊原理）；须防水密封保存。"],
    related:["C2H2"],tags:["unstable"],
    redox:[{condition:"与水",behavior:"无显著氧化还原性",detail:"水解生成 C₂H₂ + Ca(OH)₂"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应放出乙炔"}]},
  "CaSO4.2H2O":{verdict:"yes",name:"二水硫酸钙（石膏）",formula:"CaSO4.2H2O",
    note:["石膏，加热至约 150℃ 部分脱水为熟石膏 CaSO₄·½H₂O（模型/固定），再高温成硬石膏。"],
    related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ca²⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 0.21g/100mL"}]},
  "SiO2":{verdict:"yes",name:"二氧化硅",formula:"SiO2",note:["石英/砂的主要成分；极稳定，是酸性氧化物（与强碱缓慢反应）。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Si(IV) 极稳定"},
      {condition:"高温与碳",behavior:"还原性",detail:"高温被碳还原为 Si"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"氢氟酸",value:"可溶",note:"与 HF 反应生成 SiF₄"},
      {solvent:"强碱",value:"微溶",note:"与强碱缓慢反应生成硅酸盐"}]},
  "FeO":{verdict:"conditional",name:"氧化亚铁",formula:"FeO",
    note:["非整比化合物，常写作 Fe₁₋ₓO；空气中易被氧化为 Fe₃O₄，须隔绝空气制备。"],
    related:["Fe3O4","Fe2O3"],tags:["oxidize","unstable"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Fe(II) 被氧化为 Fe(III)"},
      {condition:"与还原剂",behavior:"氧化性",detail:"高温可被 C、CO、H₂ 还原为 Fe"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"生成 Fe²⁺"}]},
  "Fe2O3":{verdict:"yes",name:"三氧化二铁",formula:"Fe2O3",note:["铁红/赤铁矿，稳定；用作颜料与催化剂。"],related:[],tags:[],
    redox:[{condition:"高温与还原剂",behavior:"氧化性",detail:"被 C、CO、H₂ 还原为 Fe"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Fe(III) 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Fe³⁺"}]},
  "Fe3O4":{verdict:"yes",name:"四氧化三铁",formula:"Fe3O4",note:["磁铁矿，含铁(II,III)；具磁性，稳定。"],related:[],tags:[],
    redox:[{condition:"高温与还原剂",behavior:"氧化性",detail:"被 C、CO 还原为 Fe"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Fe(II,III) 混合价较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Fe²⁺ 与 Fe³⁺"}]},
  "CuO":{verdict:"yes",name:"氧化铜",formula:"CuO",note:["黑色，稳定；溶于酸生成 Cu²⁺。"],related:[],tags:[],
    redox:[{condition:"高温与还原剂",behavior:"氧化性",detail:"被 C、CO、H₂ 还原为 Cu"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Cu(II) 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Cu²⁺"}]},
  "Cu2O":{verdict:"yes",name:"氧化亚铜",formula:"Cu2O",note:["砖红色，Cu(I) 氧化物；溶于酸发生歧化；用于船底防污漆与红色玻璃。"],related:[],tags:[],
    redox:[{condition:"在酸中",behavior:"歧化",detail:"Cu(I) 歧化为 Cu²⁺ + Cu"},
      {condition:"在空气中加热",behavior:"氧化性",detail:"被氧化为 CuO"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可被还原为 Cu"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸发生歧化"}]},
  "Al2O3":{verdict:"yes",name:"氧化铝",formula:"Al2O3",note:["刚玉/矾土，极稳定、高熔点；天然刚玉（红/蓝宝石）含杂质；用作磨料与载体。"],related:[],tags:[],
    redox:[{condition:"高温电解",behavior:"既氧化又还原",detail:"电解熔融 Al₂O₃ 生成 Al + O₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Al(III) 极稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"微溶",note:"溶于强酸生成 Al³⁺"},
      {solvent:"强碱",value:"微溶",note:"溶于强碱生成 [Al(OH)₄]⁻"}]},

  // —— 有机物（常见）——
  "CH4":{verdict:"yes",name:"甲烷",formula:"CH4",note:["天然气主要成分，易燃，是最简单的有机物。"],related:[],tags:["oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"},
      {condition:"与卤素",behavior:"还原性",detail:"可发生取代反应"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 2.3mL/100mL，难溶于水"}]},
  "C2H6":{verdict:"yes",name:"乙烷",formula:"C2H6",note:["天然气组分，易燃。"],related:[],tags:["oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"}],
    solubility:[{solvent:"水",value:"微溶",note:"难溶于水"}]},
  "C2H4":{verdict:"yes",name:"乙烯",formula:"C2H4",note:["植物激素/化工原料，可燃，可被 KMnO₄ 氧化使紫红色褪去。"],related:[],tags:["oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"},
      {condition:"与 KMnO₄",behavior:"还原性",detail:"被氧化为乙二醇或 CO₂"}],
    solubility:[{solvent:"水",value:"微溶",note:"难溶于水"}]},
  "C2H2":{verdict:"yes",name:"乙炔",formula:"C2H2",note:["电石气，燃烧火焰温度高（氧炔焰）；可燃。"],related:[],tags:["oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"},
      {condition:"与 KMnO₄",behavior:"还原性",detail:"可被氧化"}],
    solubility:[{solvent:"水",value:"微溶",note:"微溶于水"},
      {solvent:"丙酮",value:"可溶",note:"易溶于丙酮（乙炔钢瓶储存）"}]},
  "C6H6":{verdict:"yes",name:"苯",formula:"C6H6",note:["芳香烃，易燃有毒，长期接触损害造血系统（致癌）。"],related:[],tags:["toxic","oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O，火焰冒黑烟"}],
    solubility:[{solvent:"水",value:"不溶",note:"比水轻，不溶于水"},
      {solvent:"乙醇",value:"可溶",note:"与乙醇互溶"}]},
  "C2H5OH":{verdict:"yes",name:"乙醇",formula:"C2H5OH",note:["酒精，可燃；饮用/消毒/燃料。"],related:[],tags:["oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"},
      {condition:"与氧化剂",behavior:"还原性",detail:"被氧化为乙醛、乙酸"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶"}]},
  "CH3COOH":{verdict:"yes",name:"乙酸",formula:"CH3COOH",note:["醋酸，食醋主要成分；弱酸，可燃。"],related:[],tags:["corrosive"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶"}]},
  "CH3OH":{verdict:"yes",name:"甲醇",formula:"CH3OH",note:["剧毒！饮用致盲甚至致死；用作溶剂与燃料。"],related:[],tags:["toxic","oxidize"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO₂ + H₂O"},
      {condition:"与氧化剂",behavior:"还原性",detail:"被氧化为甲醛、甲酸"}],
    solubility:[{solvent:"水",value:"易溶",note:"与水任意比互溶"}]},
  "C12H22O11":{verdict:"yes",name:"蔗糖",formula:"C12H22O11",note:["食糖，稳定；加热焦糖化，强热炭化。"],related:[],tags:[],
    redox:[{condition:"与浓硫酸",behavior:"还原性",detail:"被浓硫酸脱水炭化"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"常温稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 203.9g/100mL"},
      {solvent:"乙醇",value:"微溶",note:"微溶于乙醇"}]},

  // =====================================================================
  // —— 以下为新增物质（在 NH3 条目之前） ——
  // =====================================================================

  // —— 常见盐类（补充） ——
  "KCl":{verdict:"yes",name:"氯化钾",formula:"KCl",note:["白色晶体，钾肥主要成分；电解制钾的原料。"],related:["NaCl"],tags:[],
    redox:[{condition:"熔融电解",behavior:"既氧化又还原",detail:"电解生成 K + Cl₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"K⁺ 与 Cl⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 34.2g/100mL"}]},
  "NaBr":{verdict:"yes",name:"溴化钠",formula:"NaBr",note:["白色晶体，用于制溴化银感光材料与镇静剂。"],related:["NaCl"],tags:[],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"Br⁻ 可被 Cl₂ 氧化为 Br₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 Br⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 90.3g/100mL"}]},
  "NaI":{verdict:"yes",name:"碘化钠",formula:"NaI",note:["白色晶体，易潮解；用于碘缺乏症防治与有机合成。"],related:["NaCl"],tags:[],
    redox:[{condition:"与氧化剂",behavior:"还原性",detail:"I⁻ 易被氧化为 I₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 I⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 179g/100mL"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "KBr":{verdict:"yes",name:"溴化钾",formula:"KBr",note:["白色晶体，用于感光材料与医药。"],related:["KCl"],tags:[],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"Br⁻ 可被氧化为 Br₂"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 65.2g/100mL"}]},
  "KI":{verdict:"yes",name:"碘化钾",formula:"KI",note:["白色晶体，易潮解；碘缺乏症防治、加碘盐成分。"],related:["KCl"],tags:[],
    redox:[{condition:"与氧化剂",behavior:"还原性",detail:"I⁻ 易被氧化为 I₂（如被 Fe³⁺、Cl₂ 氧化）"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 144g/100mL"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "Na2SO4":{verdict:"yes",name:"硫酸钠",formula:"Na2SO4",note:["白色晶体，十水合物为芒硝；用于造纸、玻璃工业。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 19.5g/100mL"}]},
  "K2SO4":{verdict:"yes",name:"硫酸钾",formula:"K2SO4",note:["白色晶体，常用钾肥。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"K⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 12.0g/100mL"}]},
  "MgCl2":{verdict:"yes",name:"氯化镁",formula:"MgCl2",note:["白色晶体，易潮解；卤水主要成分，用于制镁与豆腐凝固剂。"],related:[],tags:[],
    redox:[{condition:"熔融电解",behavior:"既氧化又还原",detail:"电解生成 Mg + Cl₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mg²⁺ 与 Cl⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 54.3g/100mL"}]},
  "MgSO4":{verdict:"yes",name:"硫酸镁",formula:"MgSO4",note:["白色晶体，七水合物为泻盐（硫苦）；用于医药与肥料。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mg²⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 35.1g/100mL"}]},
  "CaCl2":{verdict:"yes",name:"氯化钙",formula:"CaCl2",note:["白色固体，极易潮解；用作干燥剂、融雪剂与钙补充剂。"],related:[],tags:[],
    redox:[{condition:"熔融电解",behavior:"既氧化又还原",detail:"电解生成 Ca + Cl₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ca²⁺ 与 Cl⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 74.5g/100mL，溶解放热"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "K2CO3":{verdict:"yes",name:"碳酸钾",formula:"K2CO3",note:["白色晶体，草木灰主要成分；水溶液呈碱性，用于制皂与玻璃。"],related:["Na2CO3"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"K⁺ 与 CO₃²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 112g/100mL"}]},
  "Na2SO3":{verdict:"yes",name:"亚硫酸钠",formula:"Na2SO3",note:["白色晶体，还原剂；易被空气氧化为硫酸钠。"],related:["Na2SO4"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"S(IV) 被氧化为 S(VI) 的硫酸钠"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被 KMnO₄、I₂ 等氧化"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 19.5g/100mL"}]},
  "Na2S":{verdict:"yes",name:"硫化钠",formula:"Na2S",note:["白色/淡黄色固体，易潮解；水溶液呈强碱性，有还原性。"],related:[],tags:["corrosive"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"S²⁻ 被氧化为 S 或多硫化物"},
      {condition:"与氧化剂",behavior:"还原性",detail:"被氧化为 S 或 SO₄²⁻"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 18.6g/100mL，水解呈碱性"}]},
  "Na2S2O3":{verdict:"yes",name:"硫代硫酸钠（大苏打/海波）",formula:"Na2S2O3",
    note:["无色晶体，用作定影剂（溶去未感光 AgBr）、脱氯剂；与 I₂ 定量反应（碘量法原理）。"],
    related:["Na2SO3"],tags:[],
    redox:[{condition:"与 I₂",behavior:"还原性",detail:"S₂O₃²⁻ 被氧化为 S₄O₆²⁻（碘量法）"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"被 Cl₂ 等氧化为 SO₄²⁻"},
      {condition:"与酸",behavior:"歧化",detail:"分解为 S + SO₂ + H₂O"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 70.1g/100mL"}]},
  "KNO3":{verdict:"yes",name:"硝酸钾（硝石/火硝）",formula:"KNO3",
    note:["白色晶体，氧化剂；制黑火药（KNO₃+S+C）、肥料。"],
    related:["NaNO3"],tags:["oxidize","explosive"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"分解为 KNO₂ + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"高温强氧化，与 C/S 混合爆炸"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 31.6g/100mL，温度升高溶解度大增"}]},
  "NaNO3":{verdict:"yes",name:"硝酸钠（智利硝石）",formula:"NaNO3",note:["白色晶体，氧化剂；肥料与防腐剂。"],related:["KNO3"],tags:["oxidize"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"分解为 NaNO₂ + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"高温强氧化"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 92.1g/100mL"}]},
  "(NH4)3PO4":{verdict:"yes",name:"磷酸铵",formula:"(NH4)3PO4",note:["白色晶体，复合肥料（N+P）；易分解失去氨。"],related:[],tags:["unstable"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"NH₄⁺ 与 PO₄³⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水"}]},
  "Na3PO4":{verdict:"yes",name:"磷酸钠",formula:"Na3PO4",note:["白色晶体，水溶液强碱性；用作洗涤剂与水处理。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 PO₄³⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 12.1g/100mL，强碱性"}]},
  "K3PO4":{verdict:"yes",name:"磷酸钾",formula:"K3PO4",note:["白色晶体，水溶液呈碱性；用于肥料与食品添加剂。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"K⁺ 与 PO₄³⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 90g/100mL"}]},
  "Na2HPO4":{verdict:"yes",name:"磷酸氢二钠",formula:"Na2HPO4",note:["白色晶体，十二水合物常见；缓冲溶液组分。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 HPO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 7.7g/100mL"}]},
  "NaH2PO4":{verdict:"yes",name:"磷酸二氢钠",formula:"NaH2PO4",note:["白色晶体，弱酸性；缓冲溶液与发酵剂。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 H₂PO₄⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 7.8g/100mL"}]},
  "Ca(NO3)2":{verdict:"yes",name:"硝酸钙",formula:"Ca(NO3)2",note:["白色晶体，易潮解；钙肥与氮肥。"],related:[],tags:["oxidize"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"分解为 Ca(NO₂)₂ + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"高温氧化剂"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 121g/100mL"}]},
  "Mg(NO3)2":{verdict:"yes",name:"硝酸镁",formula:"Mg(NO3)2",note:["白色晶体，易潮解；六水合物常见。"],related:[],tags:["oxidize"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"分解为 MgO + NO₂ + O₂"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 71g/100mL"}]},
  "AlCl3":{verdict:"yes",name:"氯化铝",formula:"AlCl3",note:["白色固体，易升华；路易斯酸催化剂（弗里德尔-克拉夫茨反应）。"],related:[],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Al³⁺ 与 Cl⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，水解呈酸性"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "Al2(SO4)3":{verdict:"yes",name:"硫酸铝",formula:"Al2(SO4)3",note:["白色晶体，水解呈酸性；净水剂（明矾主要成分之一）与造纸施胶。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Al³⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 36.4g/100mL"}]},
  "ZnCl2":{verdict:"yes",name:"氯化锌",formula:"ZnCl2",note:["白色固体，易潮解；焊接助焊剂、电池电解液。"],related:[],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Zn²⁺ 与 Cl⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 432g/100mL"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "ZnSO4":{verdict:"yes",name:"硫酸锌",formula:"ZnSO4",note:["白色晶体，七水合物为皓矾；补锌剂、农药与电镀。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Zn²⁺ 与 SO₄²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 54.4g/100mL"}]},
  "FeCl2":{verdict:"yes",name:"氯化亚铁",formula:"FeCl2",note:["绿色/白色晶体，易潮解；在空气中氧化为 Fe(III)。"],related:["FeCl3"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Fe²⁺ 被氧化为 Fe³⁺"},
      {condition:"与氧化剂",behavior:"还原性",detail:"被 KMnO₄、Cl₂ 等氧化为 Fe³⁺"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 62.5g/100mL"}]},
  "FeSO4":{verdict:"yes",name:"硫酸亚铁",formula:"FeSO4",note:["七水合物为绿矾，浅绿色；补铁剂、净水与制备铁系颜料。"],related:["Fe2(SO4)3"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Fe²⁺ 被氧化为 Fe³⁺（变黄）"},
      {condition:"与氧化剂",behavior:"还原性",detail:"被氧化为 Fe³⁺"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 26.5g/100mL"}]},
  "Fe2(SO4)3":{verdict:"yes",name:"硫酸铁",formula:"Fe2(SO4)3",note:["黄白色固体，易吸潮；净水剂与媒染剂。"],related:["FeSO4"],tags:[],
    redox:[{condition:"与还原剂",behavior:"氧化性",detail:"Fe³⁺ 可被还原为 Fe²⁺"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Fe³⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"溶于水，水解呈酸性"}]},
  "CuCl2":{verdict:"yes",name:"氯化铜",formula:"CuCl2",note:["棕黄色固体；稀溶液蓝色，浓溶液绿色（[CuCl₄]²⁻ 与 [Cu(H₂O)₄]²⁺ 共存）。"],related:["CuCl"],tags:["toxic"],
    redox:[{condition:"与还原剂",behavior:"氧化性",detail:"Cu²⁺ 可被还原为 Cu⁺ 或 Cu"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Cu²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 73g/100mL"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "Cu(NO3)2":{verdict:"yes",name:"硝酸铜",formula:"Cu(NO3)2",note:["蓝色晶体（三水合物）；溶于水呈蓝绿色。"],related:[],tags:["oxidize","toxic"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"分解为 CuO + NO₂ + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"Cu²⁺ 可被还原"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 137g/100mL"}]},
  "CuCl":{verdict:"yes",name:"氯化亚铜",formula:"CuCl",note:["白色粉末，难溶于水；在空气中氧化为 Cu(II)。"],related:["CuCl2"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Cu(I) 被氧化为 Cu(II)"},
      {condition:"在酸中",behavior:"歧化",detail:"Cu(I) 歧化为 Cu²⁺ + Cu"}],
    solubility:[{solvent:"水",value:"不溶",note:"难溶于水"},
      {solvent:"盐酸",value:"可溶",note:"溶于浓盐酸生成 [CuCl₂]⁻"}]},
  "MnCl2":{verdict:"yes",name:"氯化锰",formula:"MnCl2",note:["粉红色晶体（四水合物）；制备锰化合物原料。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mn²⁺ 较稳定"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"Mn²⁺ 可被氧化为 MnO₂ 或 MnO₄⁻"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 72.3g/100mL"}]},
  "MnSO4":{verdict:"yes",name:"硫酸锰",formula:"MnSO4",note:["淡粉色晶体；锰肥与饲料添加剂。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mn²⁺ 较稳定"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被氧化为 MnO₂ 或 MnO₄⁻"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 52g/100mL"}]},
  "NiCl2":{verdict:"yes",name:"氯化镍",formula:"NiCl2",note:["绿色晶体（六水合物）；电镀与催化剂。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ni²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 60.8g/100mL"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "NiSO4":{verdict:"yes",name:"硫酸镍",formula:"NiSO4",note:["绿色晶体（七水合物）；电镀与电池原料。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ni²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 38.4g/100mL"}]},
  "CoCl2":{verdict:"yes",name:"氯化钴",formula:"CoCl2",note:["蓝色（无水）/粉红色（六水合物）晶体；干燥剂硅胶变色指示剂。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Co²⁺ 较稳定"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被氧化为 Co³⁺"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 52.9g/100mL"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "CoSO4":{verdict:"yes",name:"硫酸钴",formula:"CoSO4",note:["红色晶体（七水合物）；电镀与陶瓷着色。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Co²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 36.2g/100mL"}]},
  "CrCl3":{verdict:"yes",name:"氯化铬",formula:"CrCl3",note:["紫色/绿色晶体（六水合物有多种异构体）；镀铬与催化剂。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Cr³⁺ 较稳定"},
      {condition:"在碱性条件下与氧化剂",behavior:"还原性",detail:"Cr(III) 可被氧化为 Cr(VI)"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 58.6g/100mL"}]},
  "Cr2(SO4)3":{verdict:"yes",name:"硫酸铬",formula:"Cr2(SO4)3",note:["紫色/绿色晶体；鞣革与镀铬。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Cr³⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"溶于水"}]},
  "PbCl2":{verdict:"yes",name:"氯化铅",formula:"PbCl2",note:["白色晶体，难溶于冷水、溶于热水；有毒。"],related:["Pb(NO3)2"],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Pb²⁺ 与 Cl⁻ 均较稳定"}],
    solubility:[{solvent:"水",value:"微溶",note:"冷水难溶，热水溶解度增大；20°C 约 1.0g/100mL"}]},
  "Pb(NO3)2":{verdict:"yes",name:"硝酸铅",formula:"Pb(NO3)2",note:["白色晶体，易溶于水；有毒，用于铬黄颜料与试剂。"],related:["PbCl2"],tags:["toxic","oxidize"],
    redox:[{condition:"加热时",behavior:"歧化",detail:"分解为 PbO + NO₂ + O₂"},
      {condition:"与还原剂",behavior:"氧化性",detail:"NO₃⁻ 可氧化还原剂"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 59.7g/100mL"}]},
  "Pb(Ac)2":{verdict:"yes",name:"醋酸铅",formula:"Pb(Ac)2",
    note:["无色晶体，味甜（有毒！）；Ac 代表醋酸根 CH₃COO⁻。可溶性铅盐，用于试剂。"],
    related:["Pb(NO3)2"],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Pb²⁺ 与醋酸根均较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 44.3g/100mL"}]},

  // —— 常见氧化物（补充） ——
  "Na2O":{verdict:"yes",name:"氧化钠",formula:"Na2O",note:["白色固体，碱性氧化物；遇水生成 NaOH。"],related:["NaOH"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 O²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 NaOH"}]},
  "K2O":{verdict:"yes",name:"氧化钾",formula:"K2O",note:["淡黄色固体，碱性氧化物；遇水生成 KOH。"],related:["KOH"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"K⁺ 与 O²⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 KOH"}]},
  "MgO":{verdict:"yes",name:"氧化镁",formula:"MgO",note:["白色粉末，高熔点（耐火材料）；碱性氧化物。"],related:["Mg(OH)2"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mg²⁺ 与 O²⁻ 均极稳定"}],
    solubility:[{solvent:"水",value:"微溶",note:"缓慢水化为 Mg(OH)₂"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Mg²⁺"}]},
  "ZnO":{verdict:"yes",name:"氧化锌",formula:"ZnO",note:["白色粉末（锌白），两性氧化物；加热变黄（色变可逆）；用作颜料、防晒与橡胶。"],related:["Zn(OH)2"],tags:[],
    redox:[{condition:"高温与还原剂",behavior:"氧化性",detail:"被 C、CO 还原为 Zn"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Zn²⁺ 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Zn²⁺"},
      {solvent:"强碱",value:"可溶",note:"溶于强碱生成锌酸根"}]},
  "Mn2O7":{verdict:"conditional",name:"七氧化二锰（高锰酸酐）",formula:"Mn2O7",
    note:["绿色油状液体，极不稳定，0°C 以上即爆炸分解为 MnO₂ + O₃；强氧化剂，遇有机物爆炸。"],
    related:["KMnO4"],tags:["explosive","oxidize","unstable"],
    redox:[{condition:"室温以上",behavior:"歧化",detail:"爆炸分解为 MnO₂ + O₃"},
      {condition:"一般条件",behavior:"氧化性",detail:"Mn(VII) 极强氧化剂"}],
    solubility:[{solvent:"水",value:"可溶",note:"溶于水生成高锰酸 HMnO₄"}]},
  "PbO":{verdict:"yes",name:"氧化铅（密陀僧）",formula:"PbO",note:["黄色/红色变体；用于铅玻璃、颜料与蓄电池。有毒。"],related:["PbO2"],tags:["toxic"],
    redox:[{condition:"高温与还原剂",behavior:"氧化性",detail:"被 C、CO、H₂ 还原为 Pb"},
      {condition:"在空气中加热",behavior:"氧化性",detail:"可被氧化为 Pb₃O₄ 或 PbO₂"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Pb²⁺"},
      {solvent:"强碱",value:"可溶",note:"溶于强碱生成亚铅酸根"}]},
  "PbO2":{verdict:"yes",name:"二氧化铅",formula:"PbO2",note:["棕褐色固体，Pb(IV) 氧化物；强氧化剂，铅蓄电池正极活性物质。"],related:["PbO"],tags:["oxidize","toxic"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"Pb(IV) 强氧化剂，可氧化 Cl⁻ 为 Cl₂"},
      {condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 Pb₃O₄ + O₂"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"微溶",note:"微溶，与酸反应放出 O₂ 或 Cl₂"}]},
  "Pb3O4":{verdict:"yes",name:"四氧化三铅（铅丹/红丹）",formula:"Pb3O4",
    note:["红色粉末，含 Pb(II) 与 Pb(IV)；防锈漆颜料。有毒。"],related:["PbO","PbO2"],tags:["toxic"],
    redox:[{condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 PbO + O₂"},
      {condition:"与酸",behavior:"歧化",detail:"生成 Pb²⁺ + PbO₂"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Pb²⁺ 与 PbO₂"}]},
  "P2O5":{verdict:"yes",name:"五氧化二磷（磷酸酐）",formula:"P2O5",
    note:["白色粉末，极强的吸水性（干燥剂）与脱水性；遇水生成偏磷酸或磷酸。"],related:["H3PO4"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"P(V) 极稳定"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水剧烈反应生成磷酸（遇冷水生成偏磷酸）"}]},
  "N2O5":{verdict:"yes",name:"五氧化二氮（硝酸酐）",formula:"N2O5",
    note:["白色固体，室温升华、易分解；遇水生成硝酸。强氧化剂。"],related:["HNO3"],tags:["oxidize","unstable"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"N(V) 强氧化剂"},
      {condition:"室温",behavior:"无显著氧化还原性",detail:"缓慢分解为 NO₂ + O₂"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 HNO₃"}]},
  "N2O3":{verdict:"conditional",name:"三氧化二氮（亚硝酸酐）",formula:"N2O3",
    note:["蓝色液体/固体，低温存在，室温分解为 NO + NO₂；遇水生成亚硝酸。"],related:["HNO2"],tags:["unstable"],
    redox:[{condition:"室温",behavior:"歧化",detail:"分解为 NO + NO₂"},
      {condition:"一般条件",behavior:"既氧化又还原",detail:"N(III) 可被氧化或还原"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 HNO₂"}]},
  "Cl2O7":{verdict:"yes",name:"七氧化二氯（高氯酸酐）",formula:"Cl2O7",
    note:["无色油状液体，较强但仍有爆炸性；遇水生成高氯酸。"],related:["HClO4"],tags:["explosive","oxidize"],
    redox:[{condition:"受热/撞击",behavior:"歧化",detail:"爆炸分解为 Cl₂ + O₂"},
      {condition:"一般条件",behavior:"氧化性",detail:"Cl(VII) 强氧化剂"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 HClO₄"}]},
  "Cl2O":{verdict:"conditional",name:"一氧化二氯（次氯酸酐）",formula:"Cl2O",
    note:["棕黄色气体，极不稳定，遇有机物爆炸；遇水生成次氯酸。"],related:["HClO"],tags:["explosive","oxidize","unstable"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"Cl(I) 强氧化剂"},
      {condition:"受热/撞击",behavior:"无显著氧化还原性",detail:"爆炸分解为 Cl₂ + O₂"}],
    solubility:[{solvent:"水",value:"遇水分解",note:"与水反应生成 HClO"}]},

  // —— 常见酸（补充） ——
  "HBr":{verdict:"yes",name:"溴化氢/氢溴酸",formula:"HBr",
    note:["无色气体，水溶液为氢溴酸（强酸）；还原性强于 HCl，可被浓硫酸氧化。"],related:["HCl"],tags:["corrosive"],
    redox:[{condition:"与氧化剂",behavior:"还原性",detail:"Br⁻ 可被浓硫酸、KMnO₄ 氧化为 Br₂"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，水溶液为强酸"}]},
  "HI":{verdict:"yes",name:"碘化氢/氢碘酸",formula:"HI",
    note:["无色气体，水溶液为氢碘酸（强酸）；还原性极强，易被氧化为 I₂。"],related:["HCl"],tags:["corrosive"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"I⁻ 易被氧化为 I₂（溶液变棕）"},
      {condition:"与氧化剂",behavior:"还原性",detail:"可被浓硫酸、KMnO₄ 等氧化"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，水溶液为强酸"}]},
  "H3BO3":{verdict:"yes",name:"硼酸",formula:"H3BO3",
    note:["白色片状晶体，弱一元酸（接受 OH⁻）；外用消毒、缓冲剂与玻璃工业。"],related:[],tags:[],
    redox:[{condition:"加热时",behavior:"无显著氧化还原性",detail:"逐步脱水生成偏硼酸、硼酐 B₂O₃"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"B(III) 极稳定"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 5.7g/100mL，热水溶解度大增"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "H2SiO3":{verdict:"yes",name:"硅酸",formula:"H2SiO3",
    note:["白色胶状沉淀，弱酸；实际以多硅酸 xSiO₂·yH₂O 凝胶形式存在。硅胶干燥剂即硅酸凝胶。"],related:["SiO2"],tags:["unstable"],
    redox:[{condition:"加热时",behavior:"无显著氧化还原性",detail:"脱水生成 SiO₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"Si(IV) 极稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水，以凝胶形式存在"}]},
  "HCN":{verdict:"yes",name:"氰化氢/氢氰酸",formula:"HCN",
    note:["无色气体/液体，苦杏仁味，剧毒！抑制细胞呼吸（与细胞色素氧化酶结合）。"],related:[],tags:["toxic"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"可燃，被氧化为 CO₂ + H₂O + N₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"弱酸，较稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，弱酸（Ka 约 6.2×10⁻¹⁰）"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},
  "HSCN":{verdict:"yes",name:"硫氰酸",formula:"HSCN",
    note:["强酸，无色液体/气体；其盐（硫氰酸盐）与 Fe³⁺ 生成血红色配离子用于检验。"],related:["Fe(SCN)3"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"SCN⁻ 较稳定"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被氧化"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，水溶液为强酸"},
      {solvent:"乙醇",value:"可溶",note:"可溶于乙醇"}]},

  // —— 常见气体/单质（补充） ——
  "O2":{verdict:"yes",name:"氧气",formula:"O2",note:["无色无味气体，助燃；呼吸与燃烧的氧化剂。"],related:[],tags:["oxidize"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"O₂ 是最常见的氧化剂，支持燃烧与呼吸"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 3.1mL/100mL"}]},
  "H2":{verdict:"yes",name:"氢气",formula:"H2",note:["无色无味气体，易燃易爆；最轻的气体，清洁燃料。"],related:[],tags:["explosive"],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 H₂O"},
      {condition:"与金属氧化物",behavior:"还原性",detail:"高温还原 CuO、Fe₂O₃ 等"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 1.6mL/100mL，难溶于水"}]},
  "N2":{verdict:"yes",name:"氮气",formula:"N2",note:["无色无味气体，空气主要成分（78%）；化学性质极稳定。"],related:[],tags:[],
    redox:[{condition:"高温/放电/催化",behavior:"无显著氧化还原性",detail:"N≡N 三键极稳定，常温不反应；高温可与 H₂、O₂、Mg 等反应"},
      {condition:"与活泼金属",behavior:"氧化性",detail:"高温可与 Li、Mg 等生成氮化物"}],
    solubility:[{solvent:"水",value:"微溶",note:"20°C 约 1.9mL/100mL"}]},
  "P":{verdict:"yes",name:"红磷",formula:"P",note:["红棕色粉末，较稳定；火柴、阻燃剂原料。"],related:["P4"],tags:[],
    redox:[{condition:"在空气中加热",behavior:"还原性",detail:"燃烧生成 P₂O₅"},
      {condition:"一般条件",behavior:"还原性",detail:"常温稳定，加热易燃"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于水和常见有机溶剂"},
      {solvent:"CS2",value:"不溶",note:"红磷不溶于 CS₂（白磷可溶）"}]},
  "P4":{verdict:"yes",name:"白磷",formula:"P4",note:["白色/黄色蜡状固体，剧毒！燃点低（40°C），空气中自燃；须保存在水中。"],related:["P"],tags:["toxic","explosive"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"自燃生成 P₂O₅"},
      {condition:"一般条件",behavior:"还原性",detail:"极易被氧化"}],
    solubility:[{solvent:"水",value:"不溶",note:"不溶于水，常保存在水中"},
      {solvent:"CS2",value:"可溶",note:"易溶于二硫化碳"}]},
  "Na":{verdict:"yes",name:"金属钠",formula:"Na",note:["银白色软质金属，极活泼；遇水剧烈反应生成 NaOH + H₂（易爆）。须保存在煤油中。"],related:["NaOH","Na2O"],tags:["explosive"],
    redox:[{condition:"与水",behavior:"还原性",detail:"Na 被氧化为 Na⁺，放出 H₂"},
      {condition:"在空气中",behavior:"还原性",detail:"被氧化为 Na₂O/Na₂O₂"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂；与水剧烈反应"},
      {solvent:"煤油",value:"不溶",note:"不溶于煤油，可保存于煤油中"}]},
  "K":{verdict:"yes",name:"金属钾",formula:"K",note:["银白色软质金属，比 Na 更活泼；遇水剧烈燃烧/爆炸。须保存在煤油中。"],related:["KOH","K2O"],tags:["explosive"],
    redox:[{condition:"与水",behavior:"还原性",detail:"K 被氧化为 K⁺，剧烈放出 H₂ 并燃烧"},
      {condition:"在空气中",behavior:"还原性",detail:"被氧化为 K₂O₂/KO₂"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂；与水剧烈反应"},
      {solvent:"煤油",value:"不溶",note:"不溶于煤油，可保存于煤油中"}]},
  "Ca":{verdict:"yes",name:"金属钙",formula:"Ca",note:["银白色金属，较活泼；遇水反应生成 Ca(OH)₂ + H₂。"],related:["CaO","Ca(OH)2"],tags:[],
    redox:[{condition:"与水",behavior:"还原性",detail:"Ca 被氧化为 Ca²⁺，放出 H₂"},
      {condition:"在空气中",behavior:"还原性",detail:"被氧化为 CaO/Ca(OH)₂"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂；与水反应"}]},
  "Mg":{verdict:"yes",name:"金属镁",formula:"Mg",note:["银白色金属，轻；在空气中燃烧发出耀眼白光（MgO）。"],related:["MgO"],tags:["explosive"],
    redox:[{condition:"在空气中燃烧",behavior:"还原性",detail:"被氧化为 MgO，白光"},
      {condition:"与水（热水）",behavior:"还原性",detail:"与热水反应放出 H₂"},
      {condition:"与 CO₂",behavior:"还原性",detail:"可在 CO₂ 中燃烧（还原 CO₂）"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"}]},
  "Al":{verdict:"yes",name:"金属铝",formula:"Al",note:["银白色轻金属；表面致密氧化膜耐腐蚀。两性，与强碱反应放出 H₂。"],related:["Al2O3","Al(OH)3"],tags:[],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"被氧化为 Al₂O₃（表面钝化膜）"},
      {condition:"与强碱",behavior:"还原性",detail:"与 NaOH 反应生成 [Al(OH)₄]⁻ + H₂"},
      {condition:"铝热反应",behavior:"还原性",detail:"高温还原 Fe₂O₃ 等金属氧化物"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"},
      {solvent:"强碱",value:"可溶",note:"溶于强碱放出 H₂"}]},
  "Zn":{verdict:"yes",name:"金属锌",formula:"Zn",note:["蓝白色金属，两性；与酸和强碱均放出 H₂。"],related:["ZnO","Zn(OH)2"],tags:[],
    redox:[{condition:"与酸",behavior:"还原性",detail:"与 HCl/H₂SO₄ 反应放出 H₂"},
      {condition:"与强碱",behavior:"还原性",detail:"与 NaOH 反应生成锌酸根 + H₂"},
      {condition:"与 Cu²⁺等",behavior:"还原性",detail:"置换出不活泼金属"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"},
      {solvent:"强碱",value:"可溶",note:"溶于强碱"},
      {solvent:"酸",value:"可溶",note:"溶于酸"}]},
  "Ag":{verdict:"yes",name:"金属银",formula:"Ag",note:["银白色金属，导电导热性最优；化学性质稳定。"],related:["AgNO3","Ag2O"],tags:[],
    redox:[{condition:"一般条件",behavior:"还原性",detail:"常温极稳定，不与空气/水反应"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可溶于 HNO₃、热浓 H₂SO₄"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"},
      {solvent:"硝酸",value:"可溶",note:"溶于硝酸"}]},
  "Au":{verdict:"yes",name:"金属金",formula:"Au",note:["金黄色金属，极稳定；不与一般酸/碱反应，溶于王水。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"极稳定，不被空气氧化"},
      {condition:"王水",behavior:"还原性",detail:"溶于王水（浓 HNO₃+浓 HCl）"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"},
      {solvent:"王水",value:"可溶",note:"溶于王水"}]},
  "Hg":{verdict:"yes",name:"汞（水银）",formula:"Hg",note:["银白色液态金属，剧毒蒸气！常温挥发。用于温度计、气压计（已被逐步淘汰）。"],related:["HgO","HgCl2"],tags:["toxic"],
    redox:[{condition:"在空气中加热",behavior:"还原性",detail:"被氧化为 HgO（红色）"},
      {condition:"与强氧化剂",behavior:"还原性",detail:"可被 HNO₃ 氧化为 Hg²⁺"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于水与一般溶剂"},
      {solvent:"硝酸",value:"可溶",note:"溶于硝酸"}]},
  "Pt":{verdict:"yes",name:"金属铂",formula:"Pt",note:["银白色贵金属，极稳定；催化性能优异（接触法制硫酸、汽车尾气催化）。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"极稳定，不被空气氧化"},
      {condition:"王水",behavior:"还原性",detail:"溶于王水"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"},
      {solvent:"王水",value:"可溶",note:"溶于王水"}]},
  "Sn":{verdict:"yes",name:"金属锡",formula:"Sn",note:["银白色金属，柔软；有灰锡/白锡/脆锡三种同素异形体。低温下白锡→灰锡（锡疫）。"],related:["SnCl2","SnCl4"],tags:[],
    redox:[{condition:"一般条件",behavior:"还原性",detail:"常温稳定，与强酸/强碱反应放出 H₂"},
      {condition:"在空气中",behavior:"还原性",detail:"被氧化为 SnO₂"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于盐酸放出 H₂"},
      {solvent:"强碱",value:"可溶",note:"溶于强碱放出 H₂"}]},
  "Pb":{verdict:"yes",name:"金属铅",formula:"Pb",note:["蓝灰色软质金属，有毒；用于蓄电池、防辐射屏蔽。"],related:["PbO","Pb(NO3)2"],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"还原性",detail:"常温表面氧化为 PbO/PbCO₃ 钝化层"},
      {condition:"与酸",behavior:"还原性",detail:"与稀盐酸/硫酸反应放出 H₂（但生成难溶盐阻碍反应）"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"},
      {solvent:"硝酸",value:"可溶",note:"溶于硝酸"}]},
  "C":{verdict:"yes",name:"碳（石墨/金刚石）",formula:"C",note:["碳有多种同素异形体：石墨（导电、层状）、金刚石（硬度最大）、富勒烯等。"],related:[],tags:[],
    redox:[{condition:"燃烧时",behavior:"还原性",detail:"被 O₂ 氧化为 CO/CO₂"},
      {condition:"高温与金属氧化物",behavior:"还原性",detail:"高温还原 CuO、Fe₂O₃ 等"}],
    solubility:[{solvent:"一般溶剂",value:"不溶",note:"不溶于一般溶剂"}]},

  // —— 其他 ——
  "Ca3(PO4)2":{verdict:"yes",name:"磷酸钙",formula:"Ca3(PO4)2",note:["白色晶体，骨骼/磷矿石主要成分；难溶。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ca²⁺ 与 PO₄³⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"难溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸生成 Ca²⁺ 与 H₂PO₄⁻"}]},
  "Mg3(PO4)2":{verdict:"yes",name:"磷酸镁",formula:"Mg3(PO4)2",note:["白色粉末，难溶；用作饲料添加剂与缓释肥料。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mg²⁺ 与 PO₄³⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"难溶于水"},
      {solvent:"酸",value:"可溶",note:"溶于酸"}]},
  "Ag2S":{verdict:"yes",name:"硫化银",formula:"Ag2S",note:["黑色沉淀，极难溶（Ksp 约 6×10⁻⁵¹）；银器变黑即生成 Ag₂S。"],related:["Ag2O"],tags:[],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"S²⁻ 可被氧化为 S"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"极稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 6×10⁻⁵¹，极难溶"},
      {solvent:"硝酸",value:"可溶",note:"溶于热硝酸"}]},
  "CuS":{verdict:"yes",name:"硫化铜",formula:"CuS",note:["黑色沉淀，极难溶；不溶于稀酸。"],related:["Cu2S"],tags:["toxic"],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"S²⁻ 可被氧化为 S"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 6×10⁻³⁷"},
      {solvent:"热硝酸",value:"可溶",note:"溶于热硝酸"}]},
  "Cu2S":{verdict:"yes",name:"硫化亚铜",formula:"Cu2S",note:["黑色固体，极难溶；铜矿（辉铜矿）主要成分。"],related:["CuS"],tags:[],
    redox:[{condition:"在空气中焙烧",behavior:"还原性",detail:"被氧化为 CuO + SO₂"},
      {condition:"一般条件",behavior:"无显著氧化还原性",detail:"较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"极难溶"},
      {solvent:"硝酸",value:"可溶",note:"溶于热硝酸"}]},
  "ZnS":{verdict:"yes",name:"硫化锌",formula:"ZnS",note:["白色沉淀，难溶；荧光粉与颜料（锌钡白）原料。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Zn²⁺ 与 S²⁻ 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 2.9×10⁻²⁵"},
      {solvent:"酸",value:"可溶",note:"溶于酸放出 H₂S"}]},
  "HgS":{verdict:"yes",name:"硫化汞（朱砂/辰砂）",formula:"HgS",note:["红色（朱砂）/黑色变体，极难溶；天然矿物颜料与中药。有毒。"],related:["HgO"],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"极稳定"},
      {condition:"加热时",behavior:"无显著氧化还原性",detail:"分解为 Hg + S"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 4×10⁻⁵³，极难溶"},
      {solvent:"王水",value:"可溶",note:"溶于王水"},
      {solvent:"硫化钠",value:"可溶",note:"溶于浓 Na₂S 生成硫代汞酸盐"}]},
  "MnS":{verdict:"yes",name:"硫化锰",formula:"MnS",note:["肉色/绿色沉淀，难溶；有多种晶型。"],related:[],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Mn²⁺ 与 S²⁻ 较稳定"},
      {condition:"与氧化剂",behavior:"还原性",detail:"S²⁻ 可被氧化"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 3×10⁻¹¹"},
      {solvent:"酸",value:"可溶",note:"溶于酸放出 H₂S"}]},
  "NiS":{verdict:"yes",name:"硫化镍",formula:"NiS",note:["黑色沉淀，难溶；有 α/β/γ 三种变体，新沉淀可溶于酸，陈化后难溶。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Ni²⁺ 与 S²⁻ 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 3×10⁻²¹"},
      {solvent:"酸",value:"微溶",note:"新沉淀可溶，陈化后难溶"}]},
  "CoS":{verdict:"yes",name:"硫化钴",formula:"CoS",note:["黑色沉淀，难溶；与 NiS 类似有变体。"],related:[],tags:["toxic"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Co²⁺ 与 S²⁻ 较稳定"}],
    solubility:[{solvent:"水",value:"不溶",note:"Ksp 约 3×10⁻²⁶"},
      {solvent:"酸",value:"微溶",note:"新沉淀可溶"}]},
  "SnCl2":{verdict:"yes",name:"氯化亚锡",formula:"SnCl2",note:["白色晶体，易水解；强还原剂，可还原 HgCl₂ 为 Hg（检验反应）。"],related:["SnCl4"],tags:["oxidize"],
    redox:[{condition:"在空气中",behavior:"还原性",detail:"Sn²⁺ 被氧化为 Sn⁴⁺"},
      {condition:"与 HgCl₂",behavior:"还原性",detail:"将 Hg²⁺ 还原为 Hg₂Cl₂ 或 Hg"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，易水解为碱式氯化亚锡"}]},
  "SnCl4":{verdict:"yes",name:"氯化锡（四氯化锡）",formula:"SnCl4",note:["无色液体/固体，易挥发、易水解；路易斯酸。"],related:["SnCl2"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"Sn(IV) 可被还原为 Sn(II)"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可被还原为 SnCl₂"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水，剧烈水解"}]},
  "As2O5":{verdict:"yes",name:"五氧化二砷（砷酸酐）",formula:"As2O5",note:["白色固体，易吸潮；遇水生成砷酸。剧毒。"],related:["As2O3"],tags:["toxic","oxidize"],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"As(V) 可被还原为 As(III)"},
      {condition:"与还原剂",behavior:"氧化性",detail:"可被还原为 As₂O₃ 或 As"}],
    solubility:[{solvent:"水",value:"易溶",note:"易溶于水生成砷酸 H₃AsO₄"}]},
  "Na2B4O7":{verdict:"yes",name:"硼砂（四硼酸钠）",formula:"Na2B4O7",note:["白色晶体（十水合物为常见硼砂）；用于玻璃/陶瓷、缓冲溶液（硼砂缓冲液）。"],related:["H3BO3"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"B(III) 极稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 2.6g/100mL，热水溶解度大增"}]},
  "NaAlO2":{verdict:"yes",name:"偏铝酸钠",formula:"NaAlO2",note:["白色固体，实际溶液中以 [Al(OH)₄]⁻ 形式存在；用于水处理与造纸。"],related:["Al(OH)3","Al2O3"],tags:["corrosive"],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"Na⁺ 与 AlO₂⁻ 均稳定"}],
    solubility:[{solvent:"水",value:"易溶",note:"溶于水，水溶液呈强碱性"}]},
  "KAl(SO4)2":{verdict:"yes",name:"硫酸铝钾（明矾）",formula:"KAl(SO4)2",note:["无色晶体（十二水合物为常见明矾）；净水剂（水解生成 Al(OH)₃ 胶体吸附杂质）。"],related:["Al2(SO4)3"],tags:[],
    redox:[{condition:"一般条件",behavior:"无显著氧化还原性",detail:"各离子均稳定"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 5.7g/100mL"}]},
  "Fe(SCN)3":{verdict:"yes",name:"硫氰化铁",formula:"Fe(SCN)3",note:["血红色配合物溶液；Fe³⁺ 与 SCN⁻ 的特征反应，用于检验 Fe³⁺。实际以 [Fe(SCN)]²⁺ 等形式存在。"],related:["Fe2(SO4)3"],tags:[],
    redox:[{condition:"一般条件",behavior:"氧化性",detail:"Fe³⁺ 可被还原为 Fe²⁺（红色褪去）"},
      {condition:"与还原剂",behavior:"氧化性",detail:"Fe³⁺ 被还原，血红色消失"}],
    solubility:[{solvent:"水",value:"可溶",note:"溶于水呈血红色"}]},
  "K3[Fe(CN)6]":{verdict:"yes",name:"铁氰化钾（赤血盐）",formula:"K3[Fe(CN)6",note:["红色晶体，与 Fe²⁺ 生成腾氏蓝沉淀（检验 Fe²⁺）。"],related:["K4[Fe(CN)6]"],tags:[],
    redox:[{condition:"与 Fe²⁺",behavior:"氧化性",detail:"Fe(III) 与 Fe²⁺ 生成滕氏蓝"},
      {condition:"一般条件",behavior:"氧化性",detail:"Fe(III) 配合物可被还原"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 33g/100mL"}]},
  "K4[Fe(CN)6]":{verdict:"yes",name:"亚铁氰化钾（黄血盐）",formula:"K4[Fe(CN)6",note:["黄色晶体，与 Fe³⁺ 生成普鲁士蓝沉淀（检验 Fe³⁺）。"],related:["K3[Fe(CN)6]"],tags:[],
    redox:[{condition:"与 Fe³⁺",behavior:"还原性",detail:"Fe(II) 与 Fe³⁺ 生成普鲁士蓝"},
      {condition:"一般条件",behavior:"还原性",detail:"Fe(II) 配合物可被氧化"}],
    solubility:[{solvent:"水",value:"可溶",note:"20°C 约 28g/100mL"}]},
  "NH3":{verdict:"yes",name:"氨",formula:"NH3",note:["刺激性气味气体，碱性，易溶于水成氨水；用于化肥与制冷。"],related:["NH4OH"],tags:["corrosive"],
    redox:[{condition:"与强氧化剂",behavior:"还原性",detail:"N(-3) 可被 Cl₂、CuO 等氧化为 N₂"},
      {condition:"催化氧化",behavior:"还原性",detail:"被催化氧化为 NO（制硝酸原理）"}],
    solubility:[{solvent:"水",value:"易溶",note:"20°C 约 53.7g/100mL（1:700 体积比），生成氨水"}]}
};

// 归一化：统一上标、去除空格、规范水合点
export function normalizeFormula(raw){
  let s = String(raw).trim();
  s = s.replace(/\s+/g,"");
  s = s.replace(/[·•・]/g,".");          // 各种中点 -> 小数点
  // 规范化电荷写法：统一为 ^[数字][符号] 形式（如 Fe^2+、(PO4)^3-、SO4^2-）
  // 支持：Fe2+ → Fe^2+、Fe+2 → Fe^2+、Fe^2+ 不变、Fe^+2 → Fe^2+
  //      (PO4)3- → (PO4)^3-、(PO4)^3- 不变、(PO4)^-3 → (PO4)^3-
  // 1) 已有 ^ 的：^+2 / ^-3 → ^2+ / ^3-（符号在前的统一为数字在前）
  s = s.replace(/\^([+-])(\d+)$/, "^$2$1");
  // 2) 无 ^ 的：末尾 N± / ±N / ± 补上 ^（排除已有 ^ 的情况）
  if (!/\^[\d+-]*[+-]$/.test(s)) {
    // Fe+2 / (PO4)-3 → Fe^2+ / (PO4)^3-（符号在前）
    s = s.replace(/([+-])(\d+)$/, "^$2$1");
    // 若上一步加了 ^，跳过；否则 Fe2+ / Cl- → Fe^2+ / Cl^-
    if (!/\^[\d+-]*[+-]$/.test(s)) {
      s = s.replace(/(\d+[+-]|[+-])$/, "^$1");
    }
  }
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
      // 上标电荷，支持格式：^+ ^- ^2+ ^3- ^+2 ^-3
      i++;
      let s="";
      while(i<src.length && /[+\-0-9]/.test(src[i])){ s+=src[i]; i++; }
      // 统一为 [数字][符号] 形式解析
      const m1=s.match(/^(\d*)([+-])$/);    // 2+ / 3- / + / -
      const m2=s.match(/^([+-])(\d+)$/);   // +2 / -3
      if(m1){
        const mag=m1[1]===""?1:parseInt(m1[1],10);
        tokens.push({t:"CHG",v:m1[2]==="+"?mag:-mag});
      } else if(m2){
        const mag=parseInt(m2[2],10);
        tokens.push({t:"CHG",v:m2[1]==="+"?mag:-mag});
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
  // 单质/同核分子（如 H2、O2、N2、Fe、S8）：元素以 0 价存在，天然电中性
  if(Object.keys(els).length===1){
    const sym=Object.keys(els)[0];
    return {balanced:true, charged:false, elemental:true, note:`这是 ${ELEMENTS[sym].zh} 的单质（或同核分子），元素呈 0 价，通常稳定存在。`};
  }
  // 带电离子：若整体电荷 != 0，则作为"物质"需与反离子结合
  if(parsed.charge!==0){
    return {balanced:true, charged:true, note:`该式表示一个带电离子（总电荷 ${parsed.charge>0?"+":""}${parsed.charge}），本身不是中性物质，需与带相反电荷的离子结合成盐/配合物。`};
  }
  // 计算"固定氧化态"元素贡献的净电荷
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
  // 多个变价元素：无法唯一判定，保守给出"可能存在（需具体结构）"
  return {balanced:true,charged:false,note:"含多个变价元素，无法仅凭化学式唯一确定氧化态；若实际结构中存在合理的氧化态组合使总电荷为零，则可能存在（如 Fe₃O₄ 为混合价）。"};
}

function fmtOS(x){ return x>0?("+"+x):(""+x); }

// ---------------------------------------------------------------------------
// 常见物质的颜色（按形态分类：固体/晶体/水溶液/气体等）
// form: 形态；color: 颜色；hex: 代表色值（用于前端色块）
// ---------------------------------------------------------------------------
export const COLORS = {
  // 铜系
  "Cu":      [{form:"固体",color:"紫红色",hex:"#b87333",ion:null}],
  "CuO":     [{form:"固体",color:"黑色",hex:"#1a1a1a",ion:null}],
  "Cu2O":    [{form:"固体",color:"砖红色",hex:"#a8322a",ion:null}],
  "CuSO4":   [{form:"无水固体",color:"白色",hex:"#f2f2f2",ion:null},{form:"水溶液",color:"蓝色",hex:"#1e6fd9",ion:"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺"}],
  "CuSO4.5H2O":[{form:"晶体",color:"蓝色",hex:"#2f7fe0",ion:"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺"},{form:"水溶液",color:"蓝色",hex:"#1e6fd9",ion:"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺"}],
  "CuCl2":   [{form:"固体",color:"棕黄色",hex:"#7a5a2b",ion:null},{form:"稀溶液",color:"蓝色",hex:"#2a7de1",ion:"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺"},{form:"浓溶液",color:"绿色",hex:"#2e8b57",ion:"Cu²⁺ 浓度高时 [Cu(H₂O)₄]²⁺ 与 [CuCl₄]²⁻ 共存"}],
  "Cu(OH)2": [{form:"固体",color:"蓝色",hex:"#3a7bd5",ion:"Cu²⁺"}],
  // 铁系
  "Fe":      [{form:"固体",color:"银白色",hex:"#c7ccd1",ion:null},{form:"粉末",color:"灰黑色",hex:"#4a4a4a",ion:null}],
  "FeO":     [{form:"固体",color:"黑色",hex:"#1a1a1a",ion:null}],
  "Fe2O3":   [{form:"固体",color:"红棕色",hex:"#a03d2a",ion:null}],
  "Fe3O4":   [{form:"固体",color:"黑色",hex:"#151515",ion:null}],
  "Fe(OH)2": [{form:"固体",color:"白色",hex:"#f4f4f0",ion:"Fe²⁺"},{form:"暴露空气",color:"灰绿→红褐",hex:"#7a6a55",ion:"Fe²⁺ 被氧化为 Fe³⁺"}],
  "Fe(OH)3": [{form:"固体/沉淀",color:"红褐色",hex:"#9c4a2a",ion:"Fe³⁺"}],
  "FeCl3":   [{form:"固体",color:"黑棕色",hex:"#3a2a20",ion:null},{form:"水溶液",color:"黄色",hex:"#d9a82e",ion:"Fe³⁺ 水解为 [Fe(H₂O)₆]³⁺（稀）/[Fe(H₂O)₅(OH)]²⁺（浓）"}],
  "FeSO4":   [{form:"水溶液",color:"浅绿色",hex:"#8fbf9f",ion:"Fe²⁺ 水合为 [Fe(H₂O)₆]²⁺"}],
  "FeS":     [{form:"固体",color:"黑色",hex:"#1c1c1c",ion:null}],
  "Fe(SCN)3":[{form:"水溶液",color:"血红色",hex:"#a0202a",ion:"Fe³⁺ 与 SCN⁻ 配位为 [Fe(SCN)]²⁺"}],
  // 锰/铬系
  "KMnO4":   [{form:"晶体",color:"紫黑色",hex:"#5b2a86",ion:"MnO₄⁻"},{form:"水溶液",color:"紫红色",hex:"#7a2a9e",ion:"MnO₄⁻"}],
  "K2MnO4":  [{form:"固体",color:"暗绿色",hex:"#2a5a3a",ion:"MnO₄²⁻"},{form:"水溶液",color:"绿色",hex:"#3a7a4a",ion:"MnO₄²⁻"}],
  "MnO2":    [{form:"固体",color:"黑色",hex:"#1a1a1a",ion:null}],
  "MnSO4":   [{form:"水溶液",color:"浅粉红色",hex:"#e8b8c8",ion:"Mn²⁺ 水合为 [Mn(H₂O)₆]²⁺"}],
  "K2Cr2O7": [{form:"固体/溶液",color:"橙红色",hex:"#d96a1e",ion:"Cr₂O₇²⁻"},{form:"酸性溶液",color:"橙红色",hex:"#d96a1e",ion:"Cr₂O₇²⁻"},{form:"碱性溶液",color:"黄色",hex:"#e8d44a",ion:"CrO₄²⁻"}],
  "K2CrO4":  [{form:"固体/溶液",color:"黄色",hex:"#e8d44a",ion:"CrO₄²⁻"}],
  "CrO3":    [{form:"固体",color:"暗红色",hex:"#8a1f1f",ion:null}],
  "CrCl3":   [{form:"水溶液",color:"紫色",hex:"#7a2a9e",ion:"Cr³⁺ 水合为 [Cr(H₂O)₆]³⁺"},{form:"浓溶液",color:"绿色",hex:"#2e8b57",ion:"Cr³⁺ 水解为 [Cr(H₂O)₅Cl]²⁺"}],
  "Cr2O3":   [{form:"固体",color:"绿色",hex:"#2e8b57",ion:null}],
  "Cr(OH)3": [{form:"沉淀",color:"灰绿色",hex:"#6a8a5a",ion:"Cr³⁺"}],
  // 镍/钴
  "NiSO4":   [{form:"水溶液",color:"绿色",hex:"#5aa05a",ion:"Ni²⁺ 水合为 [Ni(H₂O)₆]²⁺"}],
  "Ni(OH)2": [{form:"沉淀",color:"绿色",hex:"#5aa05a",ion:"Ni²⁺"}],
  "CoCl2":   [{form:"固体",color:"蓝色",hex:"#2a6fd9",ion:null},{form:"水溶液",color:"粉红色",hex:"#e8a8b8",ion:"Co²⁺ 水合为 [Co(H₂O)₆]²⁺"}],
  // 卤素及银盐
  "Cl2":     [{form:"气体",color:"黄绿色",hex:"#a8b820",ion:null}],
  "Br2":     [{form:"液体",color:"红棕色",hex:"#8a3a1a",ion:null},{form:"溴水",color:"橙黄色",hex:"#d98a2e",ion:null}],
  "I2":      [{form:"固体",color:"紫黑色",hex:"#4a2a5e",ion:null},{form:"碘水",color:"黄褐色",hex:"#a8763a",ion:null},{form:"CCl4 萃取液",color:"紫红色",hex:"#7a2a9e",ion:null}],
  "AgCl":    [{form:"沉淀",color:"白色",hex:"#f4f4f0",ion:null}],
  "AgBr":    [{form:"沉淀",color:"淡黄色",hex:"#efe6b8",ion:null}],
  "AgI":     [{form:"沉淀",color:"黄色",hex:"#e8d44a",ion:null}],
  "Ag2O":    [{form:"固体",color:"棕黑色",hex:"#3a2a20",ion:null}],
  "Ag3PO4":  [{form:"沉淀",color:"黄色",hex:"#e8d44a",ion:null}],
  "AgNO3":   [{form:"固体/溶液",color:"无色",hex:"#f6f6f2",ion:null}],
  "Ag2CrO4": [{form:"沉淀",color:"砖红色",hex:"#a8322a",ion:"CrO₄²⁻"}],
  // 其他常见
  "Na2O2":   [{form:"固体",color:"淡黄色",hex:"#f0e6a8",ion:null}],
  "S":       [{form:"固体",color:"淡黄色",hex:"#e8d44a",ion:null}],
  "BaSO4":   [{form:"沉淀",color:"白色",hex:"#f4f4f0",ion:null}],
  "CaCO3":   [{form:"固体/沉淀",color:"白色",hex:"#f4f4f0",ion:null}],
  "CaO":     [{form:"固体",color:"白色",hex:"#f4f4f0",ion:null}],
  "NO2":     [{form:"气体",color:"红棕色",hex:"#8a3a1a",ion:null}],
  "NO":      [{form:"气体",color:"无色",hex:"#f6f6f2",ion:null}],
  "N2O4":    [{form:"气体",color:"无色",hex:"#f6f6f2",ion:null}],
  "CO":      [{form:"气体",color:"无色",hex:"#f6f6f2",ion:null}],
  "CO2":     [{form:"气体",color:"无色",hex:"#f6f6f2",ion:null}],
  "NH3":     [{form:"气体",color:"无色",hex:"#f6f6f2",ion:null}],
  "H2O2":    [{form:"溶液",color:"无色",hex:"#f6f6f2",ion:null}],
  "PbI2":    [{form:"沉淀",color:"黄色",hex:"#e8d44a",ion:null}],
  "PbS":     [{form:"沉淀",color:"黑色",hex:"#1a1a1a",ion:null}],
  "ZnSO4":   [{form:"水溶液",color:"无色",hex:"#f6f6f2",ion:"Zn²⁺（d¹⁰ 无色）"}],
  "ZnS":     [{form:"沉淀",color:"白色",hex:"#f4f4f0",ion:null}],
  "Cu2S":    [{form:"固体",color:"黑色",hex:"#1a1a1a",ion:null}],
  "CuS":     [{form:"沉淀",color:"黑色",hex:"#1a1a1a",ion:null}],
  "Fe2(SO4)3":[{form:"水溶液",color:"黄色",hex:"#d9a82e",ion:"Fe³⁺"}],
  "HgI2":    [{form:"固体",color:"红色",hex:"#c8202a",ion:null},{form:"加热变体",color:"黄色",hex:"#e8d44a",ion:null}],
  "PbO":     [{form:"固体",color:"黄色",hex:"#e8d44a",ion:null}],
  "PbO2":    [{form:"固体",color:"棕褐色",hex:"#5a3a2a",ion:null}],
  "V2O5":    [{form:"固体",color:"橙黄色",hex:"#d98a2e",ion:null}],
  "Ag2S":    [{form:"沉淀",color:"黑色",hex:"#1a1a1a",ion:null}],
  "BaCl2":   [{form:"水溶液",color:"无色",hex:"#f6f6f2",ion:"Ba²⁺（无色）"}],
  "NaCl":    [{form:"固体/溶液",color:"无色",hex:"#f6f6f2",ion:null}],
  "KCl":     [{form:"固体/溶液",color:"无色",hex:"#f6f6f2",ion:null}],
  "Na2SO4":  [{form:"固体/溶液",color:"无色",hex:"#f6f6f2",ion:null}],
  "K2SO4":   [{form:"固体/溶液",color:"无色",hex:"#f6f6f2",ion:null}]
};

// ---------------------------------------------------------------------------
// 酸根 / 官能团结构检测（按元素组成识别常见含氧酸根，供展示）
// ---------------------------------------------------------------------------
export function detectRadical(parsed){
  const c = parsed.elements || {};
  const get = (s)=>c[s]||0;
  if(get("S")===1 && get("O")===4) return {cn:"含硫酸根 SO₄²⁻ 结构",en:"Sulfate SO₄²⁻"};
  if(get("S")===1 && get("O")===3) return {cn:"含亚硫酸根 SO₃²⁻ 结构",en:"Sulfite SO₃²⁻"};
  if(get("N")===1 && get("O")===3) return {cn:"含硝酸根 NO₃⁻ 结构",en:"Nitrate NO₃⁻"};
  if(get("N")===1 && get("O")===2) return {cn:"含亚硝酸根 NO₂⁻ 结构",en:"Nitrite NO₂⁻"};
  if(get("P")===1 && get("O")===4) return {cn:"含磷酸根 PO₄³⁻ 结构",en:"Phosphate PO₄³⁻"};
  if(get("Cl")===1 && get("O")===4) return {cn:"含高氯酸根 ClO₄⁻ 结构",en:"Perchlorate ClO₄⁻"};
  if(get("Cl")===1 && get("O")===3) return {cn:"含氯酸根 ClO₃⁻ 结构",en:"Chlorate ClO₃⁻"};
  if(get("Cl")===1 && get("O")===2) return {cn:"含亚氯酸根 ClO₂⁻ 结构",en:"Chlorite ClO₂⁻"};
  if(get("Cl")===1 && get("O")===1) return {cn:"含次氯酸根 ClO⁻ 结构",en:"Hypochlorite ClO⁻"};
  if(get("C")===1 && get("O")===3) return {cn:"含碳酸根 CO₃²⁻ 结构",en:"Carbonate CO₃²⁻"};
  if(get("Mn")===1 && get("O")===4) return {cn:"含高锰酸根 MnO₄⁻ 结构",en:"Permanganate MnO₄⁻"};
  if(get("Cr")===1 && get("O")===4) return {cn:"含铬酸根 CrO₄²⁻ 结构",en:"Chromate CrO₄²⁻"};
  if(get("Br")===1 && get("O")===3) return {cn:"含溴酸根 BrO₃⁻ 结构",en:"Bromate BrO₃⁻"};
  if(get("I")===1 && get("O")===3) return {cn:"含碘酸根 IO₃⁻ 结构",en:"Iodate IO₃⁻"};
  if(get("I")===1 && get("O")===4) return {cn:"含高碘酸根 IO₄⁻ 结构",en:"Periodate IO₄⁻"};
  return null;
}

// ---------------------------------------------------------------------------
// 主分析：综合知识库 + 规则
// ---------------------------------------------------------------------------
export function analyze(raw){
  const parsed=parseFormula(normalizeFormula(raw));
  if(!parsed.ok){
    return {ok:false,input:raw,error:parsed.error,verdict:null};
  }
  const normKey = canonicalKey(parsed);
  const known = KNOWNS[normKey] || KNOWNS[parsed.raw] || KNOWNS[parsed.raw.replace(/\./g,".")];
  const rule = ruleCheck(parsed);

  let verdict, confidence, notes=[], tags=[], name=null, related=[];
  let redox = null, solubility = null;
  if(known){
    verdict = known.verdict;
    confidence = "high";
    name = known.name;
    notes = known.note.slice();
    tags = known.tags.slice();
    related = known.related.slice();
    redox = known.redox || null;
    solubility = known.solubility || null;
  } else {
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
    verdict,
    confidence,
    notes,
    warnings:buildWarnings(tags,known),
    tags,
    related,
    colors: (known && known.colors) || COLORS[normKey] || COLORS[parsed.raw] || null,
    redox,
    solubility,
    radical: detectRadical(parsed),
    ruleNote: rule.note
  };
}

function canonicalKey(parsed){
  const els=parsed.elements;
  const keys=Object.keys(els).sort();
  const parts = parsed.parts||[];
  if(parts.length>1){
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

function guessName(parsed){
  const els=parsed.elements;
  const keys=Object.keys(els);
  if(keys.length===1) return ELEMENTS[keys[0]].zh;
  const metals=keys.filter(s=>ELEMENTS[s].metal);
  const nonmetals=keys.filter(s=>!ELEMENTS[s].metal);
  if(metals.length===1 && nonmetals.length===1){
    return ELEMENTS[nonmetals[0]].zh + "化" + ELEMENTS[metals[0]].zh;
  }
  return null;
}

export function verdictText(v){
  return {
    yes:"✅ 稳定存在",
    conditional:"🟡 仅特定条件下存在",
    unstable:"🟠 可生成但极不稳定/易分解",
    no:"❌ 通常不存在 / 不可能"
  }[v] || v;
}

export const TEMPLATES = [
  {label:"( )",ins:"()",type:"wrap"},
  {label:"[ ]",ins:"[]",type:"wrap"},
  {label:"·",ins:"·",type:"ins"},
  {label:"OH⁻",ins:"(OH)^-",type:"ins"},
  {label:"SO₄²⁻",ins:"(SO4)^2-",type:"ins"},
  {label:"CO₃²⁻",ins:"(CO3)^2-",type:"ins"},
  {label:"NO₃⁻",ins:"(NO3)^-",type:"ins"},
  {label:"NH₄⁺",ins:"(NH4)^+",type:"ins"},
  {label:"PO₄³⁻",ins:"(PO4)^3-",type:"ins"},
  {label:"H₂O",ins:"H2O",type:"ins"},
  {label:"²⁺",ins:"^2+",type:"ins"},
  {label:"³⁺",ins:"^3+",type:"ins"},
  {label:"³⁻",ins:"^3-",type:"ins"},
  {label:"⁻",ins:"^-",type:"ins"}
];

export function prettyFormula(text){
  const subMap={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"};
  const supMap={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻"};
  const toSub = (s)=>s.split("").map(d=>subMap[d]||d).join("");
  const toSup = (s)=>s.split("").map(d=>supMap[d]||d).join("");
  let s = String(text);
  // 先把电荷部分提取出来（^2+ / ^3- / ^+2 / ^-3 / ^+ / ^-），单独转上标
  let chargePart = "";
  s = s.replace(/\^([+-]?\d*[+-]?)$/, (m, body) => {
    // 规范化 body 为 [数字][符号]
    let num="", sign="";
    const m1=body.match(/^(\d*)([+-])$/);   // 2+ / 3- / + / -
    const m2=body.match(/^([+-])(\d+)$/);    // +2 / -3
    if(m1){ num=m1[1]; sign=m1[2]; }
    else if(m2){ num=m2[2]; sign=m2[1]; }
    else { chargePart=""; return m; }
    chargePart = (num?toSup(num):"") + supMap[sign];
    return "\x00CHARGE\x00";  // 占位符，避免后续被当数字处理
  });
  // 处理水合点
  s = s.replace(/\./g,"·");
  // 数字 → 下标，但水合点后的系数不下标（如 CuSO4·5H2O → CuSO₄·5H₂O，5 不下标）
  s = s.replace(/(\d+)/g, (match, _grp, offset, string) => {
    const before = string[offset - 1];
    if (before === "·") return match;  // 水合系数不下标
    return toSub(match);
  });
  // 恢复电荷上标
  s = s.replace(/\x00CHARGE\x00/g, chargePart);
  return s;
}