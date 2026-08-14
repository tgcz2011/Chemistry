// public/chem-engine.test.mjs — 单元测试：化学式解析 + 存在性判定 + 颜色/电极覆盖
// 运行：node public/chem-engine.test.mjs
import assert from "node:assert/strict";
import {
  normalizeFormula, parseFormula, analyze, detectRadical,
  prettyFormula, verdictText, KNOWNS, COLORS, ELECTRODE, ELEMENTS
} from "./chem-engine.js";
import { molarMass, compositionMassPct } from "./chem-calc.js";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { failed++; console.log("  ✗", name, "—", e.message); }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) < eps; }

console.log("── 解析器 normalizeFormula / parseFormula ──");
check("普通式 CuSO4", () => {
  const p = parseFormula(normalizeFormula("CuSO4"));
  assert.equal(p.ok, true);
  assert.deepEqual(p.elements, { Cu: 1, S: 1, O: 4 });
  assert.equal(p.charge, 0);
});
check("水合点 CuSO4·5H2O", () => {
  const p = parseFormula(normalizeFormula("CuSO4.5H2O"));
  assert.equal(p.ok, true);
  assert.equal(p.raw, "CuSO4.5H2O");
});
check("括号 Ca(OH)2", () => {
  const p = parseFormula(normalizeFormula("Ca(OH)2"));
  assert.deepEqual(p.elements, { Ca: 1, O: 2, H: 2 });
});
check("配合物 [Cu(NH3)4]SO4", () => {
  const p = parseFormula(normalizeFormula("[Cu(NH3)4]SO4"));
  assert.equal(p.ok, true);
  assert.deepEqual(p.elements, { Cu: 1, N: 4, H: 12, S: 1, O: 4 });
});
check("电荷 SO4^2-", () => {
  const p = parseFormula(normalizeFormula("SO4^2-"));
  assert.equal(p.ok, true);
  assert.equal(p.charge, -2);
});
check("电荷 Fe3+", () => {
  const p = parseFormula(normalizeFormula("Fe3+"));
  assert.equal(p.charge, 3);
});
check("非法式 Xx2", () => {
  const p = parseFormula(normalizeFormula("Xx2"));
  assert.equal(p.ok, false);
});

console.log("── 判定 analyze：知识库命中 ──");
check("CuSO4 → yes/high", () => {
  const a = analyze("CuSO4");
  assert.equal(a.ok, true);
  assert.equal(a.verdict, "yes");
  assert.equal(a.confidence, "high");
});
check("H2O → yes/high", () => {
  assert.equal(analyze("H2O").verdict, "yes");
});
check("AgOH → unstable（仅特定条件）", () => {
  assert.equal(analyze("AgOH").verdict, "unstable");
});
check("H2O2 命中知识库 yes 且 ruleNote 不矛盾", () => {
  const a = analyze("H2O2");
  assert.equal(a.verdict, "yes");
  assert.match(a.ruleNote, /过氧化物/);
});
check("H2OO（=H2O2 非标写法）→ yes 且过氧化物 note", () => {
  const a = analyze("H2OO");
  assert.equal(a.verdict, "yes");
  assert.match(a.ruleNote, /过氧化物/);
});

console.log("── 判定 analyze：规则回退 ──");
check("单质 O2 → yes", () => {
  const a = analyze("O2");
  assert.equal(a.verdict, "yes");
  assert.match(a.ruleNote, /单质/);
});
check("单质 Fe → yes", () => {
  assert.equal(analyze("Fe").verdict, "yes");
});
check("金属氢化物 NaH → yes", () => {
  const a = analyze("NaH");
  assert.equal(a.verdict, "yes");
});
check("LiAlH4 → yes（含两种氢负离子配位）", () => {
  assert.equal(analyze("LiAlH4").verdict, "yes");
});
check("B2H6 硼烷 → yes", () => {
  assert.equal(analyze("B2H6").verdict, "yes");
});
check("Fe3O4 混合价 → yes", () => {
  const a = analyze("Fe3O4");
  assert.equal(a.verdict, "yes");
  assert.match(a.ruleNote, /混合价/);
});
check("NaCl2 电荷不平衡 → no", () => {
  assert.equal(analyze("NaCl2").verdict, "no");
});
check("混合价回归：Fe3O4/Mn3O4/Pb3O4 → yes", () => {
  for (const f of ["Fe3O4", "Mn3O4", "Pb3O4", "Co3O4"]) assert.equal(analyze(f).verdict, "yes", f);
});
check("过氧化物 Na2O2 → yes", () => {
  const a = analyze("Na2O2");
  assert.equal(a.verdict, "yes");
  assert.match(a.ruleNote, /过氧化物/);
});
check("超氧化物 KO2 → yes", () => {
  const a = analyze("KO2");
  assert.equal(a.verdict, "yes");
  assert.match(a.ruleNote, /超氧化物/);
});
check("带电离子 SO4^2- → conditional/charged", () => {
  const a = analyze("SO4^2-");
  assert.equal(a.verdict, "conditional");
  assert.ok(a.tags.includes("charged"));
});
check("H2OO2 电荷不平衡 → no", () => {
  assert.equal(analyze("H2OO2").verdict, "no");
});

