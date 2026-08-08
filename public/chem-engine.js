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
  "AgOH":{    "verdict":"unstable",    "name":{      "cn":"氢氧化银",      "en":"Silver hydroxide"},    "formula":"AgOH",    "note":[
      {        "cn":"氢氧化银在水中几乎不能独立存在：一旦生成（Ag⁺ + OH⁻）立即脱水生成棕黑色的氧化银 Ag₂O（2AgOH → Ag₂O + H₂O）。",        "en":"Silver hydroxide cannot exist independently in water: once formed (Ag⁺ + OH⁻) it immediately dehydrates to brownish-black silver oxide Ag₂O (2AgOH → Ag₂O + H₂O)."},
      {        "cn":"只在极低温、极稀溶液中可瞬时存在；在空气中、光照或受热时迅速转化为 Ag₂O，并可能进一步被氧化/分解。",        "en":"It can only exist momentarily in extremely cold, dilute solutions; in air, under light or heat, it rapidly converts to Ag₂O and may be further oxidized/decomposed."},
      {        "cn":"因此通常不说“制得氢氧化银”，而是得到氧化银沉淀。",        "en":"Therefore one typically does not 'obtain silver hydroxide' but rather silver oxide precipitate."}
    ],    "related":[
      "Ag2O"
    ],    "tags":[
      "unstable",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在水中",          "en":"in water"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"极不稳定，立即脱水为 Ag₂O",          "en":"Extremely unstable, immediately dehydrates to Ag₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"生成即分解为 Ag₂O",          "en":"Decomposes to Ag₂O upon formation"}}
    ]},
  "AuOH":{    "verdict":"unstable",    "name":{      "cn":"氢氧化金(I)",      "en":"Gold(I) hydroxide"},    "formula":"AuOH",    "note":[
      {        "cn":"金(I)的氢氧化物极不稳定，生成即歧化/脱水为 Au₂O（并析出 Au）。实际以 Au₂O₃·xH₂O（水合氧化金）形式存在。",        "en":"Gold(I) hydroxide is extremely unstable; upon formation it disproportionates/dehydrates to Au₂O (with precipitation of Au). It actually exists as Au₂O₃·xH₂O (hydrated gold oxide)."}
    ],    "related":[
      "Au2O3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"生成时",          "en":"upon formation"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"Au⁺ 歧化为 Au³⁺ 与 Au 单质",          "en":"Au⁺ disproportionates to Au³⁺ and Au metal"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"生成即分解",          "en":"Decomposes upon formation"}}
    ]},
  "Au(OH)3":{    "verdict":"conditional",    "name":{      "cn":"氢氧化金(III)",      "en":"Gold(III) hydroxide"},    "formula":"Au(OH)3",    "note":[
      {        "cn":"游离的 Au(OH)₃ 并不稳定，实际多以水合氧化物 Au₂O₃·xH₂O 形式存在；是两性偏酸物质，溶于强碱生成金酸盐。",        "en":"Free Au(OH)₃ is not stable; it mostly exists as hydrated oxide Au₂O₃·xH₂O. It is amphoteric (leaning acidic), dissolving in strong bases to form aurate."}
    ],    "related":[
      "Au2O3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Au(III) 可被还原为 Au 单质",          "en":"Au(III) can be reduced to Au metal"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"以水合氧化物形式存在",          "en":"Exists as hydrated oxide"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成金酸盐 AuO₂⁻",          "en":"Forms aurate AuO₂⁻"}}
    ]},
  "Fe(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化亚铁",      "en":"Iron(II) hydroxide"},    "formula":"Fe(OH)2",    "note":[
      {        "cn":"白色沉淀，极易被空气氧化：先变灰绿色，最终生成红褐色的水合氧化铁 Fe(OH)₃（实际为 Fe₂O₃·xH₂O）。",        "en":"White precipitate, extremely easily oxidized by air: first turns gray-green, ultimately forming reddish-brown hydrated iron(III) hydroxide Fe(OH)₃ (actually Fe₂O₃·xH₂O)."},
      {        "cn":"制取与保存需在隔绝空气（如煮沸除氧的水、惰性气氛）下进行。",        "en":"Preparation and storage must be done under air-free conditions (e.g., oxygen-free boiled water, inert atmosphere)."}
    ],    "related":[
      "Fe(OH)3",
      "FeO",
      "Fe3O4"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Fe²⁺ 被氧化为 Fe³⁺，生成 Fe(OH)₃",          "en":"Fe²⁺ is oxidized to Fe³⁺, forming Fe(OH)₃"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被 KMnO₄、HNO₃ 等氧化为 Fe³⁺",          "en":"Can be oxidized to Fe³⁺ by KMnO₄, HNO₃, etc."}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 4.87×10⁻¹⁷",          "en":"Ksp ≈ 4.87×10⁻¹⁷"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Fe²⁺",          "en":"Forms Fe²⁺"}}
    ]},
  "Fe(OH)3":{    "verdict":"yes",    "name":{      "cn":"氢氧化铁",      "en":"Iron(III) hydroxide"},    "formula":"Fe(OH)3",    "note":[
      {        "cn":"红褐色沉淀，受热或久置脱水生成 Fe₂O₃·xH₂O（铁红）；本身并非严格化学计量物，常以水合氧化铁形式存在。",        "en":"Reddish-brown precipitate; dehydrates on heating or prolonged standing to Fe₂O₃·xH₂O (iron red). It is not strictly stoichiometric and often exists as hydrated iron oxide."}
    ],    "related":[
      "Fe2O3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Fe³⁺ 较稳定，强还原剂可还原为 Fe²⁺",          "en":"Fe³⁺ is relatively stable; strong reducing agents can reduce it to Fe²⁺"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 2.79×10⁻³⁹",          "en":"Ksp ≈ 2.79×10⁻³⁹"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Fe³⁺",          "en":"Forms Fe³⁺"}}
    ]},
  "Cu(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化铜",      "en":"Copper(II) hydroxide"},    "formula":"Cu(OH)2",    "note":[
      {        "cn":"蓝色沉淀；加热或久置分解为黑色 CuO（Cu(OH)₂ → CuO + H₂O）。",        "en":"Blue precipitate; decomposes to black CuO on heating or prolonged standing (Cu(OH)₂ → CuO + H₂O)."},
      {        "cn":"溶于氨水形成深蓝色 [Cu(NH₃)₄]²⁺ 配离子；与葡萄糖等还原糖共热生成砖红色 Cu₂O（斐林/班氏试剂原理）。",        "en":"Dissolves in ammonia to form deep blue [Cu(NH₃)₄]²⁺ complex ion; when heated with reducing sugars such as glucose, forms brick-red Cu₂O (principle of Fehling's/Benedict's reagent)."}
    ],    "related":[
      "CuO",
      "Cu2O"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"与还原糖共热",          "en":"heated with reducing sugars"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cu²⁺ 被还原为 Cu₂O",          "en":"Cu²⁺ is reduced to Cu₂O"}},
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 CuO + H₂O",          "en":"Decomposes to CuO + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 2.2×10⁻²⁰",          "en":"Ksp ≈ 2.2×10⁻²⁰"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Cu²⁺",          "en":"Forms Cu²⁺"}},
      {        "solvent":{          "cn":"氨水",          "en":"ammonia water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Cu(NH₃)₄]²⁺",          "en":"Forms [Cu(NH₃)₄]²⁺"}}
    ]},
  "Mn(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化锰(II)",      "en":"Manganese(II) hydroxide"},    "formula":"Mn(OH)2",    "note":[
      {        "cn":"白色沉淀，在空气中迅速被氧化为棕黑色的 MnO(OH)₂ / MnO₂ 水合物。",        "en":"White precipitate, rapidly oxidized in air to brownish-black MnO(OH)₂ / MnO₂ hydrate."}
    ],    "related":[
      "MnO2"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Mn²⁺ 被氧化为 Mn(IV) 的 MnO(OH)₂",          "en":"Mn²⁺ is oxidized to Mn(IV) as MnO(OH)₂"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被氧化为 MnO₂ 或更高价态",          "en":"Can be oxidized to MnO₂ or higher oxidation states"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 1.6×10⁻¹³",          "en":"Ksp ≈ 1.6×10⁻¹³"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Mn²⁺",          "en":"Forms Mn²⁺"}}
    ]},
  "Co(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化钴(II)",      "en":"Cobalt(II) hydroxide"},    "formula":"Co(OH)2",    "note":[
      {        "cn":"粉红色/蓝色沉淀，在空气中可被氧化为棕褐色的 Co(OH)₃（实际常以 CoO(OH) 形式）。",        "en":"Pink/blue precipitate; can be oxidized in air to brownish Co(OH)₃ (often as CoO(OH))."}
    ],    "related":[
      "Co(OH)3"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Co²⁺ 缓慢氧化为 Co³⁺",          "en":"Co²⁺ is slowly oxidized to Co³⁺"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被 Cl₂、NaClO 等氧化为 CoO(OH)",          "en":"Can be oxidized to CoO(OH) by Cl₂, NaClO, etc."}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 1.6×10⁻¹⁵",          "en":"Ksp ≈ 1.6×10⁻¹⁵"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Co²⁺",          "en":"Forms Co²⁺"}}
    ]},
  "Ni(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化镍(II)",      "en":"Nickel(II) hydroxide"},    "formula":"Ni(OH)2",    "note":[
      {        "cn":"苹果绿色沉淀，可被强氧化剂（如 NaClO）氧化为黑色的 NiO(OH)，是镍氢/镍镉电池正极反应。",        "en":"Apple-green precipitate; can be oxidized by strong oxidants (e.g., NaClO) to black NiO(OH), which is the positive electrode reaction in nickel-hydrogen/nickel-cadmium batteries."}
    ],    "related":[
      "NiO(OH)"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Ni²⁺ 被氧化为 Ni³⁺ 的 NiO(OH)",          "en":"Ni²⁺ is oxidized to Ni³⁺ as NiO(OH)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 5.5×10⁻¹⁶",          "en":"Ksp ≈ 5.5×10⁻¹⁶"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Ni²⁺",          "en":"Forms Ni²⁺"}}
    ]},
  "Cr(OH)3":{    "verdict":"yes",    "name":{      "cn":"氢氧化铬(III)",      "en":"Chromium(III) hydroxide"},    "formula":"Cr(OH)3",    "note":[
      {        "cn":"灰绿色两性氢氧化物：溶于酸生成 Cr³⁺，溶于强碱生成亮绿色的 [Cr(OH)₄]⁻（亚铬酸盐）。",        "en":"Gray-green amphoteric hydroxide: dissolves in acid to form Cr³⁺, dissolves in strong base to form bright green [Cr(OH)₄]⁻ (chromite)."}
    ],    "related":[
      "Cr2O3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"在碱性条件下",          "en":"under alkaline conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Cr(III) 可被 H₂O₂、NaClO 等氧化为 Cr(VI) 的 CrO₄²⁻",          "en":"Cr(III) can be oxidized to Cr(VI) as CrO₄²⁻ by H₂O₂, NaClO, etc."}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Cr³⁺ 较稳定",          "en":"Cr³⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 6.3×10⁻³¹",          "en":"Ksp ≈ 6.3×10⁻³¹"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Cr³⁺",          "en":"Forms Cr³⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Cr(OH)₄]⁻",          "en":"Forms [Cr(OH)₄]⁻"}}
    ]},
  "Hg2(OH)2":{    "verdict":"no",    "name":{      "cn":"（亚汞）氢氧化汞(I)",      "en":"Mercury(I) hydroxide"},    "formula":"Hg2(OH)2",    "note":[
      {        "cn":"亚汞离子 Hg₂²⁺ 的氢氧化物并不存在：生成时立即歧化分解为 Hg（液态）与 HgO。",        "en":"The hydroxide of mercurous ion Hg₂²⁺ does not exist: upon formation it immediately disproportionates into Hg (liquid) and HgO."},
      {        "cn":"因此 Hg₂²⁺ 盐的溶液加碱得到的是 Hg + HgO 混合物，而非 Hg₂(OH)₂。",        "en":"Therefore, adding base to Hg₂²⁺ salt solutions yields a mixture of Hg + HgO, not Hg₂(OH)₂."}
    ],    "related":[
      "HgO",
      "Hg"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"生成时",          "en":"upon formation"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"Hg₂²⁺ 歧化为 Hg 与 HgO",          "en":"Hg₂²⁺ disproportionates to Hg and HgO"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"无法独立存在，立即歧化分解",          "en":"Cannot exist independently; immediately disproportionates"}}
    ]},
  "Pb(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化铅(II)",      "en":"Lead(II) hydroxide"},    "formula":"Pb(OH)2",    "note":[
      {        "cn":"白色两性氢氧化物：溶于酸生成 Pb²⁺，溶于强碱生成 [Pb(OH)₃]⁻ / [Pb(OH)₄]²⁻。",        "en":"White amphoteric hydroxide: dissolves in acid to form Pb²⁺, dissolves in strong base to form [Pb(OH)₃]⁻ / [Pb(OH)₄]²⁻."},
      {        "cn":"铅化合物均有毒，操作需谨慎。",        "en":"All lead compounds are toxic; handle with care."}
    ],    "related":[
      "PbO"
    ],    "tags":[
      "toxic",
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Pb²⁺ 较稳定",          "en":"Pb²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 1.2×10⁻¹⁵",          "en":"Ksp ≈ 1.2×10⁻¹⁵"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Pb²⁺",          "en":"Forms Pb²⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成亚铅酸根",          "en":"Forms plumbite"}}
    ]},
  "Zn(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化锌",      "en":"Zinc hydroxide"},    "formula":"Zn(OH)2",    "note":[
      {        "cn":"白色两性氢氧化物：溶于酸生成 Zn²⁺，溶于过量强碱生成 [Zn(OH)₄]²⁻（锌酸盐）。",        "en":"White amphoteric hydroxide: dissolves in acid to form Zn²⁺, dissolves in excess strong base to form [Zn(OH)₄]²⁻ (zincate)."}
    ],    "related":[
      "ZnO"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Zn²⁺ 稳定，不易被氧化或还原",          "en":"Zn²⁺ is stable, not easily oxidized or reduced"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 3×10⁻¹⁷",          "en":"Ksp ≈ 3×10⁻¹⁷"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Zn²⁺",          "en":"Forms Zn²⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Zn(OH)₄]²⁻",          "en":"Forms [Zn(OH)₄]²⁻"}}
    ]},
  "Al(OH)3":{    "verdict":"yes",    "name":{      "cn":"氢氧化铝",      "en":"Aluminum hydroxide"},    "formula":"Al(OH)3",    "note":[
      {        "cn":"白色胶状沉淀，典型两性氢氧化物：溶于酸生成 Al³⁺，溶于强碱生成 [Al(OH)₄]⁻（偏铝酸盐）。",        "en":"White gelatinous precipitate, a typical amphoteric hydroxide: dissolves in acid to form Al³⁺, dissolves in strong base to form [Al(OH)₄]⁻ (aluminate)."},
      {        "cn":"不溶于过量氨水（借此可与 Zn²⁺ 等分离）。",        "en":"Insoluble in excess ammonia (can be used to separate from Zn²⁺, etc.)."}
    ],    "related":[
      "Al2O3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Al³⁺ 极稳定",          "en":"Al³⁺ is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 3×10⁻³⁴",          "en":"Ksp ≈ 3×10⁻³⁴"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Al³⁺",          "en":"Forms Al³⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Al(OH)₄]⁻",          "en":"Forms [Al(OH)₄]⁻"}}
    ]},
  "Sn(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化亚锡",      "en":"Tin(II) hydroxide"},    "formula":"Sn(OH)2",    "note":[
      {        "cn":"白色两性氢氧化物，易被空气氧化；溶于酸生成 Sn²⁺，溶于强碱生成亚锡酸盐。",        "en":"White amphoteric hydroxide, easily oxidized by air; dissolves in acid to form Sn²⁺, dissolves in strong base to form stannite."}
    ],    "related":[
      "SnO"
    ],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Sn²⁺ 被氧化为 Sn⁴⁺",          "en":"Sn²⁺ is oxidized to Sn⁴⁺"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可还原 HgCl₂ 为 Hg（检验 Sn²⁺）",          "en":"Can reduce HgCl₂ to Hg (test for Sn²⁺)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"两性氢氧化物",          "en":"Amphoteric hydroxide"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Sn²⁺",          "en":"Forms Sn²⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成亚锡酸根",          "en":"Forms stannite"}}
    ]},
  "Bi(OH)3":{    "verdict":"yes",    "name":{      "cn":"氢氧化铋",      "en":"Bismuth hydroxide"},    "formula":"Bi(OH)3",    "note":[
      {        "cn":"白色沉淀，几乎不显两性（Bi³⁺ 碱性较强）；强氧化下可生成铋酸盐，但游离 Bi(OH)₃ 不稳定、易脱水。",        "en":"White precipitate, barely amphoteric (Bi³⁺ is strongly basic); under strong oxidation can form bismuthate, but free Bi(OH)₃ is unstable and easily dehydrates."}
    ],    "related":[
      "Bi2O3"
    ],    "tags":[
      "unstable",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Bi(III) 可被氧化为 Bi(V) 铋酸盐",          "en":"Bi(III) can be oxidized to Bi(V) bismuthate"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Bi³⁺ 较稳定",          "en":"Bi³⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"碱性较强，不显两性",          "en":"Strongly basic, not amphoteric"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Bi³⁺",          "en":"Forms Bi³⁺"}}
    ]},
  "Mg(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化镁",      "en":"Magnesium hydroxide"},    "formula":"Mg(OH)2",    "note":[
      {        "cn":"白色难溶氢氧化物（镁乳），中强碱；加热分解为 MgO。可溶于铵盐溶液（因 NH₄⁺ 消耗 OH⁻）。",        "en":"White sparingly soluble hydroxide (milk of magnesia), a moderately strong base; decomposes to MgO on heating. Dissolves in ammonium salt solutions (NH₄⁺ consumes OH⁻)."}
    ],    "related":[
      "MgO"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mg²⁺ 极稳定",          "en":"Mg²⁺ is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"Ksp 约 5.6×10⁻¹²",          "en":"Ksp ≈ 5.6×10⁻¹²"}},
      {        "solvent":{          "cn":"铵盐溶液",          "en":"ammonium salt solution"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"NH₄⁺ 消耗 OH⁻ 促进溶解",          "en":"NH₄⁺ consumes OH⁻ promoting dissolution"}}
    ]},
  "Ca(OH)2":{    "verdict":"yes",    "name":{      "cn":"氢氧化钙",      "en":"Calcium hydroxide"},    "formula":"Ca(OH)2",    "note":[
      {        "cn":"熟石灰/消石灰，微溶于水（石灰水）；溶解度随温度升高而下降。强碱，用于建筑、中和酸性土壤。",        "en":"Slaked lime, slightly soluble in water (limewater); solubility decreases with increasing temperature. Strong base, used in construction and neutralizing acidic soil."}
    ],    "related":[
      "CaO"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ca²⁺ 极稳定",          "en":"Ca²⁺ is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 0.165g/100mL，温度升高溶解度下降",          "en":"~0.165g/100mL at 20°C; solubility decreases with temperature"}}
    ]},
  "NaOH":{    "verdict":"yes",    "name":{      "cn":"氢氧化钠",      "en":"Sodium hydroxide"},    "formula":"NaOH",    "note":[
      {        "cn":"烧碱，强碱，易潮解并吸收 CO₂ 变质为 Na₂CO₃；具强腐蚀性，溶于水剧烈放热。",        "en":"Caustic soda, strong base, easily deliquesces and absorbs CO₂ to form Na₂CO₃; strongly corrosive, dissolves in water with vigorous heat release."}
    ],    "related":[
      "Na2CO3"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 极稳定",          "en":"Na⁺ is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 109g/100mL，溶解放热",          "en":"~109g/100mL at 20°C, exothermic dissolution"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "KOH":{    "verdict":"yes",    "name":{      "cn":"氢氧化钾",      "en":"Potassium hydroxide"},    "formula":"KOH",    "note":[
      {        "cn":"强碱，性质类似 NaOH，易潮解、腐蚀；常用于制钾盐与碱性电池电解液。",        "en":"Strong base, properties similar to NaOH, easily deliquesces and corrosive; commonly used to make potassium salts and alkaline battery electrolyte."}
    ],    "related":[],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"K⁺ 极稳定",          "en":"K⁺ is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 112g/100mL，溶解放热",          "en":"~112g/100mL at 20°C, exothermic dissolution"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "NH4OH":{    "verdict":"conditional",    "name":{      "cn":"氢氧化铵（氨水）",      "en":"Ammonium hydroxide (ammonia water)"},    "formula":"NH4OH",    "note":[
      {        "cn":"“氢氧化铵 NH₄OH”是旧写法；实际溶液中并不存在独立的 NH₄OH 分子，而是 NH₃·H₂O（一水合氨）与少量 NH₄⁺、OH⁻ 的平衡体系。",        "en":"'Ammonium hydroxide NH₄OH' is an old notation; in actual solution there is no independent NH₄OH molecule, but rather an equilibrium system of NH₃·H₂O (ammonia monohydrate) with small amounts of NH₄⁺ and OH⁻."},
      {        "cn":"市售“氨水”即 NH₃ 的水溶液。",        "en":"Commercially available 'ammonia water' is an aqueous solution of NH₃."}
    ],    "related":[
      "NH3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"NH₃/NH₄⁺ 中 N 为 -3 价，可被强氧化剂氧化为 N₂",          "en":"N in NH₃/NH₄⁺ is -3, can be oxidized to N₂ by strong oxidants"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"NH₃ 极易溶于水，以 NH₃·H₂O 形式存在",          "en":"NH₃ is highly soluble in water, existing as NH₃·H₂O"}}
    ]},
  "H2CO3":{    "verdict":"conditional",    "name":{      "cn":"碳酸",      "en":"Carbonic acid"},    "formula":"H2CO3",    "note":[
      {        "cn":"碳酸只能在水中存在，无法分离出纯品：浓度稍高或受热即分解为 CO₂ + H₂O。",        "en":"Carbonic acid can only exist in water and cannot be isolated pure: at slightly higher concentrations or upon heating it decomposes to CO₂ + H₂O."},
      {        "cn":"其盐（碳酸盐）非常稳定且广泛存在。",        "en":"Its salts (carbonates) are very stable and widespread."}
    ],    "related":[
      "CO2",
      "Na2CO3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"C(IV) 较稳定",          "en":"C(IV) is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"仅存于水溶液，浓度低，受热分解",          "en":"Exists only in aqueous solution, low concentration, decomposes on heating"}}
    ]},
  "H2SO3":{    "verdict":"conditional",    "name":{      "cn":"亚硫酸",      "en":"Sulfurous acid"},    "formula":"H2SO3",    "note":[
      {        "cn":"仅存在于水溶液，游离态分解为 SO₂ + H₂O；是中等强度酸，有还原性（易被氧化为硫酸）。",        "en":"Exists only in aqueous solution; free form decomposes to SO₂ + H₂O. It is a moderately strong acid with reducing properties (easily oxidized to sulfuric acid)."}
    ],    "related":[
      "SO2",
      "H2SO4"
    ],    "tags":[
      "unstable",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S(IV) 被氧化为 S(VI) 的硫酸",          "en":"S(IV) is oxidized to S(VI) as sulfuric acid"}},
      {        "condition":{          "cn":"与强还原剂",          "en":"with strong reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 S 或 H₂S",          "en":"Can be reduced to S or H₂S"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"仅存于水溶液，由 SO₂ 溶于水生成",          "en":"Exists only in aqueous solution, formed by dissolving SO₂ in water"}}
    ]},
  "HClO":{    "verdict":"conditional",    "name":{      "cn":"次氯酸",      "en":"Hypochlorous acid"},    "formula":"HClO",    "note":[
      {        "cn":"极不稳定的弱酸，见光迅速分解：2HClO → 2HCl + O₂。其盐（次氯酸盐，如 NaClO）稳定且常用作漂白/消毒。",        "en":"Extremely unstable weak acid, rapidly decomposes in light: 2HClO → 2HCl + O₂. Its salts (hypochlorites, e.g., NaClO) are stable and commonly used for bleaching/disinfection."}
    ],    "related":[
      "NaClO"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 HCl + O₂",          "en":"Decomposes to HCl + O₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(I) 是强氧化剂，可氧化多种物质",          "en":"Cl(I) is a strong oxidant, can oxidize many substances"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"仅存于水溶液，见光分解",          "en":"Exists only in aqueous solution, decomposes in light"}}
    ]},
  "HClO2":{    "verdict":"conditional",    "name":{      "cn":"亚氯酸",      "en":"Chlorous acid"},    "formula":"HClO2",    "note":[
      {        "cn":"不稳定中强酸，易分解；其盐（亚氯酸盐）可作漂白剂。",        "en":"Unstable moderately strong acid, easily decomposes; its salts (chlorites) can be used as bleaching agents."}
    ],    "related":[],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"Cl(III) 易歧化为 Cl⁻ 与 ClO₃⁻",          "en":"Cl(III) easily disproportionates to Cl⁻ and ClO₃⁻"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可氧化多种还原性物质",          "en":"Can oxidize many reducing substances"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"仅存于水溶液，不稳定",          "en":"Exists only in aqueous solution, unstable"}}
    ]},
  "HClO3":{    "verdict":"yes",    "name":{      "cn":"氯酸",      "en":"Chloric acid"},    "formula":"HClO3",    "note":[
      {        "cn":"不稳定强酸，浓缩或受热易分解甚至爆炸；其盐（氯酸盐，如 KClO₃）是强氧化剂。",        "en":"Unstable strong acid, easily decomposes or even explodes when concentrated or heated; its salts (chlorates, e.g., KClO₃) are strong oxidants."}
    ],    "related":[
      "KClO3"
    ],    "tags":[
      "unstable",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"浓缩或受热",          "en":"concentrated or heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 HClO₄ + ClO₂ + H₂O",          "en":"Decomposes to HClO₄ + ClO₂ + H₂O"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(V) 是强氧化剂",          "en":"Cl(V) is a strong oxidant"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"仅存于稀水溶液，浓缩即分解",          "en":"Exists only in dilute aqueous solution, decomposes when concentrated"}}
    ]},
  "HClO4":{    "verdict":"yes",    "name":{      "cn":"高氯酸",      "en":"Perchloric acid"},    "formula":"HClO4",    "note":[
      {        "cn":"已知最强无机酸之一；稀溶液较稳定，但浓高氯酸是强氧化剂，与有机物接触有爆炸危险。",        "en":"One of the strongest known inorganic acids; dilute solutions are relatively stable, but concentrated perchloric acid is a strong oxidant and poses explosion risk with organic matter."}
    ],    "related":[],    "tags":[
      "corrosive",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"浓溶液",          "en":"concentrated solution"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(VII) 强氧化，与有机物接触爆炸",          "en":"Cl(VII) is strongly oxidizing; explodes on contact with organic matter"}},
      {        "condition":{          "cn":"稀溶液",          "en":"dilute solution"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"稀溶液较稳定",          "en":"Dilute solution is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"可与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "H2S2O3":{    "verdict":"no",    "name":{      "cn":"硫代硫酸（游离）",      "en":"Thiosulfuric acid (free)"},    "formula":"H2S2O3",    "note":[
      {        "cn":"游离的硫代硫酸极不稳定，无法分离；但其钠盐 Na₂S₂O₃（大苏打/海波）非常稳定，用作定影剂、脱氧剂。",        "en":"Free thiosulfuric acid is extremely unstable and cannot be isolated; however, its sodium salt Na₂S₂O₃ (hypo/hyposulfite) is very stable, used as fixing agent and dechlorinator."}
    ],    "related":[
      "Na2S2O3"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"游离态",          "en":"free state"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"立即分解为 S + SO₂ + H₂O",          "en":"Immediately decomposes to S + SO₂ + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"游离态无法存在",          "en":"Free state cannot exist"}}
    ]},
  "HNO2":{    "verdict":"conditional",    "name":{      "cn":"亚硝酸",      "en":"Nitrous acid"},    "formula":"HNO2",    "note":[
      {        "cn":"仅存在于冷水溶液，室温即分解：3HNO₂ → HNO₃ + 2NO + H₂O。其盐（亚硝酸盐）稳定但多数有毒、可致癌。",        "en":"Exists only in cold aqueous solution, decomposes at room temperature: 3HNO₂ → HNO₃ + 2NO + H₂O. Its salts (nitrites) are stable but mostly toxic and carcinogenic."}
    ],    "related":[
      "NaNO2"
    ],    "tags":[
      "unstable",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"室温",          "en":"room temperature"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 HNO₃ + NO",          "en":"Decomposes to HNO₃ + NO"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"N(III) 可氧化 I⁻ 为 I₂",          "en":"N(III) can oxidize I⁻ to I₂"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 HNO₃",          "en":"Oxidized to HNO₃"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"仅存于冷水溶液，室温即分解",          "en":"Exists only in cold aqueous solution, decomposes at room temperature"}}
    ]},
  "H2O2":{    "verdict":"yes",    "name":{      "cn":"过氧化氢",      "en":"Hydrogen peroxide"},    "formula":"H2O2",    "note":[
      {        "cn":"双氧水，较稳定存在于稀溶液；浓溶液或受热、见光、遇金属离子会剧烈分解为 H₂O + O₂，是强氧化剂。",        "en":"Hydrogen peroxide, relatively stable in dilute solution; concentrated solutions decompose vigorously to H₂O + O₂ when heated, exposed to light, or in presence of metal ions; it is a strong oxidant."},
      {        "cn":"高浓度（>30%）有爆炸与强腐蚀性危险。",        "en":"High concentrations (>30%) pose explosion and strong corrosion hazards."}
    ],    "related":[
      "H2O"
    ],    "tags":[
      "oxidize",
      "corrosive",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"O(-1) 既可作氧化剂（还原为 H₂O）又可作还原剂（氧化为 O₂）",          "en":"O(-1) can act as both oxidant (reduced to H₂O) and reductant (oxidized to O₂)"}},
      {        "condition":{          "cn":"见光/受热/遇金属离子",          "en":"under light/heat/metal ions"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 H₂O + O₂",          "en":"Decomposes to H₂O + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "Na2O2":{    "verdict":"yes",    "name":{      "cn":"过氧化钠",      "en":"Sodium peroxide"},    "formula":"Na2O2",    "note":[
      {        "cn":"淡黄色固体，强氧化剂；与水剧烈反应生成 NaOH 并放出 O₂，与 CO₂ 反应生成 Na₂CO₃ 并供氧（潜水/航天用）。",        "en":"Pale yellow solid, strong oxidant; reacts vigorously with water to form NaOH and release O₂; reacts with CO₂ to form Na₂CO₃ and supply oxygen (used in diving/aerospace)."}
    ],    "related":[
      "Na2O"
    ],    "tags":[
      "oxidize",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"与水",          "en":"with water"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"O(-1) 歧化为 O₂ 与 OH⁻",          "en":"O(-1) disproportionates to O₂ and OH⁻"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"强氧化剂，可氧化多种物质",          "en":"Strong oxidant, can oxidize many substances"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 NaOH + O₂",          "en":"Reacts with water to form NaOH + O₂"}}
    ]},
  "BaO2":{    "verdict":"yes",    "name":{      "cn":"过氧化钡",      "en":"Barium peroxide"},    "formula":"BaO2",    "note":[
      {        "cn":"过氧化物，与酸反应放出 H₂O₂； historically 用于制过氧化氢。可溶性钡化合物有毒。",        "en":"Peroxide; reacts with acid to release H₂O₂; historically used to produce hydrogen peroxide. Soluble barium compounds are toxic."}
    ],    "related":[
      "BaO"
    ],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"与酸",          "en":"with acid"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"生成 H₂O₂ 与 Ba²⁺",          "en":"Forms H₂O₂ and Ba²⁺"}},
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"高温分解为 BaO + O₂",          "en":"Decomposes to BaO + O₂ at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"难溶",          "en":"practically insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"稀酸",          "en":"dilute acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 H₂O₂ 与 Ba²⁺",          "en":"Forms H₂O₂ and Ba²⁺"}}
    ]},
  "KO2":{    "verdict":"yes",    "name":{      "cn":"超氧化钾",      "en":"Potassium superoxide"},    "formula":"KO2",    "note":[
      {        "cn":"橙黄色固体，与 CO₂ 反应放出 O₂（2KO₂ + CO₂ → K₂CO₃ + 1.5O₂），用作密闭空间（矿坑/潜水）供氧剂。",        "en":"Orange-yellow solid; reacts with CO₂ to release O₂ (2KO₂ + CO₂ → K₂CO₃ + 1.5O₂), used as oxygen supply in enclosed spaces (mines/diving)."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"与水",          "en":"with water"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"O(-1/2) 歧化为 O₂ 与 OH⁻",          "en":"O(-1/2) disproportionates to O₂ and OH⁻"}},
      {        "condition":{          "cn":"与 CO₂",          "en":"with CO₂"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"生成 K₂CO₃ + O₂",          "en":"Forms K₂CO₃ + O₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"强氧化剂",          "en":"Strong oxidant"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水剧烈反应放出 O₂",          "en":"Reacts vigorously with water releasing O₂"}}
    ]},
  "NaClO":{    "verdict":"yes",    "name":{      "cn":"次氯酸钠",      "en":"Sodium hypochlorite"},    "formula":"NaClO",    "note":[
      {        "cn":"84 消毒液主要成分（有效氯）；溶液呈碱性、不稳定，与酸性洁厕剂混合会放出剧毒 Cl₂，严禁混用！",        "en":"Main component of '84 disinfectant' (available chlorine); the solution is alkaline and unstable, releasing toxic Cl₂ when mixed with acidic toilet cleaners — never mix!"}
    ],    "related":[
      "HClO"
    ],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(I) 强氧化剂，可漂白/消毒",          "en":"Cl(I) is a strong oxidant, can bleach/disinfect"}},
      {        "condition":{          "cn":"在酸性条件下",          "en":"under acidic conditions"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"生成 Cl₂ 或 ClO₃⁻",          "en":"Forms Cl₂ or ClO₃⁻"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"水溶液呈碱性",          "en":"Aqueous solution is alkaline"}}
    ]},
  "Ca(ClO)2":{    "verdict":"yes",    "name":{      "cn":"次氯酸钙",      "en":"Calcium hypochlorite"},    "formula":"Ca(ClO)2",    "note":[
      {        "cn":"漂白粉/漂粉精的有效成分；遇酸或 CO₂ 放出 HClO，具漂白与消毒作用；与有机物混合可爆。",        "en":"Active ingredient of bleaching powder/bleach; releases HClO upon contact with acid or CO₂, providing bleaching and disinfecting action; can explode when mixed with organic matter."}
    ],    "related":[],    "tags":[
      "oxidize",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"遇酸或 CO₂",          "en":"with acid or CO₂"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"放出 HClO，强氧化漂白",          "en":"Releases HClO, strong oxidizing bleaching"}},
      {        "condition":{          "cn":"受热",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"生成 CaCl₂ + O₂ + Ca(ClO₃)₂",          "en":"Forms CaCl₂ + O₂ + Ca(ClO₃)₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于水，溶液浑浊",          "en":"Dissolves in water, solution is turbid"}}
    ]},
  "KClO3":{    "verdict":"yes",    "name":{      "cn":"氯酸钾",      "en":"Potassium chlorate"},    "formula":"KClO3",    "note":[
      {        "cn":"强氧化剂，与硫、碳、磷或有机物混合受摩擦/加热即猛烈爆炸；曾用于火柴与烟火，现多被 KClO₄ 替代。",        "en":"Strong oxidant; explodes violently when mixed with sulfur, carbon, phosphorus, or organic matter and subjected to friction/heat; formerly used in matches and fireworks, now mostly replaced by KClO₄."}
    ],    "related":[],    "tags":[
      "oxidize",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"加热（催化）",          "en":"heating (catalyzed)"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"MnO₂ 催化分解为 KCl + O₂",          "en":"MnO₂-catalyzed decomposition to KCl + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(V) 强氧化剂，猛烈反应",          "en":"Cl(V) is a strong oxidant, reacts violently"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 7.1g/100mL，温度升高溶解度增大",          "en":"~7.1g/100mL at 20°C; solubility increases with temperature"}}
    ]},
  "KClO4":{    "verdict":"yes",    "name":{      "cn":"高氯酸钾",      "en":"Potassium perchlorate"},    "formula":"KClO4",    "note":[
      {        "cn":"强氧化剂，较氯酸盐稳定；用于烟火、火箭推进剂。仍须远离可燃物的还原剂。",        "en":"Strong oxidant, more stable than chlorates; used in fireworks and rocket propellants. Must still be kept away from combustibles and reducing agents."}
    ],    "related":[],    "tags":[
      "oxidize",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"高温分解为 KCl + O₂",          "en":"Decomposes to KCl + O₂ at high temperature"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(VII) 强氧化剂",          "en":"Cl(VII) is a strong oxidant"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 1.5g/100mL",          "en":"~1.5g/100mL at 20°C"}},
      {        "solvent":{          "cn":"热水",          "en":"hot water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"温度升高溶解度增大",          "en":"Solubility increases with temperature"}}
    ]},
  "BaCl2":{    "verdict":"yes",    "name":{      "cn":"氯化钡",      "en":"Barium chloride"},    "formula":"BaCl2",    "note":[
      {        "cn":"可溶性钡盐，剧毒！Ba²⁺ 使蛋白质变性；中毒可用硫酸镁/硫酸钠解毒（生成不溶 BaSO₄）。",        "en":"Soluble barium salt, highly toxic! Ba²⁺ denatures proteins; poisoning can be treated with magnesium/sodium sulfate (forming insoluble BaSO₄)."}
    ],    "related":[
      "BaSO4"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ba²⁺ 极稳定",          "en":"Ba²⁺ is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 35.7g/100mL",          "en":"~35.7g/100mL at 20°C"}}
    ]},
  "BaSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸钡",      "en":"Barium sulfate"},    "formula":"BaSO4",    "note":[
      {        "cn":"极难溶、不透过 X 射线，口服“钡餐”用于消化道造影；因不溶故无毒。",        "en":"Extremely insoluble, X-ray opaque; taken orally as 'barium meal' for gastrointestinal imaging; non-toxic due to insolubility."}
    ],    "related":[
      "BaCl2"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ba²⁺ 与 SO₄²⁻ 均稳定",          "en":"Ba²⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 1.1×10⁻¹⁰，极难溶",          "en":"Ksp ≈ 1.1×10⁻¹⁰, extremely insoluble"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于稀酸",          "en":"Insoluble in dilute acids"}}
    ]},
  "BaCO3":{    "verdict":"yes",    "name":{      "cn":"碳酸钡",      "en":"Barium carbonate"},    "formula":"BaCO3",    "note":[
      {        "cn":"虽难溶，但溶于胃酸（HCl）释放有毒 Ba²⁺，故不可作“钡餐”；有毒。",        "en":"Although insoluble, it dissolves in stomach acid (HCl) releasing toxic Ba²⁺, so it cannot be used as 'barium meal'; toxic."}
    ],    "related":[
      "BaSO4"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ba²⁺ 与 CO₃²⁻ 均稳定",          "en":"Ba²⁺ and CO₃²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 5.1×10⁻⁹",          "en":"Ksp ≈ 5.1×10⁻⁹"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸放出 CO₂，释放有毒 Ba²⁺",          "en":"Dissolves in acid releasing CO₂ and toxic Ba²⁺"}}
    ]},
  "HgCl2":{    "verdict":"yes",    "name":{      "cn":"氯化汞（升汞）",      "en":"Mercury(II) chloride (corrosive sublimate)"},    "formula":"HgCl2",    "note":[
      {        "cn":"剧毒！蛋白质凝固剂，稀溶液曾作消毒剂；Hg²⁺ 与 SnCl₂ 反应用于检验 Hg²⁺。",        "en":"Highly toxic! Protein coagulant; dilute solutions were formerly used as antiseptics; Hg²⁺ reacts with SnCl₂ for detection of Hg²⁺."}
    ],    "related":[
      "Hg2Cl2"
    ],    "tags":[
      "toxic",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Hg²⁺ 可被 SnCl₂ 还原为 Hg₂Cl₂ 或 Hg",          "en":"Hg²⁺ can be reduced to Hg₂Cl₂ or Hg by SnCl₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 6.9g/100mL",          "en":"~6.9g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "Hg2Cl2":{    "verdict":"yes",    "name":{      "cn":"氯化亚汞（甘汞）",      "en":"Mercury(I) chloride (calomel)"},    "formula":"Hg2Cl2",    "note":[
      {        "cn":"白色难溶，曾入药；见光分解为 Hg + HgCl₂（变黑）；遇碱歧化为 Hg + HgO。",        "en":"White, insoluble, formerly used in medicine; decomposes to Hg + HgCl₂ (turns black) in light; disproportionates to Hg + HgO with base."}
    ],    "related":[
      "HgCl2"
    ],    "tags":[
      "toxic",
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 Hg + HgCl₂",          "en":"Decomposes to Hg + HgCl₂"}},
      {        "condition":{          "cn":"与碱",          "en":"with base"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"歧化为 Hg + HgO",          "en":"Disproportionates to Hg + HgO"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 Hg",          "en":"Can be reduced to Hg"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"极难溶",          "en":"Extremely insoluble"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于乙醇",          "en":"Insoluble in ethanol"}}
    ]},
  "As2O3":{    "verdict":"yes",    "name":{      "cn":"三氧化二砷（砒霜）",      "en":"Arsenic(III) oxide (arsenic trioxide)"},    "formula":"As2O3",    "note":[
      {        "cn":"剧毒！溶于碱生成亚砷酸盐；是经典毒药，也用于木材防腐与玻璃工业。",        "en":"Highly toxic! Dissolves in base to form arsenite; a classic poison, also used in wood preservation and glass industry."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"As(III) 可被氧化为 As(V)",          "en":"As(III) can be oxidized to As(V)"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"As(III) 可被还原为 As 单质",          "en":"As(III) can be reduced to As metal"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 2.0g/100mL",          "en":"~2.0g/100mL at 20°C"}},
      {        "solvent":{          "cn":"碱",          "en":"alkali"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成亚砷酸盐",          "en":"Forms arsenite"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"溶于盐酸",          "en":"Slightly soluble in hydrochloric acid"}}
    ]},
  "HgO":{    "verdict":"yes",    "name":{      "cn":"氧化汞",      "en":"Mercury(II) oxide"},    "formula":"HgO",    "note":[
      {        "cn":"红/黄两种变体，加热分解为 Hg + O₂；剧毒。",        "en":"Red/yellow variants; decomposes to Hg + O₂ on heating; highly toxic."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Hg + O₂",          "en":"Decomposes to Hg + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 Hg",          "en":"Can be reduced to Hg"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Hg²⁺",          "en":"Dissolves in acid to form Hg²⁺"}}
    ]},
  "CO":{    "verdict":"yes",    "name":{      "cn":"一氧化碳",      "en":"Carbon monoxide"},    "formula":"CO",    "note":[
      {        "cn":"无色无味剧毒气体，与血红蛋白结合致缺氧；可燃，是煤气/不完全燃烧产物。",        "en":"Colorless, odorless, highly toxic gas; binds to hemoglobin causing oxygen deprivation; flammable, product of coal gas/incomplete combustion."}
    ],    "related":[
      "CO2"
    ],    "tags":[
      "toxic",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂",          "en":"Oxidized to CO₂ by O₂"}},
      {        "condition":{          "cn":"与金属氧化物",          "en":"with metal oxides"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"高温还原 Fe₂O₃、CuO 等",          "en":"Reduces Fe₂O₃, CuO, etc. at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 2.3mL/100mL",          "en":"~2.3mL/100mL at 20°C"}}
    ]},
  "NO":{    "verdict":"yes",    "name":{      "cn":"一氧化氮",      "en":"Nitric oxide"},    "formula":"NO",    "note":[
      {        "cn":"无色气体，空气中立即与 O₂ 反应生成红棕色 NO₂；参与光化学烟雾与生物信号传导。",        "en":"Colorless gas; immediately reacts with O₂ in air to form reddish-brown NO₂; involved in photochemical smog and biological signaling."}
    ],    "related":[
      "NO2"
    ],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"与 O₂ 反应生成 NO₂",          "en":"Reacts with O₂ to form NO₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可氧化某些还原剂",          "en":"Can oxidize certain reducing agents"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"难溶于水",          "en":"Sparingly soluble in water"}}
    ]},
  "NO2":{    "verdict":"yes",    "name":{      "cn":"二氧化氮",      "en":"Nitrogen dioxide"},    "formula":"NO2",    "note":[
      {        "cn":"红棕色有毒、腐蚀性气体；与 N₂O₄ 共存；溶于水生成 HNO₃ + NO。",        "en":"Reddish-brown toxic, corrosive gas; coexists with N₂O₄; dissolves in water to form HNO₃ + NO."}
    ],    "related":[
      "N2O4",
      "HNO3"
    ],    "tags":[
      "toxic",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"溶于水",          "en":"dissolving in water"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"生成 HNO₃ + NO",          "en":"Forms HNO₃ + NO"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"N(IV) 强氧化剂",          "en":"N(IV) is a strong oxidant"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"与水反应生成 HNO₃ + NO",          "en":"Reacts with water to form HNO₃ + NO"}}
    ]},
  "N2O":{    "verdict":"yes",    "name":{      "cn":"一氧化二氮（笑气）",      "en":"Nitrous oxide (laughing gas)"},    "formula":"N2O",    "note":[
      {        "cn":"无色气体，可作麻醉/助推剂；助燃；长期吸入有神经毒性。",        "en":"Colorless gas; can be used as anesthetic/propellant; supports combustion; long-term inhalation has neurotoxicity."}
    ],    "related":[],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"高温",          "en":"high temperature"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"分解为 N₂ + O₂，可助燃",          "en":"Decomposes to N₂ + O₂, supports combustion"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可氧化多种物质",          "en":"Can oxidize many substances"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 60mL/100mL（体积比）",          "en":"~60mL/100mL at 20°C (by volume)"}}
    ]},
  "SO2":{    "verdict":"yes",    "name":{      "cn":"二氧化硫",      "en":"Sulfur dioxide"},    "formula":"SO2",    "note":[
      {        "cn":"刺激性有毒气体，是酸雨前体；有漂白性（与品红反应）与还原性。",        "en":"Irritating toxic gas, precursor to acid rain; has bleaching properties (reacts with magenta) and reducing properties."}
    ],    "related":[
      "SO3",
      "H2SO3"
    ],    "tags":[
      "toxic",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被催化氧化为 SO₃",          "en":"Can be catalytically oxidized to SO₃"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 KMnO₄、Cl₂ 等氧化为 SO₄²⁻",          "en":"Oxidized to SO₄²⁻ by KMnO₄, Cl₂, etc."}},
      {        "condition":{          "cn":"与强还原剂",          "en":"with strong reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 S 或 H₂S",          "en":"Can be reduced to S or H₂S"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 9.4g/100mL，生成 H₂SO₃",          "en":"~9.4g/100mL at 20°C, forms H₂SO₃"}}
    ]},
  "SO3":{    "verdict":"yes",    "name":{      "cn":"三氧化硫",      "en":"Sulfur trioxide"},    "formula":"SO3",    "note":[
      {        "cn":"强腐蚀性，遇水剧烈生成硫酸并放热；是硫酸工业的关键中间体。",        "en":"Strongly corrosive; reacts violently with water to form sulfuric acid with heat release; key intermediate in sulfuric acid industry."}
    ],    "related":[
      "H2SO4"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"S(VI) 是强氧化剂",          "en":"S(VI) is a strong oxidant"}},
      {        "condition":{          "cn":"高温时",          "en":"at high temperature"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"可分解为 SO₂ + O₂",          "en":"Can decompose to SO₂ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水剧烈反应生成 H₂SO₄",          "en":"Reacts violently with water to form H₂SO₄"}}
    ]},
  "H2S":{    "verdict":"yes",    "name":{      "cn":"硫化氢",      "en":"Hydrogen sulfide"},    "formula":"H2S",    "note":[
      {        "cn":"剧毒、臭鸡蛋味气体，可燃；与金属离子生成特征色硫化物沉淀，用于定性分析。",        "en":"Highly toxic gas with rotten egg odor, flammable; forms characteristic-colored sulfide precipitates with metal ions, used in qualitative analysis."}
    ],    "related":[],    "tags":[
      "toxic",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可燃，被氧化为 S 或 SO₂",          "en":"Combustible, oxidized to S or SO₂"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 KMnO₄、Cl₂、HNO₃ 等氧化为 S 或 SO₄²⁻",          "en":"Oxidized to S or SO₄²⁻ by KMnO₄, Cl₂, HNO₃, etc."}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 0.38g/100mL，水溶液为氢硫酸",          "en":"~0.38g/100mL at 20°C; aqueous solution is hydrosulfuric acid"}}
    ]},
  "H2O":{    "verdict":"yes",    "name":{      "cn":"水",      "en":"Water"},    "formula":"H2O",    "note":[
      {        "cn":"最普遍的溶剂，中性。",        "en":"The most common solvent, neutral."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"电解时",          "en":"during electrolysis"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"电解水生成 H₂ + O₂",          "en":"Electrolysis of water produces H₂ + O₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"常温稳定",          "en":"Stable at room temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"万能溶剂",          "en":"Universal solvent"}}
    ]},
  "H2SO4":{    "verdict":"yes",    "name":{      "cn":"硫酸",      "en":"Sulfuric acid"},    "formula":"H2SO4",    "note":[
      {        "cn":"强酸，浓硫酸具强腐蚀性、脱水性与强氧化性；稀释时务必“酸入水”并搅拌。",        "en":"Strong acid; concentrated sulfuric acid is strongly corrosive, dehydrating, and strongly oxidizing; always add acid to water (never water to acid) with stirring when diluting."}
    ],    "related":[],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"浓硫酸加热",          "en":"concentrated, heated"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可氧化 Cu、C 等，自身还原为 SO₂",          "en":"Can oxidize Cu, C, etc., itself reduced to SO₂"}},
      {        "condition":{          "cn":"稀溶液",          "en":"dilute solution"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"稀硫酸仅显酸性",          "en":"Dilute sulfuric acid is only acidic"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶，稀释剧烈放热",          "en":"Miscible with water in any ratio, vigorous exothermic dilution"}}
    ]},
  "HNO3":{    "verdict":"yes",    "name":{      "cn":"硝酸",      "en":"Nitric acid"},    "formula":"HNO3",    "note":[
      {        "cn":"强酸、强氧化剂；浓硝酸见光变黄（分解出 NO₂），具强腐蚀性，使皮肤/蛋白质黄染。",        "en":"Strong acid, strong oxidant; concentrated nitric acid turns yellow in light (decomposing to NO₂), strongly corrosive, stains skin/proteins yellow."}
    ],    "related":[],    "tags":[
      "corrosive",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"N(V) 强氧化剂，可氧化 Cu、C、S 等",          "en":"N(V) is a strong oxidant, can oxidize Cu, C, S, etc."}},
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 NO₂ + O₂ + H₂O",          "en":"Decomposes to NO₂ + O₂ + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "HCl":{    "verdict":"yes",    "name":{      "cn":"氯化氢/盐酸",      "en":"Hydrogen chloride / Hydrochloric acid"},    "formula":"HCl",    "note":[
      {        "cn":"气态为氯化氢，水溶液为盐酸（强酸）；浓盐酸易挥发，与 NH₃ 生成白烟 NH₄Cl。",        "en":"Gaseous form is hydrogen chloride; aqueous solution is hydrochloric acid (strong acid); concentrated hydrochloric acid is volatile, forms white smoke NH₄Cl with NH₃."}
    ],    "related":[
      "NH4Cl"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Cl⁻ 可被 MnO₂、KMnO₄ 等氧化为 Cl₂",          "en":"Cl⁻ can be oxidized to Cl₂ by MnO₂, KMnO₄, etc."}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"稀盐酸仅显酸性",          "en":"Dilute hydrochloric acid is only acidic"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"0°C 约 82.3g/100mL",          "en":"~82.3g/100mL at 0°C"}}
    ]},
  "H3PO4":{    "verdict":"yes",    "name":{      "cn":"磷酸",      "en":"Phosphoric acid"},    "formula":"H3PO4",    "note":[
      {        "cn":"中强三元酸，无毒，用于肥料与食品添加剂。",        "en":"Moderately strong triprotic acid, non-toxic; used in fertilizers and food additives."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"P(V) 极稳定",          "en":"P(V) is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 548g/100mL",          "en":"~548g/100mL at 20°C"}}
    ]},
  "HF":{    "verdict":"yes",    "name":{      "cn":"氢氟酸",      "en":"Hydrofluoric acid"},    "formula":"HF",    "note":[
      {        "cn":"剧毒且腐蚀玻璃/硅酸盐；渗入组织破坏钙镁、侵蚀骨骼，灼伤初期不痛但可致命，须专用防护与急救（葡萄糖酸钙）。",        "en":"Highly toxic and corrosive to glass/silicates; penetrates tissue destroying calcium and magnesium, eroding bones; burns are initially painless but can be fatal; requires specialized protection and first aid (calcium gluconate)."}
    ],    "related":[],    "tags":[
      "toxic",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"F⁻ 极稳定，难以被氧化或还原",          "en":"F⁻ is extremely stable, difficult to oxidize or reduce"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "NaCl":{    "verdict":"yes",    "name":{      "cn":"氯化钠",      "en":"Sodium chloride"},    "formula":"NaCl",    "note":[
      {        "cn":"食盐主要成分，稳定。",        "en":"Main component of table salt, stable."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"熔融电解",          "en":"molten electrolysis"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"电解生成 Na + Cl₂",          "en":"Electrolysis produces Na + Cl₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 Cl⁻ 均稳定",          "en":"Na⁺ and Cl⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 36.0g/100mL",          "en":"~36.0g/100mL at 20°C"}}
    ]},
  "Na2CO3":{    "verdict":"yes",    "name":{      "cn":"碳酸钠",      "en":"Sodium carbonate"},    "formula":"Na2CO3",    "note":[
      {        "cn":"纯碱/苏打，稳定；水溶液呈碱性。",        "en":"Soda ash, stable; aqueous solution is alkaline."}
    ],    "related":[
      "NaHCO3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 CO₃²⁻ 均稳定",          "en":"Na⁺ and CO₃²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 21.5g/100mL",          "en":"~21.5g/100mL at 20°C"}}
    ]},
  "NaHCO3":{    "verdict":"yes",    "name":{      "cn":"碳酸氢钠",      "en":"Sodium bicarbonate"},    "formula":"NaHCO3",    "note":[
      {        "cn":"小苏打，受热或遇酸放出 CO₂；可作膨松剂与抗酸剂。",        "en":"Baking soda; releases CO₂ when heated or with acid; used as leavening agent and antacid."}
    ],    "related":[
      "Na2CO3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 HCO₃⁻ 均稳定",          "en":"Na⁺ and HCO₃⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 9.6g/100mL",          "en":"~9.6g/100mL at 20°C"}}
    ]},
  "CaCO3":{    "verdict":"yes",    "name":{      "cn":"碳酸钙",      "en":"Calcium carbonate"},    "formula":"CaCO3",    "note":[
      {        "cn":"石灰石/贝壳/骨骸主要成分；难溶，遇酸放出 CO₂。",        "en":"Main component of limestone/shells/bones; insoluble, releases CO₂ with acid."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温",          "en":"high temperature"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 CaO + CO₂",          "en":"Decomposes to CaO + CO₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ca²⁺ 与 CO₃²⁻ 均稳定",          "en":"Ca²⁺ and CO₃²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 3.4×10⁻⁹",          "en":"Ksp ≈ 3.4×10⁻⁹"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"遇酸放出 CO₂",          "en":"Releases CO₂ with acid"}}
    ]},
  "CaO":{    "verdict":"yes",    "name":{      "cn":"氧化钙",      "en":"Calcium oxide"},    "formula":"CaO",    "note":[
      {        "cn":"生石灰，遇水剧烈放热生成 Ca(OH)₂（熟石灰）。",        "en":"Quicklime; reacts violently with water releasing heat to form Ca(OH)₂ (slaked lime)."}
    ],    "related":[
      "Ca(OH)2"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ca²⁺ 与 O²⁻ 均稳定",          "en":"Ca²⁺ and O²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 Ca(OH)₂ 并放热",          "en":"Reacts with water to form Ca(OH)₂, exothermic"}}
    ]},
  "CuSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸铜",      "en":"Copper(II) sulfate"},    "formula":"CuSO4",    "note":[
      {        "cn":"无水物白色，五水合物 CuSO₄·5H₂O 为蓝色胆矾；溶液与过量 NH₃ 生成深蓝配离子。",        "en":"Anhydrous form is white; pentahydrate CuSO₄·5H₂O is blue (blue vitriol); solution forms deep blue complex ion with excess NH₃."}
    ],    "related":[
      "CuSO4.5H2O"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"与活泼金属",          "en":"with active metals"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cu²⁺ 可被 Fe、Zn 等还原为 Cu",          "en":"Cu²⁺ can be reduced to Cu by Fe, Zn, etc."}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Cu²⁺ 较稳定",          "en":"Cu²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 20.7g/100mL",          "en":"~20.7g/100mL at 20°C"}}
    ]},
  "CuSO4.5H2O":{    "verdict":"yes",    "name":{      "cn":"五水硫酸铜（胆矾）",      "en":"Copper(II) sulfate pentahydrate (blue vitriol)"},    "formula":"CuSO4.5H2O",    "note":[
      {        "cn":"蓝色晶体，加热逐步失水变为白色无水 CuSO₄；是常见铜盐与杀菌剂（波尔多液组分）。",        "en":"Blue crystals; gradually lose water on heating to become white anhydrous CuSO₄; common copper salt and fungicide (component of Bordeaux mixture)."}
    ],    "related":[
      "CuSO4"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"逐步失水变为无水 CuSO₄",          "en":"Gradually loses water to become anhydrous CuSO₄"}},
      {        "condition":{          "cn":"与活泼金属",          "en":"with active metals"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cu²⁺ 可被还原为 Cu",          "en":"Cu²⁺ can be reduced to Cu"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"同 CuSO₄",          "en":"Same as CuSO₄"}}
    ]},
  "AgNO3":{    "verdict":"yes",    "name":{      "cn":"硝酸银",      "en":"Silver nitrate"},    "formula":"AgNO3",    "note":[
      {        "cn":"无色晶体，见光分解变黑（生成 Ag）；用于镀银、试剂与“银镜反应”。溶液具氧化性/腐蚀性。",        "en":"Colorless crystals; decomposes and turns black in light (forming Ag); used for silver plating, reagent, and 'silver mirror reaction'. Solution is oxidizing/corrosive."}
    ],    "related":[],    "tags":[
      "corrosive",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Ag + NO₂ + O₂",          "en":"Decomposes to Ag + NO₂ + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Ag⁺ 可被还原为 Ag",          "en":"Ag⁺ can be reduced to Ag"}},
      {        "condition":{          "cn":"与活泼金属",          "en":"with active metals"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可置换出 Ag",          "en":"Can displace Ag"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 222g/100mL",          "en":"~222g/100mL at 20°C"}}
    ]},
  "AgCl":{    "verdict":"yes",    "name":{      "cn":"氯化银",      "en":"Silver chloride"},    "formula":"AgCl",    "note":[
      {        "cn":"白色凝乳状沉淀，见光变紫黑（分解出 Ag）；不溶于水与稀酸，溶于氨水/硫代硫酸钠。",        "en":"White curdy precipitate; turns purplish-black in light (decomposing to Ag); insoluble in water and dilute acids, soluble in ammonia/sodium thiosulfate."}
    ],    "related":[
      "AgBr",
      "AgI"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Ag + Cl₂",          "en":"Decomposes to Ag + Cl₂"}},
      {        "condition":{          "cn":"与强还原剂",          "en":"with strong reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Ag⁺ 可被还原为 Ag",          "en":"Ag⁺ can be reduced to Ag"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 1.8×10⁻¹⁰",          "en":"Ksp ≈ 1.8×10⁻¹⁰"}},
      {        "solvent":{          "cn":"氨水",          "en":"ammonia water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Ag(NH₃)₂]⁺",          "en":"Forms [Ag(NH₃)₂]⁺"}},
      {        "solvent":{          "cn":"硫代硫酸钠",          "en":"sodium thiosulfate"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Ag(S₂O₃)₂]³⁻",          "en":"Forms [Ag(S₂O₃)₂]³⁻"}}
    ]},
  "AgBr":{    "verdict":"yes",    "name":{      "cn":"溴化银",      "en":"Silver bromide"},    "formula":"AgBr",    "note":[
      {        "cn":"淡黄色，感光材料（胶片）主要成分；见光分解。",        "en":"Pale yellow; main component of photographic film (photosensitive material); decomposes in light."}
    ],    "related":[
      "AgCl",
      "AgI"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Ag + Br₂",          "en":"Decomposes to Ag + Br₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 5.0×10⁻¹³",          "en":"Ksp ≈ 5.0×10⁻¹³"}},
      {        "solvent":{          "cn":"氨水",          "en":"ammonia water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"部分溶解",          "en":"Partially dissolves"}},
      {        "solvent":{          "cn":"硫代硫酸钠",          "en":"sodium thiosulfate"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成配离子",          "en":"Forms complex ion"}}
    ]},
  "AgI":{    "verdict":"yes",    "name":{      "cn":"碘化银",      "en":"Silver iodide"},    "formula":"AgI",    "note":[
      {        "cn":"黄色，用于人工降雨（作冰核）与感光。",        "en":"Yellow; used for artificial rain (as ice nucleus) and photosensitivity."}
    ],    "related":[
      "AgCl",
      "AgBr"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Ag + I₂",          "en":"Decomposes to Ag + I₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 8.5×10⁻¹⁷",          "en":"Ksp ≈ 8.5×10⁻¹⁷"}},
      {        "solvent":{          "cn":"氨水",          "en":"ammonia water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于氨水",          "en":"Insoluble in ammonia water"}},
      {        "solvent":{          "cn":"氰化钾",          "en":"potassium cyanide"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Ag(CN)₂]⁻",          "en":"Forms [Ag(CN)₂]⁻"}}
    ]},
  "Ag2O":{    "verdict":"yes",    "name":{      "cn":"氧化银",      "en":"Silver oxide"},    "formula":"Ag2O",    "note":[
      {        "cn":"棕黑色，由 AgOH 脱水或 Ag⁺ 加碱得到；见光分解；用作纽扣电池正极。",        "en":"Brownish-black; formed by dehydration of AgOH or adding base to Ag⁺; decomposes in light; used as button battery cathode."}
    ],    "related":[
      "AgOH"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Ag + O₂",          "en":"Decomposes to Ag + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Ag⁺ 可被还原为 Ag",          "en":"Ag⁺ can be reduced to Ag"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"微溶，水溶液呈碱性",          "en":"Slightly soluble; aqueous solution is alkaline"}},
      {        "solvent":{          "cn":"氨水",          "en":"ammonia water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Ag(NH₃)₂]⁺",          "en":"Forms [Ag(NH₃)₂]⁺"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Ag⁺",          "en":"Forms Ag⁺"}}
    ]},
  "Ag2CO3":{    "verdict":"yes",    "name":{      "cn":"碳酸银",      "en":"Silver carbonate"},    "formula":"Ag2CO3",    "note":[
      {        "cn":"黄色沉淀，见光分解；微溶。",        "en":"Yellow precipitate; decomposes in light; slightly soluble."}
    ],    "related":[],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"见光时",          "en":"under light"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Ag₂O + CO₂ 或 Ag + CO₂ + O₂",          "en":"Decomposes to Ag₂O + CO₂ or Ag + CO₂ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"Ksp 约 8.5×10⁻¹²",          "en":"Ksp ≈ 8.5×10⁻¹²"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"遇酸放出 CO₂",          "en":"Releases CO₂ with acid"}}
    ]},
  "Ag3PO4":{    "verdict":"yes",    "name":{      "cn":"磷酸银",      "en":"Silver phosphate"},    "formula":"Ag3PO4",    "note":[
      {        "cn":"黄色沉淀，用于催化与指示。",        "en":"Yellow precipitate; used in catalysis and as indicator."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Ag⁺ 可被还原为 Ag",          "en":"Ag⁺ can be reduced to Ag"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"较稳定",          "en":"Relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 8.9×10⁻¹⁷",          "en":"Ksp ≈ 8.9×10⁻¹⁷"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于稀酸",          "en":"Dissolves in dilute acid"}},
      {        "solvent":{          "cn":"氨水",          "en":"ammonia water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 [Ag(NH₃)₂]⁺",          "en":"Forms [Ag(NH₃)₂]⁺"}}
    ]},
  "KMnO4":{    "verdict":"yes",    "name":{      "cn":"高锰酸钾",      "en":"Potassium permanganate"},    "formula":"KMnO4",    "note":[
      {        "cn":"紫红色强氧化剂；酸性条件被还原为 Mn²⁺（无色），中性/弱碱为 MnO₂（棕）。具腐蚀性。",        "en":"Purplish-red strong oxidant; reduced to Mn²⁺ (colorless) under acidic conditions, to MnO₂ (brown) under neutral/weakly alkaline conditions. Corrosive."}
    ],    "related":[],    "tags":[
      "oxidize",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"酸性条件下",          "en":"under acidic conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Mn(VII) 被还原为 Mn²⁺",          "en":"Mn(VII) is reduced to Mn²⁺"}},
      {        "condition":{          "cn":"中性/弱碱性",          "en":"neutral/weakly alkaline"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被还原为 MnO₂",          "en":"Reduced to MnO₂"}},
      {        "condition":{          "cn":"强碱性",          "en":"strongly alkaline"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被还原为 K₂MnO₄（绿色）",          "en":"Reduced to K₂MnO₄ (green)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 6.4g/100mL，紫红色溶液",          "en":"~6.4g/100mL at 20°C, purplish-red solution"}}
    ]},
  "K2Cr2O7":{    "verdict":"yes",    "name":{      "cn":"重铬酸钾",      "en":"Potassium dichromate"},    "formula":"K2Cr2O7",    "note":[
      {        "cn":"橙红色强氧化剂，实验室基准物质；Cr(VI) 化合物剧毒且有致癌性，废液须专门处理。",        "en":"Orange-red strong oxidant, laboratory primary standard; Cr(VI) compounds are highly toxic and carcinogenic; waste must be specially treated."}
    ],    "related":[
      "Na2Cr2O7"
    ],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"酸性条件下",          "en":"under acidic conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cr(VI) 被还原为 Cr³⁺",          "en":"Cr(VI) is reduced to Cr³⁺"}},
      {        "condition":{          "cn":"碱性条件下",          "en":"under alkaline conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"转化为 CrO₄²⁻（黄色）",          "en":"Converts to CrO₄²⁻ (yellow)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 12.5g/100mL",          "en":"~12.5g/100mL at 20°C"}}
    ]},
  "CrO3":{    "verdict":"yes",    "name":{      "cn":"三氧化铬",      "en":"Chromium trioxide"},    "formula":"CrO3",    "note":[
      {        "cn":"暗红色，强氧化剂，遇有机物可燃烧；Cr(VI) 剧毒致癌。用于镀铬与清洗。",        "en":"Dark red, strong oxidant; can ignite with organic matter; Cr(VI) is highly toxic and carcinogenic. Used in chrome plating and cleaning."}
    ],    "related":[],    "tags":[
      "oxidize",
      "toxic",
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"遇有机物",          "en":"with organic matter"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"强氧化，遇有机物可燃烧",          "en":"Strongly oxidizing, can ignite with organic matter"}},
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Cr₂O₃ + O₂",          "en":"Decomposes to Cr₂O₃ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"溶于水生成铬酸 H₂CrO₄",          "en":"Dissolves in water to form chromic acid H₂CrO₄"}}
    ]},
  "NH4Cl":{    "verdict":"yes",    "name":{      "cn":"氯化铵",      "en":"Ammonium chloride"},    "formula":"NH4Cl",    "note":[
      {        "cn":"白色盐，受热升华（实为分解再凝华）；用于化肥、焊药、干电池。",        "en":"White salt; sublimes on heating (actually decomposes then re-condenses); used in fertilizers, soldering flux, and dry cell batteries."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"受热",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 NH₃ + HCl",          "en":"Decomposes to NH₃ + HCl"}},
      {        "condition":{          "cn":"与强碱",          "en":"with strong base"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"生成 NH₃ + H₂O",          "en":"Forms NH₃ + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 37.2g/100mL，吸热",          "en":"~37.2g/100mL at 20°C, endothermic"}}
    ]},
  "NH4NO3":{    "verdict":"yes",    "name":{      "cn":"硝酸铵",      "en":"Ammonium nitrate"},    "formula":"NH4NO3",    "note":[
      {        "cn":"铵态氮肥；本身是氧化剂与可燃物的混合物，受强热或撞击可发生猛烈爆炸（多起重大事故）。储存须远离火种与还原性杂质。",        "en":"Ammonium nitrogen fertilizer; itself a mixture of oxidant and combustible; can explode violently under strong heat or impact (several major accidents). Must be stored away from fire and reducing impurities."}
    ],    "related":[],    "tags":[
      "oxidize",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"受强热/撞击",          "en":"strong heat/impact"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"NH₄⁺ 与 NO₃⁻ 间发生氧化还原，爆炸分解为 N₂O/N₂ + H₂O",          "en":"Redox between NH₄⁺ and NO₃⁻, explosive decomposition to N₂O/N₂ + H₂O"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"常温稳定",          "en":"Stable at room temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 192g/100mL，强烈吸热",          "en":"~192g/100mL at 20°C, strongly endothermic"}}
    ]},
  "(NH4)2CO3":{    "verdict":"yes",    "name":{      "cn":"碳酸铵",      "en":"Ammonium carbonate"},    "formula":"(NH4)2CO3",    "note":[
      {        "cn":"不稳定，室温即缓慢分解释放 NH₃ 与 CO₂（“鹿角书橱”气味来源）；用作发酵粉与嗅盐。",        "en":"Unstable, slowly decomposes at room temperature releasing NH₃ and CO₂ (source of 'hartshorn' odor); used as baking powder and smelling salts."}
    ],    "related":[],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"室温",          "en":"room temperature"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 NH₃ + CO₂ + H₂O",          "en":"Decomposes to NH₃ + CO₂ + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，水溶液呈碱性",          "en":"Easily soluble in water; aqueous solution is alkaline"}}
    ]},
  "(NH4)2SO4":{    "verdict":"yes",    "name":{      "cn":"硫酸铵",      "en":"Ammonium sulfate"},    "formula":"(NH4)2SO4",    "note":[
      {        "cn":"常用氮肥；长期施用使土壤酸化。",        "en":"Common nitrogen fertilizer; long-term use acidifies soil."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"NH₄⁺ 与 SO₄²⁻ 均稳定",          "en":"NH₄⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 70.6g/100mL",          "en":"~70.6g/100mL at 20°C"}}
    ]},
  "NH4HCO3":{    "verdict":"yes",    "name":{      "cn":"碳酸氢铵",      "en":"Ammonium bicarbonate"},    "formula":"NH4HCO3",    "note":[
      {        "cn":"碳铵，易分解（NH₃↑+CO₂↑+H₂O）而“跑氨”，须深施覆土；常用化肥。",        "en":"Ammonium bicarbonate, easily decomposes (NH₃↑+CO₂↑+H₂O) causing 'ammonia loss'; must be applied deep and covered with soil; common fertilizer."}
    ],    "related":[],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"室温/受热",          "en":"room temperature/heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 NH₃ + CO₂ + H₂O",          "en":"Decomposes to NH₃ + CO₂ + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 21.6g/100mL",          "en":"~21.6g/100mL at 20°C"}}
    ]},
  "CaC2":{    "verdict":"yes",    "name":{      "cn":"碳化钙（电石）",      "en":"Calcium carbide"},    "formula":"CaC2",    "note":[
      {        "cn":"遇水剧烈放出乙炔 C₂H₂（电石灯/气焊原理）；须防水密封保存。",        "en":"Reacts vigorously with water to release acetylene C₂H₂ (principle of carbide lamp/gas welding); must be kept sealed and away from water."}
    ],    "related":[
      "C2H2"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"与水",          "en":"with water"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"水解生成 C₂H₂ + Ca(OH)₂",          "en":"Hydrolyzes to form C₂H₂ + Ca(OH)₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应放出乙炔",          "en":"Reacts with water to release acetylene"}}
    ]},
  "CaSO4.2H2O":{    "verdict":"yes",    "name":{      "cn":"二水硫酸钙（石膏）",      "en":"Calcium sulfate dihydrate (gypsum)"},    "formula":"CaSO4.2H2O",    "note":[
      {        "cn":"石膏，加热至约 150℃ 部分脱水为熟石膏 CaSO₄·½H₂O（模型/固定），再高温成硬石膏。",        "en":"Gypsum; partially dehydrates to plaster of Paris CaSO₄·½H₂O at about 150°C (for molds/casting), then to anhydrite at higher temperatures."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ca²⁺ 与 SO₄²⁻ 均稳定",          "en":"Ca²⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 0.21g/100mL",          "en":"~0.21g/100mL at 20°C"}}
    ]},
  "SiO2":{    "verdict":"yes",    "name":{      "cn":"二氧化硅",      "en":"Silicon dioxide"},    "formula":"SiO2",    "note":[
      {        "cn":"石英/砂的主要成分；极稳定，是酸性氧化物（与强碱缓慢反应）。",        "en":"Main component of quartz/sand; extremely stable, an acidic oxide (slowly reacts with strong base)."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Si(IV) 极稳定",          "en":"Si(IV) is extremely stable"}},
      {        "condition":{          "cn":"高温与碳",          "en":"high temperature with carbon"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"高温被碳还原为 Si",          "en":"Reduced to Si by carbon at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"氢氟酸",          "en":"hydrofluoric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"与 HF 反应生成 SiF₄",          "en":"Reacts with HF to form SiF₄"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"与强碱缓慢反应生成硅酸盐",          "en":"Slowly reacts with strong base to form silicate"}}
    ]},
  "FeO":{    "verdict":"conditional",    "name":{      "cn":"氧化亚铁",      "en":"Iron(II) oxide"},    "formula":"FeO",    "note":[
      {        "cn":"非整比化合物，常写作 Fe₁₋ₓO；空气中易被氧化为 Fe₃O₄，须隔绝空气制备。",        "en":"Non-stoichiometric compound, often written as Fe₁₋ₓO; easily oxidized to Fe₃O₄ in air, must be prepared under air-free conditions."}
    ],    "related":[
      "Fe3O4",
      "Fe2O3"
    ],    "tags":[
      "oxidize",
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Fe(II) 被氧化为 Fe(III)",          "en":"Fe(II) is oxidized to Fe(III)"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"高温可被 C、CO、H₂ 还原为 Fe",          "en":"Can be reduced to Fe by C, CO, H₂ at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"生成 Fe²⁺",          "en":"Forms Fe²⁺"}}
    ]},
  "Fe2O3":{    "verdict":"yes",    "name":{      "cn":"三氧化二铁",      "en":"Iron(III) oxide"},    "formula":"Fe2O3",    "note":[
      {        "cn":"铁红/赤铁矿，稳定；用作颜料与催化剂。",        "en":"Iron red/hematite, stable; used as pigment and catalyst."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温与还原剂",          "en":"high temperature with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被 C、CO、H₂ 还原为 Fe",          "en":"Reduced to Fe by C, CO, H₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Fe(III) 较稳定",          "en":"Fe(III) is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Fe³⁺",          "en":"Dissolves in acid to form Fe³⁺"}}
    ]},
  "Fe3O4":{    "verdict":"yes",    "name":{      "cn":"四氧化三铁",      "en":"Iron(II,III) oxide"},    "formula":"Fe3O4",    "note":[
      {        "cn":"磁铁矿，含铁(II,III)；具磁性，稳定。",        "en":"Magnetite, contains Fe(II,III); magnetic, stable."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温与还原剂",          "en":"high temperature with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被 C、CO 还原为 Fe",          "en":"Reduced to Fe by C, CO"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Fe(II,III) 混合价较稳定",          "en":"Fe(II,III) mixed valence is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Fe²⁺ 与 Fe³⁺",          "en":"Dissolves in acid to form Fe²⁺ and Fe³⁺"}}
    ]},
  "CuO":{    "verdict":"yes",    "name":{      "cn":"氧化铜",      "en":"Copper(II) oxide"},    "formula":"CuO",    "note":[
      {        "cn":"黑色，稳定；溶于酸生成 Cu²⁺。",        "en":"Black, stable; dissolves in acid to form Cu²⁺."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温与还原剂",          "en":"high temperature with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被 C、CO、H₂ 还原为 Cu",          "en":"Reduced to Cu by C, CO, H₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Cu(II) 较稳定",          "en":"Cu(II) is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Cu²⁺",          "en":"Dissolves in acid to form Cu²⁺"}}
    ]},
  "Cu2O":{    "verdict":"yes",    "name":{      "cn":"氧化亚铜",      "en":"Copper(I) oxide"},    "formula":"Cu2O",    "note":[
      {        "cn":"砖红色，Cu(I) 氧化物；溶于酸发生歧化；用于船底防污漆与红色玻璃。",        "en":"Brick red, Cu(I) oxide; disproportionates in acid; used in antifouling paint and red glass."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"在酸中",          "en":"in acid"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"Cu(I) 歧化为 Cu²⁺ + Cu",          "en":"Cu(I) disproportionates to Cu²⁺ + Cu"}},
      {        "condition":{          "cn":"在空气中加热",          "en":"heated in air"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被氧化为 CuO",          "en":"Oxidized to CuO"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 Cu",          "en":"Can be reduced to Cu"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸发生歧化",          "en":"Dissolves in acid with disproportionation"}}
    ]},
  "Al2O3":{    "verdict":"yes",    "name":{      "cn":"氧化铝",      "en":"Aluminum oxide"},    "formula":"Al2O3",    "note":[
      {        "cn":"刚玉/矾土，极稳定、高熔点；天然刚玉（红/蓝宝石）含杂质；用作磨料与载体。",        "en":"Corundum/bauxite, extremely stable, high melting point; natural corundum (ruby/sapphire) contains impurities; used as abrasive and catalyst support."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温电解",          "en":"high-temperature electrolysis"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"电解熔融 Al₂O₃ 生成 Al + O₂",          "en":"Electrolysis of molten Al₂O₃ produces Al + O₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Al(III) 极稳定",          "en":"Al(III) is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"溶于强酸生成 Al³⁺",          "en":"Slightly soluble; dissolves in strong acid to form Al³⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"溶于强碱生成 [Al(OH)₄]⁻",          "en":"Slightly soluble; dissolves in strong base to form [Al(OH)₄]⁻"}}
    ]},
  "CH4":{    "verdict":"yes",    "name":{      "cn":"甲烷",      "en":"Methane"},    "formula":"CH4",    "note":[
      {        "cn":"天然气主要成分，易燃，是最简单的有机物。",        "en":"Main component of natural gas, flammable, the simplest organic compound."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}},
      {        "condition":{          "cn":"与卤素",          "en":"with halogens"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可发生取代反应",          "en":"Can undergo substitution reactions"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 2.3mL/100mL，难溶于水",          "en":"~2.3mL/100mL at 20°C, poorly soluble in water"}}
    ]},
  "C2H6":{    "verdict":"yes",    "name":{      "cn":"乙烷",      "en":"Ethane"},    "formula":"C2H6",    "note":[
      {        "cn":"天然气组分，易燃。",        "en":"Natural gas component, flammable."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"难溶于水",          "en":"Poorly soluble in water"}}
    ]},
  "C2H4":{    "verdict":"yes",    "name":{      "cn":"乙烯",      "en":"Ethylene"},    "formula":"C2H4",    "note":[
      {        "cn":"植物激素/化工原料，可燃，可被 KMnO₄ 氧化使紫红色褪去。",        "en":"Plant hormone/chemical feedstock, flammable; can be oxidized by KMnO₄ fading the purplish-red color."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}},
      {        "condition":{          "cn":"与 KMnO₄",          "en":"with KMnO₄"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为乙二醇或 CO₂",          "en":"Oxidized to ethylene glycol or CO₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"难溶于水",          "en":"Poorly soluble in water"}}
    ]},
  "C2H2":{    "verdict":"yes",    "name":{      "cn":"乙炔",      "en":"Acetylene"},    "formula":"C2H2",    "note":[
      {        "cn":"电石气，燃烧火焰温度高（氧炔焰）；可燃。",        "en":"Carbide gas; combustion flame has high temperature (oxy-acetylene flame); flammable."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}},
      {        "condition":{          "cn":"与 KMnO₄",          "en":"with KMnO₄"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被氧化",          "en":"Can be oxidized"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"微溶于水",          "en":"Slightly soluble in water"}},
      {        "solvent":{          "cn":"丙酮",          "en":"acetone"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"易溶于丙酮（乙炔钢瓶储存）",          "en":"Soluble in acetone (acetylene cylinder storage)"}}
    ]},
  "C6H6":{    "verdict":"yes",    "name":{      "cn":"苯",      "en":"Benzene"},    "formula":"C6H6",    "note":[
      {        "cn":"芳香烃，易燃有毒，长期接触损害造血系统（致癌）。",        "en":"Aromatic hydrocarbon, flammable and toxic; long-term exposure damages hematopoietic system (carcinogenic)."}
    ],    "related":[],    "tags":[
      "toxic",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O，火焰冒黑烟",          "en":"Oxidized to CO₂ + H₂O by O₂, flame produces black smoke"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"比水轻，不溶于水",          "en":"Lighter than water, insoluble in water"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"与乙醇互溶",          "en":"Miscible with ethanol"}}
    ]},
  "C2H5OH":{    "verdict":"yes",    "name":{      "cn":"乙醇",      "en":"Ethanol"},    "formula":"C2H5OH",    "note":[
      {        "cn":"酒精，可燃；饮用/消毒/燃料。",        "en":"Alcohol, flammable; used for drinking/disinfection/fuel."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为乙醛、乙酸",          "en":"Oxidized to acetaldehyde, acetic acid"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "CH3COOH":{    "verdict":"yes",    "name":{      "cn":"乙酸",      "en":"Acetic acid"},    "formula":"CH3COOH",    "note":[
      {        "cn":"醋酸，食醋主要成分；弱酸，可燃。",        "en":"Vinegar acid, main component of vinegar; weak acid, flammable."}
    ],    "related":[],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "CH3OH":{    "verdict":"yes",    "name":{      "cn":"甲醇",      "en":"Methanol"},    "formula":"CH3OH",    "note":[
      {        "cn":"剧毒！饮用致盲甚至致死；用作溶剂与燃料。",        "en":"Highly toxic! Ingestion causes blindness or death; used as solvent and fuel."}
    ],    "related":[],    "tags":[
      "toxic",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO₂ + H₂O",          "en":"Oxidized to CO₂ + H₂O by O₂"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为甲醛、甲酸",          "en":"Oxidized to formaldehyde, formic acid"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"与水任意比互溶",          "en":"Miscible with water in any ratio"}}
    ]},
  "C12H22O11":{    "verdict":"yes",    "name":{      "cn":"蔗糖",      "en":"Sucrose"},    "formula":"C12H22O11",    "note":[
      {        "cn":"食糖，稳定；加热焦糖化，强热炭化。",        "en":"Table sugar, stable; caramelizes on heating, carbonizes at high temperature."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与浓硫酸",          "en":"with concentrated sulfuric acid"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被浓硫酸脱水炭化",          "en":"Dehydrated and carbonized by concentrated sulfuric acid"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"常温稳定",          "en":"Stable at room temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 203.9g/100mL",          "en":"~203.9g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"微溶于乙醇",          "en":"Slightly soluble in ethanol"}}
    ]},
  "KCl":{    "verdict":"yes",    "name":{      "cn":"氯化钾",      "en":"Potassium chloride"},    "formula":"KCl",    "note":[
      {        "cn":"白色晶体，钾肥主要成分；电解制钾的原料。",        "en":"White crystals, main component of potash fertilizer; raw material for electrolytic production of potassium."}
    ],    "related":[
      "NaCl"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"熔融电解",          "en":"molten electrolysis"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"电解生成 K + Cl₂",          "en":"Electrolysis produces K + Cl₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"K⁺ 与 Cl⁻ 均稳定",          "en":"K⁺ and Cl⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 34.2g/100mL",          "en":"~34.2g/100mL at 20°C"}}
    ]},
  "NaBr":{    "verdict":"yes",    "name":{      "cn":"溴化钠",      "en":"Sodium bromide"},    "formula":"NaBr",    "note":[
      {        "cn":"白色晶体，用于制溴化银感光材料与镇静剂。",        "en":"White crystals, used to make silver bromide photosensitive materials and sedatives."}
    ],    "related":[
      "NaCl"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Br⁻ 可被 Cl₂ 氧化为 Br₂",          "en":"Br⁻ can be oxidized to Br₂ by Cl₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 Br⁻ 均稳定",          "en":"Na⁺ and Br⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 90.3g/100mL",          "en":"~90.3g/100mL at 20°C"}}
    ]},
  "NaI":{    "verdict":"yes",    "name":{      "cn":"碘化钠",      "en":"Sodium iodide"},    "formula":"NaI",    "note":[
      {        "cn":"白色晶体，易潮解；用于碘缺乏症防治与有机合成。",        "en":"White crystals, deliquescent; used for iodine deficiency prevention and organic synthesis."}
    ],    "related":[
      "NaCl"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"I⁻ 易被氧化为 I₂",          "en":"I⁻ is easily oxidized to I₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 I⁻ 均稳定",          "en":"Na⁺ and I⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 179g/100mL",          "en":"~179g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "KBr":{    "verdict":"yes",    "name":{      "cn":"溴化钾",      "en":"Potassium bromide"},    "formula":"KBr",    "note":[
      {        "cn":"白色晶体，用于感光材料与医药。",        "en":"White crystals, used in photosensitive materials and medicine."}
    ],    "related":[
      "KCl"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Br⁻ 可被氧化为 Br₂",          "en":"Br⁻ can be oxidized to Br₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 65.2g/100mL",          "en":"~65.2g/100mL at 20°C"}}
    ]},
  "KI":{    "verdict":"yes",    "name":{      "cn":"碘化钾",      "en":"Potassium iodide"},    "formula":"KI",    "note":[
      {        "cn":"白色晶体，易潮解；碘缺乏症防治、加碘盐成分。",        "en":"White crystals, deliquescent; used for iodine deficiency prevention; component of iodized salt."}
    ],    "related":[
      "KCl"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"I⁻ 易被氧化为 I₂（如被 Fe³⁺、Cl₂ 氧化）",          "en":"I⁻ is easily oxidized to I₂ (e.g., by Fe³⁺, Cl₂)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 144g/100mL",          "en":"~144g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "Na2SO4":{    "verdict":"yes",    "name":{      "cn":"硫酸钠",      "en":"Sodium sulfate"},    "formula":"Na2SO4",    "note":[
      {        "cn":"白色晶体，十水合物为芒硝；用于造纸、玻璃工业。",        "en":"White crystals; decahydrate is Glauber's salt; used in paper and glass industry."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 SO₄²⁻ 均稳定",          "en":"Na⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 19.5g/100mL",          "en":"~19.5g/100mL at 20°C"}}
    ]},
  "K2SO4":{    "verdict":"yes",    "name":{      "cn":"硫酸钾",      "en":"Potassium sulfate"},    "formula":"K2SO4",    "note":[
      {        "cn":"白色晶体，常用钾肥。",        "en":"White crystals, common potash fertilizer."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"K⁺ 与 SO₄²⁻ 均稳定",          "en":"K⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 12.0g/100mL",          "en":"~12.0g/100mL at 20°C"}}
    ]},
  "MgCl2":{    "verdict":"yes",    "name":{      "cn":"氯化镁",      "en":"Magnesium chloride"},    "formula":"MgCl2",    "note":[
      {        "cn":"白色晶体，易潮解；卤水主要成分，用于制镁与豆腐凝固剂。",        "en":"White crystals, deliquescent; main component of brine, used to produce magnesium and as tofu coagulant."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"熔融电解",          "en":"molten electrolysis"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"电解生成 Mg + Cl₂",          "en":"Electrolysis produces Mg + Cl₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mg²⁺ 与 Cl⁻ 均稳定",          "en":"Mg²⁺ and Cl⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 54.3g/100mL",          "en":"~54.3g/100mL at 20°C"}}
    ]},
  "MgSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸镁",      "en":"Magnesium sulfate"},    "formula":"MgSO4",    "note":[
      {        "cn":"白色晶体，七水合物为泻盐（硫苦）；用于医药与肥料。",        "en":"White crystals; heptahydrate is Epsom salt; used in medicine and fertilizer."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mg²⁺ 与 SO₄²⁻ 均稳定",          "en":"Mg²⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 35.1g/100mL",          "en":"~35.1g/100mL at 20°C"}}
    ]},
  "CaCl2":{    "verdict":"yes",    "name":{      "cn":"氯化钙",      "en":"Calcium chloride"},    "formula":"CaCl2",    "note":[
      {        "cn":"白色固体，极易潮解；用作干燥剂、融雪剂与钙补充剂。",        "en":"White solid, extremely deliquescent; used as desiccant, deicing agent, and calcium supplement."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"熔融电解",          "en":"molten electrolysis"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"电解生成 Ca + Cl₂",          "en":"Electrolysis produces Ca + Cl₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ca²⁺ 与 Cl⁻ 均稳定",          "en":"Ca²⁺ and Cl⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 74.5g/100mL，溶解放热",          "en":"~74.5g/100mL at 20°C, exothermic dissolution"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "K2CO3":{    "verdict":"yes",    "name":{      "cn":"碳酸钾",      "en":"Potassium carbonate"},    "formula":"K2CO3",    "note":[
      {        "cn":"白色晶体，草木灰主要成分；水溶液呈碱性，用于制皂与玻璃。",        "en":"White crystals, main component of wood ash; aqueous solution is alkaline; used in soap and glass making."}
    ],    "related":[
      "Na2CO3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"K⁺ 与 CO₃²⁻ 均稳定",          "en":"K⁺ and CO₃²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 112g/100mL",          "en":"~112g/100mL at 20°C"}}
    ]},
  "Na2SO3":{    "verdict":"yes",    "name":{      "cn":"亚硫酸钠",      "en":"Sodium sulfite"},    "formula":"Na2SO3",    "note":[
      {        "cn":"白色晶体，还原剂；易被空气氧化为硫酸钠。",        "en":"White crystals, reducing agent; easily oxidized by air to sodium sulfate."}
    ],    "related":[
      "Na2SO4"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S(IV) 被氧化为 S(VI) 的硫酸钠",          "en":"S(IV) is oxidized to S(VI) as sodium sulfate"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被 KMnO₄、I₂ 等氧化",          "en":"Can be oxidized by KMnO₄, I₂, etc."}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 19.5g/100mL",          "en":"~19.5g/100mL at 20°C"}}
    ]},
  "Na2S":{    "verdict":"yes",    "name":{      "cn":"硫化钠",      "en":"Sodium sulfide"},    "formula":"Na2S",    "note":[
      {        "cn":"白色/淡黄色固体，易潮解；水溶液呈强碱性，有还原性。",        "en":"White/pale yellow solid, deliquescent; aqueous solution is strongly alkaline, with reducing properties."}
    ],    "related":[],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S²⁻ 被氧化为 S 或多硫化物",          "en":"S²⁻ is oxidized to S or polysulfide"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 S 或 SO₄²⁻",          "en":"Oxidized to S or SO₄²⁻"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 18.6g/100mL，水解呈碱性",          "en":"~18.6g/100mL at 20°C, hydrolyzes to alkaline"}}
    ]},
  "Na2S2O3":{    "verdict":"yes",    "name":{      "cn":"硫代硫酸钠（大苏打/海波）",      "en":"Sodium thiosulfate (hypo)"},    "formula":"Na2S2O3",    "note":[
      {        "cn":"无色晶体，用作定影剂（溶去未感光 AgBr）、脱氯剂；与 I₂ 定量反应（碘量法原理）。",        "en":"Colorless crystals; used as fixing agent (dissolves unexposed AgBr), dechlorinator; reacts quantitatively with I₂ (principle of iodometry)."}
    ],    "related":[
      "Na2SO3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与 I₂",          "en":"with I₂"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S₂O₃²⁻ 被氧化为 S₄O₆²⁻（碘量法）",          "en":"S₂O₃²⁻ is oxidized to S₄O₆²⁻ (iodometry)"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 Cl₂ 等氧化为 SO₄²⁻",          "en":"Oxidized to SO₄²⁻ by Cl₂, etc."}},
      {        "condition":{          "cn":"与酸",          "en":"with acid"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 S + SO₂ + H₂O",          "en":"Decomposes to S + SO₂ + H₂O"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 70.1g/100mL",          "en":"~70.1g/100mL at 20°C"}}
    ]},
  "KNO3":{    "verdict":"yes",    "name":{      "cn":"硝酸钾（硝石/火硝）",      "en":"Potassium nitrate (saltpeter)"},    "formula":"KNO3",    "note":[
      {        "cn":"白色晶体，氧化剂；制黑火药（KNO₃+S+C）、肥料。",        "en":"White crystals, oxidant; used to make black powder (KNO₃+S+C) and fertilizer."}
    ],    "related":[
      "NaNO3"
    ],    "tags":[
      "oxidize",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 KNO₂ + O₂",          "en":"Decomposes to KNO₂ + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"高温强氧化，与 C/S 混合爆炸",          "en":"Strong oxidant at high temperature; explodes with C/S mixtures"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 31.6g/100mL，温度升高溶解度大增",          "en":"~31.6g/100mL at 20°C; solubility increases greatly with temperature"}}
    ]},
  "NaNO3":{    "verdict":"yes",    "name":{      "cn":"硝酸钠（智利硝石）",      "en":"Sodium nitrate (Chile saltpeter)"},    "formula":"NaNO3",    "note":[
      {        "cn":"白色晶体，氧化剂；肥料与防腐剂。",        "en":"White crystals, oxidant; fertilizer and preservative."}
    ],    "related":[
      "KNO3"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 NaNO₂ + O₂",          "en":"Decomposes to NaNO₂ + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"高温强氧化",          "en":"Strong oxidant at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 92.1g/100mL",          "en":"~92.1g/100mL at 20°C"}}
    ]},
  "(NH4)3PO4":{    "verdict":"yes",    "name":{      "cn":"磷酸铵",      "en":"Ammonium phosphate"},    "formula":"(NH4)3PO4",    "note":[
      {        "cn":"白色晶体，复合肥料（N+P）；易分解失去氨。",        "en":"White crystals, compound fertilizer (N+P); easily decomposes losing ammonia."}
    ],    "related":[],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"NH₄⁺ 与 PO₄³⁻ 均稳定",          "en":"NH₄⁺ and PO₄³⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水",          "en":"Easily soluble in water"}}
    ]},
  "Na3PO4":{    "verdict":"yes",    "name":{      "cn":"磷酸钠",      "en":"Trisodium phosphate"},    "formula":"Na3PO4",    "note":[
      {        "cn":"白色晶体，水溶液强碱性；用作洗涤剂与水处理。",        "en":"White crystals; aqueous solution is strongly alkaline; used as detergent and water treatment."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 PO₄³⁻ 均稳定",          "en":"Na⁺ and PO₄³⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 12.1g/100mL，强碱性",          "en":"~12.1g/100mL at 20°C, strongly alkaline"}}
    ]},
  "K3PO4":{    "verdict":"yes",    "name":{      "cn":"磷酸钾",      "en":"Tripotassium phosphate"},    "formula":"K3PO4",    "note":[
      {        "cn":"白色晶体，水溶液呈碱性；用于肥料与食品添加剂。",        "en":"White crystals; aqueous solution is alkaline; used in fertilizer and food additives."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"K⁺ 与 PO₄³⁻ 均稳定",          "en":"K⁺ and PO₄³⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 90g/100mL",          "en":"~90g/100mL at 20°C"}}
    ]},
  "Na2HPO4":{    "verdict":"yes",    "name":{      "cn":"磷酸氢二钠",      "en":"Disodium hydrogen phosphate"},    "formula":"Na2HPO4",    "note":[
      {        "cn":"白色晶体，十二水合物常见；缓冲溶液组分。",        "en":"White crystals; dodecahydrate is common; buffer solution component."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 HPO₄²⁻ 均稳定",          "en":"Na⁺ and HPO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 7.7g/100mL",          "en":"~7.7g/100mL at 20°C"}}
    ]},
  "NaH2PO4":{    "verdict":"yes",    "name":{      "cn":"磷酸二氢钠",      "en":"Sodium dihydrogen phosphate"},    "formula":"NaH2PO4",    "note":[
      {        "cn":"白色晶体，弱酸性；缓冲溶液与发酵剂。",        "en":"White crystals, weakly acidic; buffer solution and leavening agent."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 H₂PO₄⁻ 均稳定",          "en":"Na⁺ and H₂PO₄⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 7.8g/100mL",          "en":"~7.8g/100mL at 20°C"}}
    ]},
  "Ca(NO3)2":{    "verdict":"yes",    "name":{      "cn":"硝酸钙",      "en":"Calcium nitrate"},    "formula":"Ca(NO3)2",    "note":[
      {        "cn":"白色晶体，易潮解；钙肥与氮肥。",        "en":"White crystals, deliquescent; calcium and nitrogen fertilizer."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 Ca(NO₂)₂ + O₂",          "en":"Decomposes to Ca(NO₂)₂ + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"高温氧化剂",          "en":"Oxidant at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 121g/100mL",          "en":"~121g/100mL at 20°C"}}
    ]},
  "Mg(NO3)2":{    "verdict":"yes",    "name":{      "cn":"硝酸镁",      "en":"Magnesium nitrate"},    "formula":"Mg(NO3)2",    "note":[
      {        "cn":"白色晶体，易潮解；六水合物常见。",        "en":"White crystals, deliquescent; hexahydrate is common."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 MgO + NO₂ + O₂",          "en":"Decomposes to MgO + NO₂ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 71g/100mL",          "en":"~71g/100mL at 20°C"}}
    ]},
  "AlCl3":{    "verdict":"yes",    "name":{      "cn":"氯化铝",      "en":"Aluminum chloride"},    "formula":"AlCl3",    "note":[
      {        "cn":"白色固体，易升华；路易斯酸催化剂（弗里德尔-克拉夫茨反应）。",        "en":"White solid, easily sublimes; Lewis acid catalyst (Friedel-Crafts reaction)."}
    ],    "related":[],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Al³⁺ 与 Cl⁻ 均稳定",          "en":"Al³⁺ and Cl⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，水解呈酸性",          "en":"Easily soluble in water, hydrolyzes to acidic"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "Al2(SO4)3":{    "verdict":"yes",    "name":{      "cn":"硫酸铝",      "en":"Aluminum sulfate"},    "formula":"Al2(SO4)3",    "note":[
      {        "cn":"白色晶体，水解呈酸性；净水剂（明矾主要成分之一）与造纸施胶。",        "en":"White crystals, hydrolyzes to acidic; water purifier (main component of alum) and paper sizing agent."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Al³⁺ 与 SO₄²⁻ 均稳定",          "en":"Al³⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 36.4g/100mL",          "en":"~36.4g/100mL at 20°C"}}
    ]},
  "ZnCl2":{    "verdict":"yes",    "name":{      "cn":"氯化锌",      "en":"Zinc chloride"},    "formula":"ZnCl2",    "note":[
      {        "cn":"白色固体，易潮解；焊接助焊剂、电池电解液。",        "en":"White solid, deliquescent; soldering flux, battery electrolyte."}
    ],    "related":[],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Zn²⁺ 与 Cl⁻ 均稳定",          "en":"Zn²⁺ and Cl⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 432g/100mL",          "en":"~432g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "ZnSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸锌",      "en":"Zinc sulfate"},    "formula":"ZnSO4",    "note":[
      {        "cn":"白色晶体，七水合物为皓矾；补锌剂、农药与电镀。",        "en":"White crystals; heptahydrate is white vitriol; zinc supplement, pesticide, and electroplating."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Zn²⁺ 与 SO₄²⁻ 均稳定",          "en":"Zn²⁺ and SO₄²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 54.4g/100mL",          "en":"~54.4g/100mL at 20°C"}}
    ]},
  "FeCl2":{    "verdict":"yes",    "name":{      "cn":"氯化亚铁",      "en":"Iron(II) chloride"},    "formula":"FeCl2",    "note":[
      {        "cn":"绿色/白色晶体，易潮解；在空气中氧化为 Fe(III)。",        "en":"Green/white crystals, deliquescent; oxidized to Fe(III) in air."}
    ],    "related":[
      "FeCl3"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Fe²⁺ 被氧化为 Fe³⁺",          "en":"Fe²⁺ is oxidized to Fe³⁺"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 KMnO₄、Cl₂ 等氧化为 Fe³⁺",          "en":"Oxidized to Fe³⁺ by KMnO₄, Cl₂, etc."}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 62.5g/100mL",          "en":"~62.5g/100mL at 20°C"}}
    ]},
  "FeSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸亚铁",      "en":"Iron(II) sulfate"},    "formula":"FeSO4",    "note":[
      {        "cn":"七水合物为绿矾，浅绿色；补铁剂、净水与制备铁系颜料。",        "en":"Heptahydrate is melanterite (green vitriol), pale green; iron supplement, water purification, and preparation of iron pigments."}
    ],    "related":[
      "Fe2(SO4)3"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Fe²⁺ 被氧化为 Fe³⁺（变黄）",          "en":"Fe²⁺ is oxidized to Fe³⁺ (turns yellow)"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 Fe³⁺",          "en":"Oxidized to Fe³⁺"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 26.5g/100mL",          "en":"~26.5g/100mL at 20°C"}}
    ]},
  "Fe2(SO4)3":{    "verdict":"yes",    "name":{      "cn":"硫酸铁",      "en":"Iron(III) sulfate"},    "formula":"Fe2(SO4)3",    "note":[
      {        "cn":"黄白色固体，易吸潮；净水剂与媒染剂。",        "en":"Yellowish-white solid, hygroscopic; water purifier and mordant."}
    ],    "related":[
      "FeSO4"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Fe³⁺ 可被还原为 Fe²⁺",          "en":"Fe³⁺ can be reduced to Fe²⁺"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Fe³⁺ 较稳定",          "en":"Fe³⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于水，水解呈酸性",          "en":"Dissolves in water, hydrolyzes to acidic"}}
    ]},
  "CuCl2":{    "verdict":"yes",    "name":{      "cn":"氯化铜",      "en":"Copper(II) chloride"},    "formula":"CuCl2",    "note":[
      {        "cn":"棕黄色固体；稀溶液蓝色，浓溶液绿色（[CuCl₄]²⁻ 与 [Cu(H₂O)₄]²⁺ 共存）。",        "en":"Brownish-yellow solid; dilute solution is blue, concentrated solution is green ([CuCl₄]²⁻ and [Cu(H₂O)₄]²⁺ coexist)."}
    ],    "related":[
      "CuCl"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cu²⁺ 可被还原为 Cu⁺ 或 Cu",          "en":"Cu²⁺ can be reduced to Cu⁺ or Cu"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Cu²⁺ 较稳定",          "en":"Cu²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 73g/100mL",          "en":"~73g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "Cu(NO3)2":{    "verdict":"yes",    "name":{      "cn":"硝酸铜",      "en":"Copper(II) nitrate"},    "formula":"Cu(NO3)2",    "note":[
      {        "cn":"蓝色晶体（三水合物）；溶于水呈蓝绿色。",        "en":"Blue crystals (trihydrate); dissolves in water to form blue-green solution."}
    ],    "related":[],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 CuO + NO₂ + O₂",          "en":"Decomposes to CuO + NO₂ + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cu²⁺ 可被还原",          "en":"Cu²⁺ can be reduced"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 137g/100mL",          "en":"~137g/100mL at 20°C"}}
    ]},
  "CuCl":{    "verdict":"yes",    "name":{      "cn":"氯化亚铜",      "en":"Copper(I) chloride"},    "formula":"CuCl",    "note":[
      {        "cn":"白色粉末，难溶于水；在空气中氧化为 Cu(II)。",        "en":"White powder, insoluble in water; oxidized to Cu(II) in air."}
    ],    "related":[
      "CuCl2"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Cu(I) 被氧化为 Cu(II)",          "en":"Cu(I) is oxidized to Cu(II)"}},
      {        "condition":{          "cn":"在酸中",          "en":"in acid"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"Cu(I) 歧化为 Cu²⁺ + Cu",          "en":"Cu(I) disproportionates to Cu²⁺ + Cu"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"难溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"盐酸",          "en":"hydrochloric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于浓盐酸生成 [CuCl₂]⁻",          "en":"Dissolves in concentrated HCl to form [CuCl₂]⁻"}}
    ]},
  "MnCl2":{    "verdict":"yes",    "name":{      "cn":"氯化锰",      "en":"Manganese(II) chloride"},    "formula":"MnCl2",    "note":[
      {        "cn":"粉红色晶体（四水合物）；制备锰化合物原料。",        "en":"Pink crystals (tetrahydrate); raw material for manganese compounds."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mn²⁺ 较稳定",          "en":"Mn²⁺ is relatively stable"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Mn²⁺ 可被氧化为 MnO₂ 或 MnO₄⁻",          "en":"Mn²⁺ can be oxidized to MnO₂ or MnO₄⁻"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 72.3g/100mL",          "en":"~72.3g/100mL at 20°C"}}
    ]},
  "MnSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸锰",      "en":"Manganese(II) sulfate"},    "formula":"MnSO4",    "note":[
      {        "cn":"淡粉色晶体；锰肥与饲料添加剂。",        "en":"Pale pink crystals; manganese fertilizer and feed additive."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mn²⁺ 较稳定",          "en":"Mn²⁺ is relatively stable"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被氧化为 MnO₂ 或 MnO₄⁻",          "en":"Can be oxidized to MnO₂ or MnO₄⁻"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 52g/100mL",          "en":"~52g/100mL at 20°C"}}
    ]},
  "NiCl2":{    "verdict":"yes",    "name":{      "cn":"氯化镍",      "en":"Nickel(II) chloride"},    "formula":"NiCl2",    "note":[
      {        "cn":"绿色晶体（六水合物）；电镀与催化剂。",        "en":"Green crystals (hexahydrate); electroplating and catalyst."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ni²⁺ 较稳定",          "en":"Ni²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 60.8g/100mL",          "en":"~60.8g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "NiSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸镍",      "en":"Nickel(II) sulfate"},    "formula":"NiSO4",    "note":[
      {        "cn":"绿色晶体（七水合物）；电镀与电池原料。",        "en":"Green crystals (heptahydrate); electroplating and battery material."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ni²⁺ 较稳定",          "en":"Ni²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 38.4g/100mL",          "en":"~38.4g/100mL at 20°C"}}
    ]},
  "CoCl2":{    "verdict":"yes",    "name":{      "cn":"氯化钴",      "en":"Cobalt(II) chloride"},    "formula":"CoCl2",    "note":[
      {        "cn":"蓝色（无水）/粉红色（六水合物）晶体；干燥剂硅胶变色指示剂。",        "en":"Blue (anhydrous)/pink (hexahydrate) crystals; silica gel desiccant color indicator."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Co²⁺ 较稳定",          "en":"Co²⁺ is relatively stable"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被氧化为 Co³⁺",          "en":"Can be oxidized to Co³⁺"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 52.9g/100mL",          "en":"~52.9g/100mL at 20°C"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "CoSO4":{    "verdict":"yes",    "name":{      "cn":"硫酸钴",      "en":"Cobalt(II) sulfate"},    "formula":"CoSO4",    "note":[
      {        "cn":"红色晶体（七水合物）；电镀与陶瓷着色。",        "en":"Red crystals (heptahydrate); electroplating and ceramic coloring."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Co²⁺ 较稳定",          "en":"Co²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 36.2g/100mL",          "en":"~36.2g/100mL at 20°C"}}
    ]},
  "CrCl3":{    "verdict":"yes",    "name":{      "cn":"氯化铬",      "en":"Chromium(III) chloride"},    "formula":"CrCl3",    "note":[
      {        "cn":"紫色/绿色晶体（六水合物有多种异构体）；镀铬与催化剂。",        "en":"Purple/green crystals (hexahydrate has multiple isomers); chrome plating and catalyst."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Cr³⁺ 较稳定",          "en":"Cr³⁺ is relatively stable"}},
      {        "condition":{          "cn":"在碱性条件下与氧化剂",          "en":"with oxidants under alkaline conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Cr(III) 可被氧化为 Cr(VI)",          "en":"Cr(III) can be oxidized to Cr(VI)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 58.6g/100mL",          "en":"~58.6g/100mL at 20°C"}}
    ]},
  "Cr2(SO4)3":{    "verdict":"yes",    "name":{      "cn":"硫酸铬",      "en":"Chromium(III) sulfate"},    "formula":"Cr2(SO4)3",    "note":[
      {        "cn":"紫色/绿色晶体；鞣革与镀铬。",        "en":"Purple/green crystals; leather tanning and chrome plating."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Cr³⁺ 较稳定",          "en":"Cr³⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于水",          "en":"Dissolves in water"}}
    ]},
  "PbCl2":{    "verdict":"yes",    "name":{      "cn":"氯化铅",      "en":"Lead(II) chloride"},    "formula":"PbCl2",    "note":[
      {        "cn":"白色晶体，难溶于冷水、溶于热水；有毒。",        "en":"White crystals, insoluble in cold water, soluble in hot water; toxic."}
    ],    "related":[
      "Pb(NO3)2"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Pb²⁺ 与 Cl⁻ 均较稳定",          "en":"Pb²⁺ and Cl⁻ are both relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"冷水难溶，热水溶解度增大；20°C 约 1.0g/100mL",          "en":"Insoluble in cold water, solubility increases in hot water; ~1.0g/100mL at 20°C"}}
    ]},
  "Pb(NO3)2":{    "verdict":"yes",    "name":{      "cn":"硝酸铅",      "en":"Lead(II) nitrate"},    "formula":"Pb(NO3)2",    "note":[
      {        "cn":"白色晶体，易溶于水；有毒，用于铬黄颜料与试剂。",        "en":"White crystals, easily soluble in water; toxic; used in chrome yellow pigment and reagent."}
    ],    "related":[
      "PbCl2"
    ],    "tags":[
      "toxic",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 PbO + NO₂ + O₂",          "en":"Decomposes to PbO + NO₂ + O₂"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"NO₃⁻ 可氧化还原剂",          "en":"NO₃⁻ can oxidize reducing agents"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 59.7g/100mL",          "en":"~59.7g/100mL at 20°C"}}
    ]},
  "Pb(Ac)2":{    "verdict":"yes",    "name":{      "cn":"醋酸铅",      "en":"Lead(II) acetate"},    "formula":"Pb(Ac)2",    "note":[
      {        "cn":"无色晶体，味甜（有毒！）；Ac 代表醋酸根 CH₃COO⁻。可溶性铅盐，用于试剂。",        "en":"Colorless crystals, sweet-tasting (toxic!); Ac represents acetate CH₃COO⁻. Soluble lead salt, used as reagent."}
    ],    "related":[
      "Pb(NO3)2"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Pb²⁺ 与醋酸根均较稳定",          "en":"Pb²⁺ and acetate are both relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 44.3g/100mL",          "en":"~44.3g/100mL at 20°C"}}
    ]},
  "Na2O":{    "verdict":"yes",    "name":{      "cn":"氧化钠",      "en":"Sodium oxide"},    "formula":"Na2O",    "note":[
      {        "cn":"白色固体，碱性氧化物；遇水生成 NaOH。",        "en":"White solid, basic oxide; forms NaOH with water."}
    ],    "related":[
      "NaOH"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 O²⁻ 均稳定",          "en":"Na⁺ and O²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 NaOH",          "en":"Reacts with water to form NaOH"}}
    ]},
  "K2O":{    "verdict":"yes",    "name":{      "cn":"氧化钾",      "en":"Potassium oxide"},    "formula":"K2O",    "note":[
      {        "cn":"淡黄色固体，碱性氧化物；遇水生成 KOH。",        "en":"Pale yellow solid, basic oxide; forms KOH with water."}
    ],    "related":[
      "KOH"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"K⁺ 与 O²⁻ 均稳定",          "en":"K⁺ and O²⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 KOH",          "en":"Reacts with water to form KOH"}}
    ]},
  "MgO":{    "verdict":"yes",    "name":{      "cn":"氧化镁",      "en":"Magnesium oxide"},    "formula":"MgO",    "note":[
      {        "cn":"白色粉末，高熔点（耐火材料）；碱性氧化物。",        "en":"White powder, high melting point (refractory material); basic oxide."}
    ],    "related":[
      "Mg(OH)2"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mg²⁺ 与 O²⁻ 均极稳定",          "en":"Mg²⁺ and O²⁻ are both extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"缓慢水化为 Mg(OH)₂",          "en":"Slowly hydrates to Mg(OH)₂"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Mg²⁺",          "en":"Dissolves in acid to form Mg²⁺"}}
    ]},
  "ZnO":{    "verdict":"yes",    "name":{      "cn":"氧化锌",      "en":"Zinc oxide"},    "formula":"ZnO",    "note":[
      {        "cn":"白色粉末（锌白），两性氧化物；加热变黄（色变可逆）；用作颜料、防晒与橡胶。",        "en":"White powder (zinc white), amphoteric oxide; turns yellow on heating (reversible color change); used as pigment, sunscreen, and rubber."}
    ],    "related":[
      "Zn(OH)2"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温与还原剂",          "en":"high temperature with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被 C、CO 还原为 Zn",          "en":"Reduced to Zn by C, CO"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Zn²⁺ 较稳定",          "en":"Zn²⁺ is relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Zn²⁺",          "en":"Dissolves in acid to form Zn²⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于强碱生成锌酸根",          "en":"Dissolves in strong base to form zincate"}}
    ]},
  "Mn2O7":{    "verdict":"conditional",    "name":{      "cn":"七氧化二锰（高锰酸酐）",      "en":"Manganese(VII) oxide (permanganic anhydride)"},    "formula":"Mn2O7",    "note":[
      {        "cn":"绿色油状液体，极不稳定，0°C 以上即爆炸分解为 MnO₂ + O₃；强氧化剂，遇有机物爆炸。",        "en":"Green oily liquid, extremely unstable; explosively decomposes to MnO₂ + O₃ above 0°C; strong oxidant, explodes with organic matter."}
    ],    "related":[
      "KMnO4"
    ],    "tags":[
      "explosive",
      "oxidize",
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"室温以上",          "en":"above room temperature"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"爆炸分解为 MnO₂ + O₃",          "en":"Explosively decomposes to MnO₂ + O₃"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Mn(VII) 极强氧化剂",          "en":"Mn(VII) is an extremely strong oxidant"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于水生成高锰酸 HMnO₄",          "en":"Dissolves in water to form permanganic acid HMnO₄"}}
    ]},
  "PbO":{    "verdict":"yes",    "name":{      "cn":"氧化铅（密陀僧）",      "en":"Lead(II) oxide (litharge)"},    "formula":"PbO",    "note":[
      {        "cn":"黄色/红色变体；用于铅玻璃、颜料与蓄电池。有毒。",        "en":"Yellow/red variants; used in lead glass, pigments, and batteries. Toxic."}
    ],    "related":[
      "PbO2"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"高温与还原剂",          "en":"high temperature with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"被 C、CO、H₂ 还原为 Pb",          "en":"Reduced to Pb by C, CO, H₂"}},
      {        "condition":{          "cn":"在空气中加热",          "en":"heated in air"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被氧化为 Pb₃O₄ 或 PbO₂",          "en":"Can be oxidized to Pb₃O₄ or PbO₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Pb²⁺",          "en":"Dissolves in acid to form Pb²⁺"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于强碱生成亚铅酸根",          "en":"Dissolves in strong base to form plumbite"}}
    ]},
  "PbO2":{    "verdict":"yes",    "name":{      "cn":"二氧化铅",      "en":"Lead(IV) oxide"},    "formula":"PbO2",    "note":[
      {        "cn":"棕褐色固体，Pb(IV) 氧化物；强氧化剂，铅蓄电池正极活性物质。",        "en":"Brown solid, Pb(IV) oxide; strong oxidant, positive electrode active material in lead-acid batteries."}
    ],    "related":[
      "PbO"
    ],    "tags":[
      "oxidize",
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Pb(IV) 强氧化剂，可氧化 Cl⁻ 为 Cl₂",          "en":"Pb(IV) is a strong oxidant, can oxidize Cl⁻ to Cl₂"}},
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Pb₃O₄ + O₂",          "en":"Decomposes to Pb₃O₄ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"微溶，与酸反应放出 O₂ 或 Cl₂",          "en":"Slightly soluble; reacts with acid releasing O₂ or Cl₂"}}
    ]},
  "Pb3O4":{    "verdict":"yes",    "name":{      "cn":"四氧化三铅（铅丹/红丹）",      "en":"Lead(II,IV) oxide (red lead)"},    "formula":"Pb3O4",    "note":[
      {        "cn":"红色粉末，含 Pb(II) 与 Pb(IV)；防锈漆颜料。有毒。",        "en":"Red powder, contains Pb(II) and Pb(IV); anti-rust paint pigment. Toxic."}
    ],    "related":[
      "PbO",
      "PbO2"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 PbO + O₂",          "en":"Decomposes to PbO + O₂"}},
      {        "condition":{          "cn":"与酸",          "en":"with acid"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"生成 Pb²⁺ + PbO₂",          "en":"Forms Pb²⁺ + PbO₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Pb²⁺ 与 PbO₂",          "en":"Dissolves in acid to form Pb²⁺ and PbO₂"}}
    ]},
  "P2O5":{    "verdict":"yes",    "name":{      "cn":"五氧化二磷（磷酸酐）",      "en":"Phosphorus pentoxide (phosphoric anhydride)"},    "formula":"P2O5",    "note":[
      {        "cn":"白色粉末，极强的吸水性（干燥剂）与脱水性；遇水生成偏磷酸或磷酸。",        "en":"White powder, extremely hygroscopic (desiccant) and dehydrating; forms metaphosphoric or phosphoric acid with water."}
    ],    "related":[
      "H3PO4"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"P(V) 极稳定",          "en":"P(V) is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水剧烈反应生成磷酸（遇冷水生成偏磷酸）",          "en":"Reacts vigorously with water to form phosphoric acid (metaphosphoric acid with cold water)"}}
    ]},
  "N2O5":{    "verdict":"yes",    "name":{      "cn":"五氧化二氮（硝酸酐）",      "en":"Dinitrogen pentoxide (nitric anhydride)"},    "formula":"N2O5",    "note":[
      {        "cn":"白色固体，室温升华、易分解；遇水生成硝酸。强氧化剂。",        "en":"White solid, sublimes at room temperature, easily decomposes; forms nitric acid with water. Strong oxidant."}
    ],    "related":[
      "HNO3"
    ],    "tags":[
      "oxidize",
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"N(V) 强氧化剂",          "en":"N(V) is a strong oxidant"}},
      {        "condition":{          "cn":"室温",          "en":"room temperature"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"缓慢分解为 NO₂ + O₂",          "en":"Slowly decomposes to NO₂ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 HNO₃",          "en":"Reacts with water to form HNO₃"}}
    ]},
  "N2O3":{    "verdict":"conditional",    "name":{      "cn":"三氧化二氮（亚硝酸酐）",      "en":"Dinitrogen trioxide (nitrous anhydride)"},    "formula":"N2O3",    "note":[
      {        "cn":"蓝色液体/固体，低温存在，室温分解为 NO + NO₂；遇水生成亚硝酸。",        "en":"Blue liquid/solid, exists at low temperature, decomposes to NO + NO₂ at room temperature; forms nitrous acid with water."}
    ],    "related":[
      "HNO2"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"室温",          "en":"room temperature"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"分解为 NO + NO₂",          "en":"Decomposes to NO + NO₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"既氧化又还原",          "en":"Both oxidizing and reducing"},        "detail":{          "cn":"N(III) 可被氧化或还原",          "en":"N(III) can be oxidized or reduced"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 HNO₂",          "en":"Reacts with water to form HNO₂"}}
    ]},
  "Cl2O7":{    "verdict":"yes",    "name":{      "cn":"七氧化二氯（高氯酸酐）",      "en":"Dichlorine heptoxide (perchloric anhydride)"},    "formula":"Cl2O7",    "note":[
      {        "cn":"无色油状液体，较强但仍有爆炸性；遇水生成高氯酸。",        "en":"Colorless oily liquid, less but still explosive; forms perchloric acid with water."}
    ],    "related":[
      "HClO4"
    ],    "tags":[
      "explosive",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"受热/撞击",          "en":"heat/impact"},        "behavior":{          "cn":"歧化",          "en":"Disproportionation"},        "detail":{          "cn":"爆炸分解为 Cl₂ + O₂",          "en":"Explosively decomposes to Cl₂ + O₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(VII) 强氧化剂",          "en":"Cl(VII) is a strong oxidant"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 HClO₄",          "en":"Reacts with water to form HClO₄"}}
    ]},
  "Cl2O":{    "verdict":"conditional",    "name":{      "cn":"一氧化二氯（次氯酸酐）",      "en":"Dichlorine monoxide (hypochlorous anhydride)"},    "formula":"Cl2O",    "note":[
      {        "cn":"棕黄色气体，极不稳定，遇有机物爆炸；遇水生成次氯酸。",        "en":"Brownish-yellow gas, extremely unstable, explodes with organic matter; forms hypochlorous acid with water."}
    ],    "related":[
      "HClO"
    ],    "tags":[
      "explosive",
      "oxidize",
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Cl(I) 强氧化剂",          "en":"Cl(I) is a strong oxidant"}},
      {        "condition":{          "cn":"受热/撞击",          "en":"heat/impact"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"爆炸分解为 Cl₂ + O₂",          "en":"Explosively decomposes to Cl₂ + O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"遇水分解",          "en":"decomposes in water"},        "note":{          "cn":"与水反应生成 HClO",          "en":"Reacts with water to form HClO"}}
    ]},
  "HBr":{    "verdict":"yes",    "name":{      "cn":"溴化氢/氢溴酸",      "en":"Hydrogen bromide / Hydrobromic acid"},    "formula":"HBr",    "note":[
      {        "cn":"无色气体，水溶液为氢溴酸（强酸）；还原性强于 HCl，可被浓硫酸氧化。",        "en":"Colorless gas; aqueous solution is hydrobromic acid (strong acid); reducing properties stronger than HCl, can be oxidized by concentrated sulfuric acid."}
    ],    "related":[
      "HCl"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Br⁻ 可被浓硫酸、KMnO₄ 氧化为 Br₂",          "en":"Br⁻ can be oxidized to Br₂ by concentrated sulfuric acid, KMnO₄"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，水溶液为强酸",          "en":"Easily soluble in water; aqueous solution is a strong acid"}}
    ]},
  "HI":{    "verdict":"yes",    "name":{      "cn":"碘化氢/氢碘酸",      "en":"Hydrogen iodide / Hydriodic acid"},    "formula":"HI",    "note":[
      {        "cn":"无色气体，水溶液为氢碘酸（强酸）；还原性极强，易被氧化为 I₂。",        "en":"Colorless gas; aqueous solution is hydriodic acid (strong acid); extremely strong reducing properties, easily oxidized to I₂."}
    ],    "related":[
      "HCl"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"I⁻ 易被氧化为 I₂（溶液变棕）",          "en":"I⁻ is easily oxidized to I₂ (solution turns brown)"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被浓硫酸、KMnO₄ 等氧化",          "en":"Can be oxidized by concentrated sulfuric acid, KMnO₄, etc."}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，水溶液为强酸",          "en":"Easily soluble in water; aqueous solution is a strong acid"}}
    ]},
  "H3BO3":{    "verdict":"yes",    "name":{      "cn":"硼酸",      "en":"Boric acid"},    "formula":"H3BO3",    "note":[
      {        "cn":"白色片状晶体，弱一元酸（接受 OH⁻）；外用消毒、缓冲剂与玻璃工业。",        "en":"White flaky crystals, weak monoprotic acid (accepts OH⁻); topical antiseptic, buffer, and glass industry."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"逐步脱水生成偏硼酸、硼酐 B₂O₃",          "en":"Gradually dehydrates to metaboric acid, boric anhydride B₂O₃"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"B(III) 极稳定",          "en":"B(III) is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 5.7g/100mL，热水溶解度大增",          "en":"~5.7g/100mL at 20°C; solubility greatly increases in hot water"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "H2SiO3":{    "verdict":"yes",    "name":{      "cn":"硅酸",      "en":"Silicic acid"},    "formula":"H2SiO3",    "note":[
      {        "cn":"白色胶状沉淀，弱酸；实际以多硅酸 xSiO₂·yH₂O 凝胶形式存在。硅胶干燥剂即硅酸凝胶。",        "en":"White gelatinous precipitate, weak acid; actually exists as polysilicic acid xSiO₂·yH₂O gel. Silica gel desiccant is silicic acid gel."}
    ],    "related":[
      "SiO2"
    ],    "tags":[
      "unstable"
    ],    "redox":[
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"脱水生成 SiO₂",          "en":"Dehydrates to form SiO₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Si(IV) 极稳定",          "en":"Si(IV) is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水，以凝胶形式存在",          "en":"Insoluble in water; exists as gel"}}
    ]},
  "HCN":{    "verdict":"yes",    "name":{      "cn":"氰化氢/氢氰酸",      "en":"Hydrogen cyanide / Hydrocyanic acid"},    "formula":"HCN",    "note":[
      {        "cn":"无色气体/液体，苦杏仁味，剧毒！抑制细胞呼吸（与细胞色素氧化酶结合）。",        "en":"Colorless gas/liquid, bitter almond odor, highly toxic! Inhibits cellular respiration (binds to cytochrome oxidase)."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可燃，被氧化为 CO₂ + H₂O + N₂",          "en":"Combustible, oxidized to CO₂ + H₂O + N₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"弱酸，较稳定",          "en":"Weak acid, relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，弱酸（Ka 约 6.2×10⁻¹⁰）",          "en":"Easily soluble in water; weak acid (Ka ≈ 6.2×10⁻¹⁰)"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "HSCN":{    "verdict":"yes",    "name":{      "cn":"硫氰酸",      "en":"Thiocyanic acid"},    "formula":"HSCN",    "note":[
      {        "cn":"强酸，无色液体/气体；其盐（硫氰酸盐）与 Fe³⁺ 生成血红色配离子用于检验。",        "en":"Strong acid, colorless liquid/gas; its salts (thiocyanates) form blood-red complex ion with Fe³⁺ for detection."}
    ],    "related":[
      "Fe(SCN)3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"SCN⁻ 较稳定",          "en":"SCN⁻ is relatively stable"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被氧化",          "en":"Can be oxidized"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，水溶液为强酸",          "en":"Easily soluble in water; aqueous solution is a strong acid"}},
      {        "solvent":{          "cn":"乙醇",          "en":"ethanol"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"可溶于乙醇",          "en":"Soluble in ethanol"}}
    ]},
  "O2":{    "verdict":"yes",    "name":{      "cn":"氧气",      "en":"Oxygen"},    "formula":"O2",    "note":[
      {        "cn":"无色无味气体，助燃；呼吸与燃烧的氧化剂。",        "en":"Colorless, odorless gas; supports combustion; oxidant for respiration and combustion."}
    ],    "related":[],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"O₂ 是最常见的氧化剂，支持燃烧与呼吸",          "en":"O₂ is the most common oxidant, supporting combustion and respiration"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 3.1mL/100mL",          "en":"~3.1mL/100mL at 20°C"}}
    ]},
  "H2":{    "verdict":"yes",    "name":{      "cn":"氢气",      "en":"Hydrogen"},    "formula":"H2",    "note":[
      {        "cn":"无色无味气体，易燃易爆；最轻的气体，清洁燃料。",        "en":"Colorless, odorless gas, flammable and explosive; the lightest gas, clean fuel."}
    ],    "related":[],    "tags":[
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 H₂O",          "en":"Oxidized to H₂O by O₂"}},
      {        "condition":{          "cn":"与金属氧化物",          "en":"with metal oxides"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"高温还原 CuO、Fe₂O₃ 等",          "en":"Reduces CuO, Fe₂O₃, etc. at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 1.6mL/100mL，难溶于水",          "en":"~1.6mL/100mL at 20°C, poorly soluble in water"}}
    ]},
  "N2":{    "verdict":"yes",    "name":{      "cn":"氮气",      "en":"Nitrogen"},    "formula":"N2",    "note":[
      {        "cn":"无色无味气体，空气主要成分（78%）；化学性质极稳定。",        "en":"Colorless, odorless gas, main component of air (78%); chemically extremely stable."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"高温/放电/催化",          "en":"high temperature/discharge/catalysis"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"N≡N 三键极稳定，常温不反应；高温可与 H₂、O₂、Mg 等反应",          "en":"N≡N triple bond is extremely stable, unreactive at room temperature; reacts with H₂, O₂, Mg, etc. at high temperature"}},
      {        "condition":{          "cn":"与活泼金属",          "en":"with active metals"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"高温可与 Li、Mg 等生成氮化物",          "en":"Forms nitrides with Li, Mg, etc. at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"20°C 约 1.9mL/100mL",          "en":"~1.9mL/100mL at 20°C"}}
    ]},
  "P":{    "verdict":"yes",    "name":{      "cn":"红磷",      "en":"Red phosphorus"},    "formula":"P",    "note":[
      {        "cn":"红棕色粉末，较稳定；火柴、阻燃剂原料。",        "en":"Reddish-brown powder, relatively stable; matches and flame retardant material."}
    ],    "related":[
      "P4"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"在空气中加热",          "en":"heated in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"燃烧生成 P₂O₅",          "en":"Burns to form P₂O₅"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"常温稳定，加热易燃",          "en":"Stable at room temperature, flammable when heated"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水和常见有机溶剂",          "en":"Insoluble in water and common organic solvents"}},
      {        "solvent":{          "cn":"CS2",          "en":"CS2"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"红磷不溶于 CS₂（白磷可溶）",          "en":"Red phosphorus is insoluble in CS₂ (white phosphorus is soluble)"}}
    ]},
  "P4":{    "verdict":"yes",    "name":{      "cn":"白磷",      "en":"White phosphorus"},    "formula":"P4",    "note":[
      {        "cn":"白色/黄色蜡状固体，剧毒！燃点低（40°C），空气中自燃；须保存在水中。",        "en":"White/yellow waxy solid, highly toxic! Low ignition point (40°C), spontaneously ignites in air; must be stored under water."}
    ],    "related":[
      "P"
    ],    "tags":[
      "toxic",
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"自燃生成 P₂O₅",          "en":"Spontaneously ignites to form P₂O₅"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"极易被氧化",          "en":"Extremely easily oxidized"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水，常保存在水中",          "en":"Insoluble in water; commonly stored under water"}},
      {        "solvent":{          "cn":"CS2",          "en":"CS2"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"易溶于二硫化碳",          "en":"Easily soluble in carbon disulfide"}}
    ]},
  "Na":{    "verdict":"yes",    "name":{      "cn":"金属钠",      "en":"Sodium metal"},    "formula":"Na",    "note":[
      {        "cn":"银白色软质金属，极活泼；遇水剧烈反应生成 NaOH + H₂（易爆）。须保存在煤油中。",        "en":"Silvery-white soft metal, extremely reactive; reacts violently with water to form NaOH + H₂ (explosive). Must be stored in kerosene."}
    ],    "related":[
      "NaOH",
      "Na2O"
    ],    "tags":[
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"与水",          "en":"with water"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Na 被氧化为 Na⁺，放出 H₂",          "en":"Na is oxidized to Na⁺, releasing H₂"}},
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 Na₂O/Na₂O₂",          "en":"Oxidized to Na₂O/Na₂O₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂；与水剧烈反应",          "en":"Insoluble in common solvents; reacts violently with water"}},
      {        "solvent":{          "cn":"煤油",          "en":"kerosene"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于煤油，可保存于煤油中",          "en":"Insoluble in kerosene; can be stored in kerosene"}}
    ]},
  "K":{    "verdict":"yes",    "name":{      "cn":"金属钾",      "en":"Potassium metal"},    "formula":"K",    "note":[
      {        "cn":"银白色软质金属，比 Na 更活泼；遇水剧烈燃烧/爆炸。须保存在煤油中。",        "en":"Silvery-white soft metal, more reactive than Na; reacts violently with water causing combustion/explosion. Must be stored in kerosene."}
    ],    "related":[
      "KOH",
      "K2O"
    ],    "tags":[
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"与水",          "en":"with water"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"K 被氧化为 K⁺，剧烈放出 H₂ 并燃烧",          "en":"K is oxidized to K⁺, violently releases H₂ and ignites"}},
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 K₂O₂/KO₂",          "en":"Oxidized to K₂O₂/KO₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂；与水剧烈反应",          "en":"Insoluble in common solvents; reacts violently with water"}},
      {        "solvent":{          "cn":"煤油",          "en":"kerosene"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于煤油，可保存于煤油中",          "en":"Insoluble in kerosene; can be stored in kerosene"}}
    ]},
  "Ca":{    "verdict":"yes",    "name":{      "cn":"金属钙",      "en":"Calcium metal"},    "formula":"Ca",    "note":[
      {        "cn":"银白色金属，较活泼；遇水反应生成 Ca(OH)₂ + H₂。",        "en":"Silvery-white metal, relatively reactive; reacts with water to form Ca(OH)₂ + H₂."}
    ],    "related":[
      "CaO",
      "Ca(OH)2"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与水",          "en":"with water"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Ca 被氧化为 Ca²⁺，放出 H₂",          "en":"Ca is oxidized to Ca²⁺, releasing H₂"}},
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 CaO/Ca(OH)₂",          "en":"Oxidized to CaO/Ca(OH)₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂；与水反应",          "en":"Insoluble in common solvents; reacts with water"}}
    ]},
  "Mg":{    "verdict":"yes",    "name":{      "cn":"金属镁",      "en":"Magnesium metal"},    "formula":"Mg",    "note":[
      {        "cn":"银白色金属，轻；在空气中燃烧发出耀眼白光（MgO）。",        "en":"Silvery-white metal, light; burns in air with dazzling white light (MgO)."}
    ],    "related":[
      "MgO"
    ],    "tags":[
      "explosive"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中燃烧",          "en":"burning in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 MgO，白光",          "en":"Oxidized to MgO, white light"}},
      {        "condition":{          "cn":"与水（热水）",          "en":"with water (hot)"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"与热水反应放出 H₂",          "en":"Reacts with hot water releasing H₂"}},
      {        "condition":{          "cn":"与 CO₂",          "en":"with CO₂"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可在 CO₂ 中燃烧（还原 CO₂）",          "en":"Can burn in CO₂ (reduces CO₂)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}}
    ]},
  "Al":{    "verdict":"yes",    "name":{      "cn":"金属铝",      "en":"Aluminum metal"},    "formula":"Al",    "note":[
      {        "cn":"银白色轻金属；表面致密氧化膜耐腐蚀。两性，与强碱反应放出 H₂。",        "en":"Silvery-white light metal; dense surface oxide film provides corrosion resistance. Amphoteric, reacts with strong base releasing H₂."}
    ],    "related":[
      "Al2O3",
      "Al(OH)3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 Al₂O₃（表面钝化膜）",          "en":"Oxidized to Al₂O₃ (surface passivation film)"}},
      {        "condition":{          "cn":"与强碱",          "en":"with strong base"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"与 NaOH 反应生成 [Al(OH)₄]⁻ + H₂",          "en":"Reacts with NaOH to form [Al(OH)₄]⁻ + H₂"}},
      {        "condition":{          "cn":"铝热反应",          "en":"thermite reaction"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"高温还原 Fe₂O₃ 等金属氧化物",          "en":"Reduces Fe₂O₃ and other metal oxides at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于强碱放出 H₂",          "en":"Dissolves in strong base releasing H₂"}}
    ]},
  "Zn":{    "verdict":"yes",    "name":{      "cn":"金属锌",      "en":"Zinc metal"},    "formula":"Zn",    "note":[
      {        "cn":"蓝白色金属，两性；与酸和强碱均放出 H₂。",        "en":"Bluish-white metal, amphoteric; releases H₂ with both acid and strong base."}
    ],    "related":[
      "ZnO",
      "Zn(OH)2"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与酸",          "en":"with acid"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"与 HCl/H₂SO₄ 反应放出 H₂",          "en":"Reacts with HCl/H₂SO₄ releasing H₂"}},
      {        "condition":{          "cn":"与强碱",          "en":"with strong base"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"与 NaOH 反应生成锌酸根 + H₂",          "en":"Reacts with NaOH to form zincate + H₂"}},
      {        "condition":{          "cn":"与 Cu²⁺等",          "en":"with Cu²⁺ etc."},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"置换出不活泼金属",          "en":"Displaces less active metals"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于强碱",          "en":"Dissolves in strong base"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸",          "en":"Dissolves in acid"}}
    ]},
  "Ag":{    "verdict":"yes",    "name":{      "cn":"金属银",      "en":"Silver metal"},    "formula":"Ag",    "note":[
      {        "cn":"银白色金属，导电导热性最优；化学性质稳定。",        "en":"Silvery-white metal, best electrical and thermal conductivity; chemically stable."}
    ],    "related":[
      "AgNO3",
      "Ag2O"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"常温极稳定，不与空气/水反应",          "en":"Extremely stable at room temperature, does not react with air/water"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可溶于 HNO₃、热浓 H₂SO₄",          "en":"Dissolves in HNO₃, hot concentrated H₂SO₄"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}},
      {        "solvent":{          "cn":"硝酸",          "en":"nitric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于硝酸",          "en":"Dissolves in nitric acid"}}
    ]},
  "Au":{    "verdict":"yes",    "name":{      "cn":"金属金",      "en":"Gold metal"},    "formula":"Au",    "note":[
      {        "cn":"金黄色金属，极稳定；不与一般酸/碱反应，溶于王水。",        "en":"Golden-yellow metal, extremely stable; does not react with common acids/bases, dissolves in aqua regia."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"极稳定，不被空气氧化",          "en":"Extremely stable, not oxidized by air"}},
      {        "condition":{          "cn":"王水",          "en":"aqua regia"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"溶于王水（浓 HNO₃+浓 HCl）",          "en":"Dissolves in aqua regia (conc. HNO₃ + conc. HCl)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}},
      {        "solvent":{          "cn":"王水",          "en":"aqua regia"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于王水",          "en":"Dissolves in aqua regia"}}
    ]},
  "Hg":{    "verdict":"yes",    "name":{      "cn":"汞（水银）",      "en":"Mercury (quicksilver)"},    "formula":"Hg",    "note":[
      {        "cn":"银白色液态金属，剧毒蒸气！常温挥发。用于温度计、气压计（已被逐步淘汰）。",        "en":"Silvery-white liquid metal, highly toxic vapor! Volatilizes at room temperature. Used in thermometers, barometers (being phased out)."}
    ],    "related":[
      "HgO",
      "HgCl2"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中加热",          "en":"heated in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 HgO（红色）",          "en":"Oxidized to HgO (red)"}},
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"可被 HNO₃ 氧化为 Hg²⁺",          "en":"Can be oxidized to Hg²⁺ by HNO₃"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水与一般溶剂",          "en":"Insoluble in water and common solvents"}},
      {        "solvent":{          "cn":"硝酸",          "en":"nitric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于硝酸",          "en":"Dissolves in nitric acid"}}
    ]},
  "Pt":{    "verdict":"yes",    "name":{      "cn":"金属铂",      "en":"Platinum metal"},    "formula":"Pt",    "note":[
      {        "cn":"银白色贵金属，极稳定；催化性能优异（接触法制硫酸、汽车尾气催化）。",        "en":"Silvery-white precious metal, extremely stable; excellent catalytic properties (contact process for sulfuric acid, automotive catalytic converters)."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"极稳定，不被空气氧化",          "en":"Extremely stable, not oxidized by air"}},
      {        "condition":{          "cn":"王水",          "en":"aqua regia"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"溶于王水",          "en":"Dissolves in aqua regia"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}},
      {        "solvent":{          "cn":"王水",          "en":"aqua regia"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于王水",          "en":"Dissolves in aqua regia"}}
    ]},
  "Sn":{    "verdict":"yes",    "name":{      "cn":"金属锡",      "en":"Tin metal"},    "formula":"Sn",    "note":[
      {        "cn":"银白色金属，柔软；有灰锡/白锡/脆锡三种同素异形体。低温下白锡→灰锡（锡疫）。",        "en":"Silvery-white metal, soft; has three allotropes (gray/white/brittle tin). At low temperature white tin → gray tin (tin pest)."}
    ],    "related":[
      "SnCl2",
      "SnCl4"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"常温稳定，与强酸/强碱反应放出 H₂",          "en":"Stable at room temperature; reacts with strong acid/base releasing H₂"}},
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 SnO₂",          "en":"Oxidized to SnO₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于盐酸放出 H₂",          "en":"Dissolves in hydrochloric acid releasing H₂"}},
      {        "solvent":{          "cn":"强碱",          "en":"strong base"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于强碱放出 H₂",          "en":"Dissolves in strong base releasing H₂"}}
    ]},
  "Pb":{    "verdict":"yes",    "name":{      "cn":"金属铅",      "en":"Lead metal"},    "formula":"Pb",    "note":[
      {        "cn":"蓝灰色软质金属，有毒；用于蓄电池、防辐射屏蔽。",        "en":"Bluish-gray soft metal, toxic; used in batteries and radiation shielding."}
    ],    "related":[
      "PbO",
      "Pb(NO3)2"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"常温表面氧化为 PbO/PbCO₃ 钝化层",          "en":"Surface oxidizes to PbO/PbCO₃ passivation layer at room temperature"}},
      {        "condition":{          "cn":"与酸",          "en":"with acid"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"与稀盐酸/硫酸反应放出 H₂（但生成难溶盐阻碍反应）",          "en":"Reacts with dilute HCl/H₂SO₄ releasing H₂ (but insoluble salt hinders reaction)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}},
      {        "solvent":{          "cn":"硝酸",          "en":"nitric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于硝酸",          "en":"Dissolves in nitric acid"}}
    ]},
  "C":{    "verdict":"yes",    "name":{      "cn":"碳（石墨/金刚石）",      "en":"Carbon (graphite/diamond)"},    "formula":"C",    "note":[
      {        "cn":"碳有多种同素异形体：石墨（导电、层状）、金刚石（硬度最大）、富勒烯等。",        "en":"Carbon has several allotropes: graphite (conductive, layered), diamond (hardest), fullerenes, etc."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"燃烧时",          "en":"during combustion"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被 O₂ 氧化为 CO/CO₂",          "en":"Oxidized to CO/CO₂ by O₂"}},
      {        "condition":{          "cn":"高温与金属氧化物",          "en":"high temperature with metal oxides"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"高温还原 CuO、Fe₂O₃ 等",          "en":"Reduces CuO, Fe₂O₃, etc. at high temperature"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"一般溶剂",          "en":"common solvents"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"不溶于一般溶剂",          "en":"Insoluble in common solvents"}}
    ]},
  "Ca3(PO4)2":{    "verdict":"yes",    "name":{      "cn":"磷酸钙",      "en":"Calcium phosphate"},    "formula":"Ca3(PO4)2",    "note":[
      {        "cn":"白色晶体，骨骼/磷矿石主要成分；难溶。",        "en":"White crystals, main component of bones/phosphate rock; insoluble."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ca²⁺ 与 PO₄³⁻ 均稳定",          "en":"Ca²⁺ and PO₄³⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"难溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸生成 Ca²⁺ 与 H₂PO₄⁻",          "en":"Dissolves in acid to form Ca²⁺ and H₂PO₄⁻"}}
    ]},
  "Mg3(PO4)2":{    "verdict":"yes",    "name":{      "cn":"磷酸镁",      "en":"Magnesium phosphate"},    "formula":"Mg3(PO4)2",    "note":[
      {        "cn":"白色粉末，难溶；用作饲料添加剂与缓释肥料。",        "en":"White powder, insoluble; used as feed additive and slow-release fertilizer."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mg²⁺ 与 PO₄³⁻ 均稳定",          "en":"Mg²⁺ and PO₄³⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"难溶于水",          "en":"Insoluble in water"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸",          "en":"Dissolves in acid"}}
    ]},
  "Ag2S":{    "verdict":"yes",    "name":{      "cn":"硫化银",      "en":"Silver sulfide"},    "formula":"Ag2S",    "note":[
      {        "cn":"黑色沉淀，极难溶（Ksp 约 6×10⁻⁵¹）；银器变黑即生成 Ag₂S。",        "en":"Black precipitate, extremely insoluble (Ksp ≈ 6×10⁻⁵¹); silver tarnish is Ag₂S."}
    ],    "related":[
      "Ag2O"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S²⁻ 可被氧化为 S",          "en":"S²⁻ can be oxidized to S"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"极稳定",          "en":"Extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 6×10⁻⁵¹，极难溶",          "en":"Ksp ≈ 6×10⁻⁵¹, extremely insoluble"}},
      {        "solvent":{          "cn":"硝酸",          "en":"nitric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于热硝酸",          "en":"Dissolves in hot nitric acid"}}
    ]},
  "CuS":{    "verdict":"yes",    "name":{      "cn":"硫化铜",      "en":"Copper(II) sulfide"},    "formula":"CuS",    "note":[
      {        "cn":"黑色沉淀，极难溶；不溶于稀酸。",        "en":"Black precipitate, extremely insoluble; insoluble in dilute acid."}
    ],    "related":[
      "Cu2S"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S²⁻ 可被氧化为 S",          "en":"S²⁻ can be oxidized to S"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"较稳定",          "en":"Relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 6×10⁻³⁷",          "en":"Ksp ≈ 6×10⁻³⁷"}},
      {        "solvent":{          "cn":"热硝酸",          "en":"hot nitric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于热硝酸",          "en":"Dissolves in hot nitric acid"}}
    ]},
  "Cu2S":{    "verdict":"yes",    "name":{      "cn":"硫化亚铜",      "en":"Copper(I) sulfide"},    "formula":"Cu2S",    "note":[
      {        "cn":"黑色固体，极难溶；铜矿（辉铜矿）主要成分。",        "en":"Black solid, extremely insoluble; main component of copper ore (chalcocite)."}
    ],    "related":[
      "CuS"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"在空气中焙烧",          "en":"roasted in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被氧化为 CuO + SO₂",          "en":"Oxidized to CuO + SO₂"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"较稳定",          "en":"Relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"极难溶",          "en":"Extremely insoluble"}},
      {        "solvent":{          "cn":"硝酸",          "en":"nitric acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于热硝酸",          "en":"Dissolves in hot nitric acid"}}
    ]},
  "ZnS":{    "verdict":"yes",    "name":{      "cn":"硫化锌",      "en":"Zinc sulfide"},    "formula":"ZnS",    "note":[
      {        "cn":"白色沉淀，难溶；荧光粉与颜料（锌钡白）原料。",        "en":"White precipitate, insoluble; phosphor and pigment (lithopone) material."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Zn²⁺ 与 S²⁻ 较稳定",          "en":"Zn²⁺ and S²⁻ are relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 2.9×10⁻²⁵",          "en":"Ksp ≈ 2.9×10⁻²⁵"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸放出 H₂S",          "en":"Dissolves in acid releasing H₂S"}}
    ]},
  "HgS":{    "verdict":"yes",    "name":{      "cn":"硫化汞（朱砂/辰砂）",      "en":"Mercury(II) sulfide (cinnabar)"},    "formula":"HgS",    "note":[
      {        "cn":"红色（朱砂）/黑色变体，极难溶；天然矿物颜料与中药。有毒。",        "en":"Red (cinnabar)/black variants, extremely insoluble; natural mineral pigment and traditional Chinese medicine. Toxic."}
    ],    "related":[
      "HgO"
    ],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"极稳定",          "en":"Extremely stable"}},
      {        "condition":{          "cn":"加热时",          "en":"when heated"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"分解为 Hg + S",          "en":"Decomposes to Hg + S"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 4×10⁻⁵³，极难溶",          "en":"Ksp ≈ 4×10⁻⁵³, extremely insoluble"}},
      {        "solvent":{          "cn":"王水",          "en":"aqua regia"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于王水",          "en":"Dissolves in aqua regia"}},
      {        "solvent":{          "cn":"硫化钠",          "en":"sodium sulfide"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于浓 Na₂S 生成硫代汞酸盐",          "en":"Dissolves in concentrated Na₂S to form thiomercurate"}}
    ]},
  "MnS":{    "verdict":"yes",    "name":{      "cn":"硫化锰",      "en":"Manganese(II) sulfide"},    "formula":"MnS",    "note":[
      {        "cn":"肉色/绿色沉淀，难溶；有多种晶型。",        "en":"Flesh-colored/green precipitate, insoluble; has multiple crystal forms."}
    ],    "related":[],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Mn²⁺ 与 S²⁻ 较稳定",          "en":"Mn²⁺ and S²⁻ are relatively stable"}},
      {        "condition":{          "cn":"与氧化剂",          "en":"with oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"S²⁻ 可被氧化",          "en":"S²⁻ can be oxidized"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 3×10⁻¹¹",          "en":"Ksp ≈ 3×10⁻¹¹"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于酸放出 H₂S",          "en":"Dissolves in acid releasing H₂S"}}
    ]},
  "NiS":{    "verdict":"yes",    "name":{      "cn":"硫化镍",      "en":"Nickel(II) sulfide"},    "formula":"NiS",    "note":[
      {        "cn":"黑色沉淀，难溶；有 α/β/γ 三种变体，新沉淀可溶于酸，陈化后难溶。",        "en":"Black precipitate, insoluble; has α/β/γ forms. Fresh precipitate dissolves in acid, but ages to become insoluble."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Ni²⁺ 与 S²⁻ 较稳定",          "en":"Ni²⁺ and S²⁻ are relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 3×10⁻²¹",          "en":"Ksp ≈ 3×10⁻²¹"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"新沉淀可溶，陈化后难溶",          "en":"Fresh precipitate dissolves; aged precipitate is insoluble"}}
    ]},
  "CoS":{    "verdict":"yes",    "name":{      "cn":"硫化钴",      "en":"Cobalt(II) sulfide"},    "formula":"CoS",    "note":[
      {        "cn":"黑色沉淀，难溶；与 NiS 类似有变体。",        "en":"Black precipitate, insoluble; has forms similar to NiS."}
    ],    "related":[],    "tags":[
      "toxic"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Co²⁺ 与 S²⁻ 较稳定",          "en":"Co²⁺ and S²⁻ are relatively stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"不溶",          "en":"insoluble"},        "note":{          "cn":"Ksp 约 3×10⁻²⁶",          "en":"Ksp ≈ 3×10⁻²⁶"}},
      {        "solvent":{          "cn":"酸",          "en":"acid"},        "value":{          "cn":"微溶",          "en":"slightly soluble"},        "note":{          "cn":"新沉淀可溶",          "en":"Fresh precipitate dissolves"}}
    ]},
  "SnCl2":{    "verdict":"yes",    "name":{      "cn":"氯化亚锡",      "en":"Tin(II) chloride"},    "formula":"SnCl2",    "note":[
      {        "cn":"白色晶体，易水解；强还原剂，可还原 HgCl₂ 为 Hg（检验反应）。",        "en":"White crystals, easily hydrolyzes; strong reducing agent, can reduce HgCl₂ to Hg (detection reaction)."}
    ],    "related":[
      "SnCl4"
    ],    "tags":[
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"在空气中",          "en":"in air"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Sn²⁺ 被氧化为 Sn⁴⁺",          "en":"Sn²⁺ is oxidized to Sn⁴⁺"}},
      {        "condition":{          "cn":"与 HgCl₂",          "en":"with HgCl₂"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"将 Hg²⁺ 还原为 Hg₂Cl₂ 或 Hg",          "en":"Reduces Hg²⁺ to Hg₂Cl₂ or Hg"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，易水解为碱式氯化亚锡",          "en":"Easily soluble in water; hydrolyzes to basic tin(II) chloride"}}
    ]},
  "SnCl4":{    "verdict":"yes",    "name":{      "cn":"氯化锡（四氯化锡）",      "en":"Tin(IV) chloride"},    "formula":"SnCl4",    "note":[
      {        "cn":"无色液体/固体，易挥发、易水解；路易斯酸。",        "en":"Colorless liquid/solid, volatile, easily hydrolyzes; Lewis acid."}
    ],    "related":[
      "SnCl2"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Sn(IV) 可被还原为 Sn(II)",          "en":"Sn(IV) can be reduced to Sn(II)"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 SnCl₂",          "en":"Can be reduced to SnCl₂"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水，剧烈水解",          "en":"Easily soluble in water; hydrolyzes vigorously"}}
    ]},
  "As2O5":{    "verdict":"yes",    "name":{      "cn":"五氧化二砷（砷酸酐）",      "en":"Arsenic(V) oxide (arsenic acid anhydride)"},    "formula":"As2O5",    "note":[
      {        "cn":"白色固体，易吸潮；遇水生成砷酸。剧毒。",        "en":"White solid, hygroscopic; forms arsenic acid with water. Highly toxic."}
    ],    "related":[
      "As2O3"
    ],    "tags":[
      "toxic",
      "oxidize"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"As(V) 可被还原为 As(III)",          "en":"As(V) can be reduced to As(III)"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"可被还原为 As₂O₃ 或 As",          "en":"Can be reduced to As₂O₃ or As"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"易溶于水生成砷酸 H₃AsO₄",          "en":"Easily soluble in water to form arsenic acid H₃AsO₄"}}
    ]},
  "Na2B4O7":{    "verdict":"yes",    "name":{      "cn":"硼砂（四硼酸钠）",      "en":"Borax (sodium tetraborate)"},    "formula":"Na2B4O7",    "note":[
      {        "cn":"白色晶体（十水合物为常见硼砂）；用于玻璃/陶瓷、缓冲溶液（硼砂缓冲液）。",        "en":"White crystals (decahydrate is common borax); used in glass/ceramics, buffer solutions (borax buffer)."}
    ],    "related":[
      "H3BO3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"B(III) 极稳定",          "en":"B(III) is extremely stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 2.6g/100mL，热水溶解度大增",          "en":"~2.6g/100mL at 20°C; solubility greatly increases in hot water"}}
    ]},
  "NaAlO2":{    "verdict":"yes",    "name":{      "cn":"偏铝酸钠",      "en":"Sodium aluminate"},    "formula":"NaAlO2",    "note":[
      {        "cn":"白色固体，实际溶液中以 [Al(OH)₄]⁻ 形式存在；用于水处理与造纸。",        "en":"White solid; in solution actually exists as [Al(OH)₄]⁻; used in water treatment and paper industry."}
    ],    "related":[
      "Al(OH)3",
      "Al2O3"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"Na⁺ 与 AlO₂⁻ 均稳定",          "en":"Na⁺ and AlO₂⁻ are both stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"溶于水，水溶液呈强碱性",          "en":"Dissolves in water; aqueous solution is strongly alkaline"}}
    ]},
  "KAl(SO4)2":{    "verdict":"yes",    "name":{      "cn":"硫酸铝钾（明矾）",      "en":"Potassium aluminum sulfate (alum)"},    "formula":"KAl(SO4)2",    "note":[
      {        "cn":"无色晶体（十二水合物为常见明矾）；净水剂（水解生成 Al(OH)₃ 胶体吸附杂质）。",        "en":"Colorless crystals (dodecahydrate is common alum); water purifier (hydrolyzes to form Al(OH)₃ colloid that adsorbs impurities)."}
    ],    "related":[
      "Al2(SO4)3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"无显著氧化还原性",          "en":"No significant redox activity"},        "detail":{          "cn":"各离子均稳定",          "en":"All ions are stable"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 5.7g/100mL",          "en":"~5.7g/100mL at 20°C"}}
    ]},
  "Fe(SCN)3":{    "verdict":"yes",    "name":{      "cn":"硫氰化铁",      "en":"Iron(III) thiocyanate"},    "formula":"Fe(SCN)3",    "note":[
      {        "cn":"血红色配合物溶液；Fe³⁺ 与 SCN⁻ 的特征反应，用于检验 Fe³⁺。实际以 [Fe(SCN)]²⁺ 等形式存在。",        "en":"Blood-red complex solution; characteristic reaction of Fe³⁺ with SCN⁻ for detecting Fe³⁺. Actually exists as [Fe(SCN)]²⁺, etc."}
    ],    "related":[
      "Fe2(SO4)3"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Fe³⁺ 可被还原为 Fe²⁺（红色褪去）",          "en":"Fe³⁺ can be reduced to Fe²⁺ (red color fades)"}},
      {        "condition":{          "cn":"与还原剂",          "en":"with reducing agents"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Fe³⁺ 被还原，血红色消失",          "en":"Fe³⁺ is reduced, blood-red color disappears"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"溶于水呈血红色",          "en":"Dissolves in water to form blood-red solution"}}
    ]},
  "K3[Fe(CN)6]":{    "verdict":"yes",    "name":{      "cn":"铁氰化钾（赤血盐）",      "en":"Potassium ferricyanide (red prussiate)"},    "formula":"K3[Fe(CN)6",    "note":[
      {        "cn":"红色晶体，与 Fe²⁺ 生成腾氏蓝沉淀（检验 Fe²⁺）。",        "en":"Red crystals; forms Turnbull's blue precipitate with Fe²⁺ (detection of Fe²⁺)."}
    ],    "related":[
      "K4[Fe(CN)6]"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与 Fe²⁺",          "en":"with Fe²⁺"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Fe(III) 与 Fe²⁺ 生成滕氏蓝",          "en":"Fe(III) forms Turnbull's blue with Fe²⁺"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"氧化性",          "en":"Oxidizing"},        "detail":{          "cn":"Fe(III) 配合物可被还原",          "en":"Fe(III) complex can be reduced"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 33g/100mL",          "en":"~33g/100mL at 20°C"}}
    ]},
  "K4[Fe(CN)6]":{    "verdict":"yes",    "name":{      "cn":"亚铁氰化钾（黄血盐）",      "en":"Potassium ferrocyanide (yellow prussiate)"},    "formula":"K4[Fe(CN)6",    "note":[
      {        "cn":"黄色晶体，与 Fe³⁺ 生成普鲁士蓝沉淀（检验 Fe³⁺）。",        "en":"Yellow crystals; forms Prussian blue precipitate with Fe³⁺ (detection of Fe³⁺)."}
    ],    "related":[
      "K3[Fe(CN)6]"
    ],    "tags":[],    "redox":[
      {        "condition":{          "cn":"与 Fe³⁺",          "en":"with Fe³⁺"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Fe(II) 与 Fe³⁺ 生成普鲁士蓝",          "en":"Fe(II) forms Prussian blue with Fe³⁺"}},
      {        "condition":{          "cn":"一般条件",          "en":"general conditions"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"Fe(II) 配合物可被氧化",          "en":"Fe(II) complex can be oxidized"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"可溶",          "en":"soluble"},        "note":{          "cn":"20°C 约 28g/100mL",          "en":"~28g/100mL at 20°C"}}
    ]},
  "NH3":{    "verdict":"yes",    "name":{      "cn":"氨",      "en":"Ammonia"},    "formula":"NH3",    "note":[
      {        "cn":"刺激性气味气体，碱性，易溶于水成氨水；用于化肥与制冷。",        "en":"Irritating gas, alkaline, easily soluble in water to form ammonia water; used in fertilizer and refrigeration."}
    ],    "related":[
      "NH4OH"
    ],    "tags":[
      "corrosive"
    ],    "redox":[
      {        "condition":{          "cn":"与强氧化剂",          "en":"with strong oxidants"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"N(-3) 可被 Cl₂、CuO 等氧化为 N₂",          "en":"N(-3) can be oxidized to N₂ by Cl₂, CuO, etc."}},
      {        "condition":{          "cn":"催化氧化",          "en":"catalytic oxidation"},        "behavior":{          "cn":"还原性",          "en":"Reducing"},        "detail":{          "cn":"被催化氧化为 NO（制硝酸原理）",          "en":"Catalytically oxidized to NO (principle of nitric acid production)"}}
    ],    "solubility":[
      {        "solvent":{          "cn":"水",          "en":"water"},        "value":{          "cn":"易溶",          "en":"very soluble"},        "note":{          "cn":"20°C 约 53.7g/100mL（1:700 体积比），生成氨水",          "en":"~53.7g/100mL at 20°C (1:700 by volume), forms ammonia water"}}
    ]},
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
  "Cu":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"紫红色",        "en":"purplish red"},      "hex":"#b87333",      "ion":null}
  ],
  "CuO":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "Cu2O":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"砖红色",        "en":"brick red"},      "hex":"#a8322a",      "ion":null}
  ],
  "CuSO4":[
    {      "form":{        "cn":"无水固体",        "en":"anhydrous solid"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f2f2f2",      "ion":null},
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"蓝色",        "en":"blue"},      "hex":"#1e6fd9",      "ion":{        "cn":"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺",        "en":"Cu²⁺ hydrated as [Cu(H₂O)₄]²⁺"}}
  ],
  "CuSO4.5H2O":[
    {      "form":{        "cn":"晶体",        "en":"crystal"},      "color":{        "cn":"蓝色",        "en":"blue"},      "hex":"#2f7fe0",      "ion":{        "cn":"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺",        "en":"Cu²⁺ hydrated as [Cu(H₂O)₄]²⁺"}},
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"蓝色",        "en":"blue"},      "hex":"#1e6fd9",      "ion":{        "cn":"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺",        "en":"Cu²⁺ hydrated as [Cu(H₂O)₄]²⁺"}}
  ],
  "CuCl2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"棕黄色",        "en":"brownish yellow"},      "hex":"#7a5a2b",      "ion":null},
    {      "form":{        "cn":"稀溶液",        "en":"dilute solution"},      "color":{        "cn":"蓝色",        "en":"blue"},      "hex":"#2a7de1",      "ion":{        "cn":"Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺",        "en":"Cu²⁺ hydrated as [Cu(H₂O)₄]²⁺"}},
    {      "form":{        "cn":"浓溶液",        "en":"concentrated solution"},      "color":{        "cn":"绿色",        "en":"green"},      "hex":"#2e8b57",      "ion":{        "cn":"Cu²⁺ 浓度高时 [Cu(H₂O)₄]²⁺ 与 [CuCl₄]²⁻ 共存",        "en":"At high Cu²⁺ concentration, [Cu(H₂O)₄]²⁺ and [CuCl₄]²⁻ coexist"}}
  ],
  "Cu(OH)2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"蓝色",        "en":"blue"},      "hex":"#3a7bd5",      "ion":{        "cn":"Cu²⁺",        "en":"Cu²⁺"}}
  ],
  "Fe":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"银白色",        "en":"silvery white"},      "hex":"#c7ccd1",      "ion":null},
    {      "form":{        "cn":"粉末",        "en":"powder"},      "color":{        "cn":"灰黑色",        "en":"grayish black"},      "hex":"#4a4a4a",      "ion":null}
  ],
  "FeO":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "Fe2O3":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"红棕色",        "en":"reddish brown"},      "hex":"#a03d2a",      "ion":null}
  ],
  "Fe3O4":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#151515",      "ion":null}
  ],
  "Fe(OH)2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f4f4f0",      "ion":{        "cn":"Fe²⁺",        "en":"Fe²⁺"}},
    {      "form":{        "cn":"暴露空气",        "en":"exposed to air"},      "color":{        "cn":"灰绿→红褐",        "en":"gray-green→reddish brown"},      "hex":"#7a6a55",      "ion":{        "cn":"Fe²⁺ 被氧化为 Fe³⁺",        "en":"Fe²⁺ oxidized to Fe³⁺"}}
  ],
  "Fe(OH)3":[
    {      "form":{        "cn":"固体/沉淀",        "en":"solid/precipitate"},      "color":{        "cn":"红褐色",        "en":"reddish brown"},      "hex":"#9c4a2a",      "ion":{        "cn":"Fe³⁺",        "en":"Fe³⁺"}}
  ],
  "FeCl3":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑棕色",        "en":"blackish brown"},      "hex":"#3a2a20",      "ion":null},
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#d9a82e",      "ion":{        "cn":"Fe³⁺ 水解为 [Fe(H₂O)₆]³⁺（稀）/[Fe(H₂O)₅(OH)]²⁺（浓）",        "en":"Fe³⁺ hydrolyzes to [Fe(H₂O)₆]³⁺ (dilute) / [Fe(H₂O)₅(OH)]²⁺ (concentrated)"}}
  ],
  "FeSO4":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"浅绿色",        "en":"light green"},      "hex":"#8fbf9f",      "ion":{        "cn":"Fe²⁺ 水合为 [Fe(H₂O)₆]²⁺",        "en":"Fe²⁺ hydrated as [Fe(H₂O)₆]²⁺"}}
  ],
  "FeS":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1c1c1c",      "ion":null}
  ],
  "Fe(SCN)3":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"血红色",        "en":"blood red"},      "hex":"#a0202a",      "ion":{        "cn":"Fe³⁺ 与 SCN⁻ 配位为 [Fe(SCN)]²⁺",        "en":"Fe³⁺ coordinates with SCN⁻ to form [Fe(SCN)]²⁺"}}
  ],
  "KMnO4":[
    {      "form":{        "cn":"晶体",        "en":"crystal"},      "color":{        "cn":"紫黑色",        "en":"purplish black"},      "hex":"#5b2a86",      "ion":{        "cn":"MnO₄⁻",        "en":"MnO₄⁻"}},
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"紫红色",        "en":"purplish red"},      "hex":"#7a2a9e",      "ion":{        "cn":"MnO₄⁻",        "en":"MnO₄⁻"}}
  ],
  "K2MnO4":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"暗绿色",        "en":"dark green"},      "hex":"#2a5a3a",      "ion":{        "cn":"MnO₄²⁻",        "en":"MnO₄²⁻"}},
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"绿色",        "en":"green"},      "hex":"#3a7a4a",      "ion":{        "cn":"MnO₄²⁻",        "en":"MnO₄²⁻"}}
  ],
  "MnO2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "MnSO4":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"浅粉红色",        "en":"light pink"},      "hex":"#e8b8c8",      "ion":{        "cn":"Mn²⁺ 水合为 [Mn(H₂O)₆]²⁺",        "en":"Mn²⁺ hydrated as [Mn(H₂O)₆]²⁺"}}
  ],
  "K2Cr2O7":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"橙红色",        "en":"orange-red"},      "hex":"#d96a1e",      "ion":{        "cn":"Cr₂O₇²⁻",        "en":"Cr₂O₇²⁻"}},
    {      "form":{        "cn":"酸性溶液",        "en":"acidic solution"},      "color":{        "cn":"橙红色",        "en":"orange-red"},      "hex":"#d96a1e",      "ion":{        "cn":"Cr₂O₇²⁻",        "en":"Cr₂O₇²⁻"}},
    {      "form":{        "cn":"碱性溶液",        "en":"alkaline solution"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":{        "cn":"CrO₄²⁻",        "en":"CrO₄²⁻"}}
  ],
  "K2CrO4":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":{        "cn":"CrO₄²⁻",        "en":"CrO₄²⁻"}}
  ],
  "CrO3":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"暗红色",        "en":"dark red"},      "hex":"#8a1f1f",      "ion":null}
  ],
  "CrCl3":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"紫色",        "en":"purple"},      "hex":"#7a2a9e",      "ion":{        "cn":"Cr³⁺ 水合为 [Cr(H₂O)₆]³⁺",        "en":"Cr³⁺ hydrated as [Cr(H₂O)₆]³⁺"}},
    {      "form":{        "cn":"浓溶液",        "en":"concentrated solution"},      "color":{        "cn":"绿色",        "en":"green"},      "hex":"#2e8b57",      "ion":{        "cn":"Cr³⁺ 水解为 [Cr(H₂O)₅Cl]²⁺",        "en":"Cr³⁺ hydrolyzes to [Cr(H₂O)₅Cl]²⁺"}}
  ],
  "Cr2O3":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"绿色",        "en":"green"},      "hex":"#2e8b57",      "ion":null}
  ],
  "Cr(OH)3":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"灰绿色",        "en":"grayish green"},      "hex":"#6a8a5a",      "ion":{        "cn":"Cr³⁺",        "en":"Cr³⁺"}}
  ],
  "NiSO4":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"绿色",        "en":"green"},      "hex":"#5aa05a",      "ion":{        "cn":"Ni²⁺ 水合为 [Ni(H₂O)₆]²⁺",        "en":"Ni²⁺ hydrated as [Ni(H₂O)₆]²⁺"}}
  ],
  "Ni(OH)2":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"绿色",        "en":"green"},      "hex":"#5aa05a",      "ion":{        "cn":"Ni²⁺",        "en":"Ni²⁺"}}
  ],
  "CoCl2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"蓝色",        "en":"blue"},      "hex":"#2a6fd9",      "ion":null},
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"粉红色",        "en":"pink"},      "hex":"#e8a8b8",      "ion":{        "cn":"Co²⁺ 水合为 [Co(H₂O)₆]²⁺",        "en":"Co²⁺ hydrated as [Co(H₂O)₆]²⁺"}}
  ],
  "Cl2":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"黄绿色",        "en":"yellowish green"},      "hex":"#a8b820",      "ion":null}
  ],
  "Br2":[
    {      "form":{        "cn":"液体",        "en":"liquid"},      "color":{        "cn":"红棕色",        "en":"reddish brown"},      "hex":"#8a3a1a",      "ion":null},
    {      "form":{        "cn":"溴水",        "en":"bromine water"},      "color":{        "cn":"橙黄色",        "en":"orange-yellow"},      "hex":"#d98a2e",      "ion":null}
  ],
  "I2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"紫黑色",        "en":"purplish black"},      "hex":"#4a2a5e",      "ion":null},
    {      "form":{        "cn":"碘水",        "en":"iodine water"},      "color":{        "cn":"黄褐色",        "en":"yellowish brown"},      "hex":"#a8763a",      "ion":null},
    {      "form":{        "cn":"CCl4 萃取液",        "en":"CCl4 extract"},      "color":{        "cn":"紫红色",        "en":"purplish red"},      "hex":"#7a2a9e",      "ion":null}
  ],
  "AgCl":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f4f4f0",      "ion":null}
  ],
  "AgBr":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"淡黄色",        "en":"pale yellow"},      "hex":"#efe6b8",      "ion":null}
  ],
  "AgI":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":null}
  ],
  "Ag2O":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"棕黑色",        "en":"brownish black"},      "hex":"#3a2a20",      "ion":null}
  ],
  "Ag3PO4":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":null}
  ],
  "AgNO3":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "Ag2CrO4":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"砖红色",        "en":"brick red"},      "hex":"#a8322a",      "ion":{        "cn":"CrO₄²⁻",        "en":"CrO₄²⁻"}}
  ],
  "Na2O2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"淡黄色",        "en":"pale yellow"},      "hex":"#f0e6a8",      "ion":null}
  ],
  "S":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"淡黄色",        "en":"pale yellow"},      "hex":"#e8d44a",      "ion":null}
  ],
  "BaSO4":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f4f4f0",      "ion":null}
  ],
  "CaCO3":[
    {      "form":{        "cn":"固体/沉淀",        "en":"solid/precipitate"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f4f4f0",      "ion":null}
  ],
  "CaO":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f4f4f0",      "ion":null}
  ],
  "NO2":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"红棕色",        "en":"reddish brown"},      "hex":"#8a3a1a",      "ion":null}
  ],
  "NO":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "N2O4":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "CO":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "CO2":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "NH3":[
    {      "form":{        "cn":"气体",        "en":"gas"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "H2O2":[
    {      "form":{        "cn":"溶液",        "en":"solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "PbI2":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":null}
  ],
  "PbS":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "ZnSO4":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":{        "cn":"Zn²⁺（d¹⁰ 无色）",        "en":"Zn²⁺ (d¹⁰ colorless)"}}
  ],
  "ZnS":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"白色",        "en":"white"},      "hex":"#f4f4f0",      "ion":null}
  ],
  "Cu2S":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "CuS":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "Fe2(SO4)3":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#d9a82e",      "ion":{        "cn":"Fe³⁺",        "en":"Fe³⁺"}}
  ],
  "HgI2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"红色",        "en":"red"},      "hex":"#c8202a",      "ion":null},
    {      "form":{        "cn":"加热变体",        "en":"heated form"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":null}
  ],
  "PbO":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"黄色",        "en":"yellow"},      "hex":"#e8d44a",      "ion":null}
  ],
  "PbO2":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"棕褐色",        "en":"brownish"},      "hex":"#5a3a2a",      "ion":null}
  ],
  "V2O5":[
    {      "form":{        "cn":"固体",        "en":"solid"},      "color":{        "cn":"橙黄色",        "en":"orange-yellow"},      "hex":"#d98a2e",      "ion":null}
  ],
  "Ag2S":[
    {      "form":{        "cn":"沉淀",        "en":"precipitate"},      "color":{        "cn":"黑色",        "en":"black"},      "hex":"#1a1a1a",      "ion":null}
  ],
  "BaCl2":[
    {      "form":{        "cn":"水溶液",        "en":"aqueous solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":{        "cn":"Ba²⁺（无色）",        "en":"Ba²⁺ (colorless)"}}
  ],
  "NaCl":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "KCl":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "Na2SO4":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
  "K2SO4":[
    {      "form":{        "cn":"固体/溶液",        "en":"solid/solution"},      "color":{        "cn":"无色",        "en":"colorless"},      "hex":"#f6f6f2",      "ion":null}
  ],
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