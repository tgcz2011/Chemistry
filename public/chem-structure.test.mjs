// public/chem-structure.test.mjs — 单元测试：化学式→结构式(SMILES) 映射查询
// 运行：node public/chem-structure.test.mjs
import assert from "node:assert/strict";
import {
  FORMULA_STRUCTURES, ISOMER_STRUCTURES,
  molecularFormula, lookupStructures
} from "./chem-structure.js";
import { parseFormula, KNOWNS } from "./chem-engine.js";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { failed++; console.log("  ✗", name, "—", e.message); }
}

console.log("── 映射表完整性 ──");
check("FORMULA_STRUCTURES 条目均有 name.cn / name.en", () => {
  for (const [k, arr] of Object.entries(FORMULA_STRUCTURES)) {
    assert.ok(Array.isArray(arr) && arr.length > 0, k);
    for (const s of arr) {
      assert.ok(s.smiles && typeof s.smiles === "string", `${k} smiles`);
      assert.ok(s.name && s.name.cn && s.name.en, `${k} 双语名`);
    }
  }
});
check("ISOMER_STRUCTURES 每条 ≥2 个异构体", () => {
  for (const [k, arr] of Object.entries(ISOMER_STRUCTURES)) {
    assert.ok(arr.length >= 2, `${k} 应含≥2个异构体，实际 ${arr.length}`);
  }
});

console.log("── molecularFormula（异构体匹配键）──");
check("C2H6O 排序计数 → C2H6O", () => {
  const p = parseFormula("C2H6O");
  assert.equal(molecularFormula(p), "C2H6O");
});
check("CH3OH 归一 → CH4O", () => {
  const p = parseFormula("CH3OH");
  assert.equal(molecularFormula(p), "CH4O");
});

console.log("── lookupStructures 查询 ──");
check("CuSO4 命中并回退正确", () => {
  const r = lookupStructures("CuSO4");
  assert.ok(r, "应命中");
  assert.equal(r.isomers, false);
  assert.equal(r.structures.length, 1);
  assert.ok(r.structures[0].smiles.includes("Cu+2"));
});
check("水合物 CuSO4.5H2O 回退主成分", () => {
  const r = lookupStructures("CuSO4.5H2O");
  assert.ok(r, "水合物应回退主成分");
  assert.equal(r.structures[0].smiles, "[Cu+2].[O-]S(=O)(=O)[O-]");
});
check("同分异构体 C2H6O → 乙醇 + 二甲醚", () => {
  const r = lookupStructures("C2H6O");
  assert.ok(r);
  assert.equal(r.isomers, true);
  assert.equal(r.structures.length, 2);
  const names = r.structures.map(s => s.name.cn);
  assert.ok(names.some(n => n.includes("乙醇")), "应含乙醇");
  assert.ok(names.some(n => n.includes("二甲醚")), "应含二甲醚");
});
check("分子式输入 CH3OH 走具体结构而非异构体", () => {
  const r = lookupStructures("CH3OH");
  assert.ok(r);
  assert.equal(r.isomers, false);
  assert.equal(r.structures[0].smiles, "CO");
});
check("金属单质 Na 返回 null（无分子结构）", () => {
  assert.equal(lookupStructures("Na"), null);
});
check("未知化合物 Fe2S3 返回 null", () => {
  assert.equal(lookupStructures("Fe2S3"), null);
});
check("括号键 Ca(OH)2 命中", () => {
  const r = lookupStructures("Ca(OH)2");
  assert.ok(r);
  assert.ok(r.structures[0].smiles.includes("Ca+2"));
});
check("配合物键 K3[Fe(CN)6] 命中", () => {
  const r = lookupStructures("K3[Fe(CN)6]");
  assert.ok(r, "应命中配合物");
});
check("KAl(SO4)2（明矾）命中且 SMILES 完整", () => {
  const r = lookupStructures("KAl(SO4)2");
  assert.ok(r);
  const s = r.structures[0].smiles;
  assert.ok(s.includes("K+") && s.includes("Al+3") && s.split("[O-]S").length === 3, "应含 K+ / Al+3 / 两个硫酸根");
});
check("Fe3O4 / Pb3O4 SMILES 原子数正确", () => {
  for (const [f, nFe] of [["Fe3O4", 3], ["Pb3O4", 3]]) {
    const r = lookupStructures(f);
    assert.ok(r, f);
    const s = r.structures[0].smiles;
    assert.equal((s.match(/\[Fe/g) || []).length + (s.match(/\[Pb/g) || []).length, nFe, f);
    assert.equal((s.match(/\[O-2\]/g) || []).length, 4, f + " 4个O2-");
  }
});
check("KNOWNS 知识库绝大多数可给出结构", () => {
  let covered = 0;
  for (const k of Object.keys(KNOWNS)) if (lookupStructures(k)) covered++;
  assert.ok(covered >= 175, `覆盖 ${covered}/198，应 ≥175`);
  console.log(`      （${covered}/${Object.keys(KNOWNS).length} 覆盖）`);
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
