import assert from "node:assert/strict";
import { REDOX_REAGENTS, REDUCTION_POTENTIALS, REDOX_GUIDE } from "./redox-data.js";

let passed = 0;
function check(name, fn){ fn(); passed++; console.log("  ✓", name); }

check("常见氧化剂与还原剂均覆盖",()=>{
  assert.ok(REDOX_REAGENTS.filter(r=>r.kind==="oxidant").length>=8);
  assert.ok(REDOX_REAGENTS.filter(r=>r.kind==="reductant").length>=10);
  assert.equal(new Set(REDOX_REAGENTS.map(r=>r.id)).size,REDOX_REAGENTS.length);
  for(const r of REDOX_REAGENTS){
    assert.ok(r.species && r.condition.cn && r.condition.en);
    assert.ok(r.change.cn && r.change.en && r.note.cn && r.note.en);
  }
});

check("高锰酸钾分三类介质且产物不同",()=>{
  const rows=REDOX_REAGENTS.filter(r=>r.id.startsWith("kmno4-"));
  assert.equal(rows.length,3);
  assert.ok(rows.some(r=>r.change.cn.includes("Mn²⁺")));
  assert.ok(rows.some(r=>r.change.cn.includes("MnO₂")));
  assert.ok(rows.some(r=>r.change.cn.includes("MnO₄²⁻")));
});

check("硝酸、过氧化氢与铁均保留条件边界",()=>{
  assert.ok(REDOX_REAGENTS.find(r=>r.id==="nitric-conc").change.cn.includes("NO₂"));
  assert.ok(REDOX_REAGENTS.find(r=>r.id==="nitric-dilute").change.cn.includes("NO"));
  assert.equal(REDOX_REAGENTS.filter(r=>r.species==="H₂O₂").length,2);
  assert.ok(REDOX_REAGENTS.find(r=>r.id==="iron-metal").note.cn.includes("Fe³⁺"));
});

check("电势值有限且严格降序",()=>{
  assert.ok(REDUCTION_POTENTIALS.length>=15);
  for(let i=0;i<REDUCTION_POTENTIALS.length;i++){
    const r=REDUCTION_POTENTIALS[i];
    assert.ok(Number.isFinite(r.potential),r.id);
    assert.ok(r.reaction.includes("⇌") && r.condition.cn && r.condition.en,r.id);
    if(i) assert.ok(REDUCTION_POTENTIALS[i-1].potential>r.potential,"应按 E° 降序");
  }
});

check("关键电对数值与标准氢电极正确",()=>{
  const byId=Object.fromEntries(REDUCTION_POTENTIALS.map(r=>[r.id,r]));
  assert.equal(byId.permanganate.potential,1.51);
  assert.equal(byId.iodine.potential,0.5355);
  assert.equal(byId.copper.potential,0.3419);
  assert.equal(byId.hydrogen.potential,0);
  assert.equal(byId.zinc.potential,-0.7618);
});

check("判读原则与可访问来源齐全",()=>{
  assert.ok(REDOX_GUIDE.principles.length>=4);
  assert.ok(REDOX_GUIDE.principles.some(p=>p.cn.includes("反应速率")));
  assert.ok(REDOX_GUIDE.principles.some(p=>p.cn.includes("pH")));
  assert.ok(REDOX_GUIDE.sources.length>=3);
  for(const s of REDOX_GUIDE.sources) assert.match(s.url,/^https:\/\//);
});

console.log(`\n${passed} 项氧化还原资料测试通过。`);