console.log("── 判定：知识库全部物质不回归（verdict 非空、元素质量分数可算） ──");
check("KNOWNS 198 条全部 ok", () => {
  let bad = 0, samples = [];
  for (const k of Object.keys(KNOWNS)) {
    const a = analyze(k);
    if (!a.ok || !a.verdict) { bad++; if (samples.length < 3) samples.push(k); }
  }
  assert.equal(bad, 0, `失败: ${samples.join(", ")}`);
});
check("KNOWNS 全部有颜色（COLORS 补齐验收）", () => {
  let miss = [];
  for (const k of Object.keys(KNOWNS)) {
    const a = analyze(k);
    if (a.ok && !(a.colors && a.colors.length)) miss.push(k);
  }
  assert.equal(miss.length, 0, `缺颜色: ${miss.join(", ")}`);
});
check("KNOWNS 全部可算摩尔质量", () => {
  let miss = [];
  for (const k of Object.keys(KNOWNS)) {
    const m = molarMass(k);
    if (!(m && m > 0)) miss.push(k);
  }
  assert.equal(miss.length, 0, `缺质量: ${miss.join(", ")}`);
});
check("KNOWNS 全部可算元素质量分数", () => {
  let miss = [];
  for (const k of Object.keys(KNOWNS)) {
    const c = compositionMassPct(k);
    if (!(c && c.length)) miss.push(k);
  }
  assert.equal(miss.length, 0, `缺组成: ${miss.join(", ")}`);
});

console.log("── 酸根检测 detectRadical ──");
check("H2SO4 → 硫酸根", () => {
  const p = parseFormula(normalizeFormula("H2SO4"));
  const r = detectRadical(p);
  assert.ok(r && r.cn.includes("硫酸根"));
});
check("KMnO4 → 高锰酸根", () => {
  const p = parseFormula(normalizeFormula("KMnO4"));
  const r = detectRadical(p);
  assert.ok(r && r.cn.includes("高锰酸根"));
});

console.log("── 显示 prettyFormula ──");
check("CuSO4 → CuSO₄", () => {
  assert.equal(prettyFormula("CuSO4"), "CuSO₄");
});
check("Ca(OH)2 → Ca(OH)₂", () => {
  assert.equal(prettyFormula("Ca(OH)2"), "Ca(OH)₂");
});
check("电荷 Fe^3+ → Fe³⁺", () => {
  assert.equal(prettyFormula("Fe^3+"), "Fe³⁺");
});
check("水合 CuSO4·5H2O（5 不下标）", () => {
  assert.equal(prettyFormula("CuSO4.5H2O"), "CuSO₄·5H₂O");
});

console.log("── 数据表完整性 ──");
check("ELECTRODE 无重复键且约 210 条", () => {
  const keys = Object.keys(ELECTRODE);
  assert.equal(new Set(keys).size, keys.length, "存在重复键");
  assert.ok(keys.length >= 190, `仅 ${keys.length} 条`);
});
check("COLORS 无重复键", () => {
  const keys = Object.keys(COLORS);
  assert.equal(new Set(keys).size, keys.length);
});
check("ELEMENTS 覆盖 118 个元素", () => {
  assert.ok(Object.keys(ELEMENTS).length >= 110);
  assert.ok(ELEMENTS.H && ELEMENTS.O && ELEMENTS.U && ELEMENTS.Og);
});

console.log("── 静态页关键输入快速冒烟 ──");
check("NaCl → yes", () => assert.equal(analyze("NaCl").verdict, "yes"));
check("NaHCO3 → yes", () => assert.equal(analyze("NaHCO3").verdict, "yes"));
check("CuCl2 → yes", () => assert.equal(analyze("CuCl2").verdict, "yes"));
check("Hg2(OH)2 → no（知识库明确不存在）", () => assert.equal(analyze("Hg2(OH)2").verdict, "no"));
check("verdictText 返回文案", () => {
  assert.match(verdictText("yes"), /稳定存在/);
  assert.match(verdictText("no"), /不存在/);
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
