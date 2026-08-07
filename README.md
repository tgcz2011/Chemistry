# 化学式速查 · Chemical Assay Sheet

一个**网页版化学小工具**，能力一览：

1. **物质存在性判定**：输入任意化学式，毫秒级判断“稳定存在 / 仅特定条件下存在 / 可生成但极不稳定 / 通常不存在”，给出注意事项、**颜色与形态**（如 CuCl₂ 固体棕黄、稀溶液蓝、浓溶液绿）、摩尔质量，并附 PubChem/维基百科来源链接。
2. **化学方程式配平**：输入完整方程式（如 `KMnO4+HCl=KCl+MnCl2+H2O+Cl2`）用**代数法**自动配平（保证原子守恒，可处理氧化还原）。
3. **反应补全 + 化学计量**：仅给反应物（如 `HCl+NaOH`，条件可留空）→ 本地规则或 **Workers AI** 补全产物并配平，返回完整方程式与各物质摩尔质量，并可“给某物质的量 → 算其余”。
4. **状态符号与可逆**：产物自动标注沉淀 `↓`、气体 `↑`；可逆反应（如 `N₂+3H₂⇌2NH₃`、`CO₂+H₂O⇌H₂CO₃`）用 `⇌` 表示。
5. **剂量相关反应**：同一对反应物因少量/过量产物不同时，**列出全部方程式**（分步 + 总反应）。例如 CO₂ 通入澄清石灰水：少量生成 `CaCO₃↓`，过量溶解为 `Ca(HCO₃)₂`，并给出总反应。
6. **物种存在性校验**：方程式各物质联动存在性判定，若某物质通常不存在会提示，避免“算了不存在的反应”。

- 判定采用**多级 fallback 链**（本地 → 缓存 → 联网权威源 → AI）：

  ```
  本地知识库(110+精选, 毫秒) 
    → 价键/氧化态规则(即时) 
    → D1 缓存(14天, stale-while-revalidate) 
    → PubChem(美国国家化学数据库, 1.1亿+化合物, 权威证实存在性+CID+中文名) 
    → Wikipedia(中/英, WikiData 兜底) 
    → Workers AI(Qwen3-30B, 拿着 PubChem/Wiki 事实+本地价态提示做总结) 
    → 回写 D1 缓存
  ```

- **D1 缓存**：联网判定结果缓存 14 天；过期先返回旧值、后台刷新（stale-while-revalidate），兼顾速度与新鲜度。
- **上报机制**：`GET /api/report?formula=X` 让用户标记有误结果，**限流**（设备指纹 IP+UA 哈希；每设备每日 ≤20 次、单式每日 ≤3 次）后强制联网重查并更新缓存。
- **数据可信处理**：中文名可信过滤（剔除维基“XX列表/索引”等误命中）、离子感知、AI 提示词携带 PubChem/Wiki 事实与“PubChem 未命中≠不存在”约束。
- 界面为「化学检验报告单 / 安全数据表」编辑印刷风（判定章戳、SDS 编号分区、发丝线 + 颗粒噪点）。
- 线上地址：`https://chem-check.zztool.dpdns.org`（备用 `https://chem-check.tgcz2011.workers.dev`）。

---

## 快速开始（本地）

```bash
cd chem-check
wrangler dev --ip 127.0.0.1      # 本地开发，默认 http://localhost:8787
```

打开 http://localhost:8787 即可使用。修改 `public/` 下文件会热重载。

> 本地测试已通过：首页、静态资源、`/api/check` 均返回正常。

---

## 部署到 Cloudflare（Worker & Pages）

本项目用 **Worker 的静态资源能力**一次性部署“前端静态站 + Worker API”，即用户常说的
“Worker & Pages”一体方案（一次 `wrangler deploy` 同时获得类 Pages 的静态托管 + 边缘 API）。

### 1）登录并部署

```bash
wrangler login            # 浏览器授权（仅需一次）
wrangler deploy           # 发布到 Cloudflare，终端会给出 *.workers.dev 地址
```

部署后：
- 站点：`https://chem-check.<你的子域>.workers.dev`
- API：`https://chem-check.<你的子域>.workers.dev/api/check?formula=AgOH`

### 2）绑定自定义域名（可选）

在 Cloudflare 控制台 `Workers & Pages → chem-check → Settings → Domains` 添加你的域名，
按提示添加 DNS 记录即可（需该域名已托管在 Cloudflare）。

### 3）备选：纯 Cloudflare Pages 静态部署

若只想要前端（判定全在浏览器完成，无需 API），可直接把 `public/` 目录作为 **Pages** 静态站点发布：
- Pages 新建项目，构建输出目录填 `public`，无需构建命令；
- 或直接 `wrangler pages deploy public`。
- 前端在找不到 Worker API 时会自动回退到本地判定，因此纯静态也能用。

---

## ⚠️ 国内部署注意事项（重点）

Cloudflare 的节点默认通过**中国大陆境外**（香港、日本、新加坡等）为大陆访客服务，因此：

1. **国内访问速度**：大陆用户直接访问 `*.workers.dev` 或绑定的境外域名，延迟偏高、时好时坏，
   属正常现象（跨境链路所致），并非站点故障。

2. **ICP 备案**：
   - 若使用 Cloudflare **中国网络（China Network，企业版 + 境内京东云节点）**，域名**必须持有有效 ICP 备案**。
   - 普通全球版（境外节点）无需备案，但速度受跨境影响。
   - `*.workers.dev` 默认域名无法备案，需绑定**已备案的自有域名**才能走国内合规加速。

3. **面向国内用户的加速方案（无需/暂无需备案）**：
   - **方案 A（推荐，免费）**：用 **腾讯云 EdgeOne** 或 **DNSPod 智能解析** 做境内回源加速。
     把 Pages/Worker 的 `*.pages.dev` 或 `*.workers.dev` 作为源站，境内线路 CNAME 到国内 CDN，
     境外/默认线路仍直连 Cloudflare。注意：回源 Host 与源站地址一致，避免跳转循环。
   - **方案 B**：维护 Cloudflare **优选 IP**（社区维护的优选域名而非固定 IP），适合个人低流量站点，
     但优选 IP 会失效，需监控。
   - **方案 C（企业/长期）**：开通 **Cloudflare 中国网络**（Enterprise + ICP 备案），境内节点响应，速度最优。

4. **合规与内容**：
   - 化学内容含剧毒/爆炸/腐蚀等安全信息，属教育用途；如面向国内大众，建议保留“安全提示/免责声明”，
     符合内容安全与科普规范。
   - 涉及用户提交的公式仅在本地/边缘计算，不上传个人隐私数据；若后续增加统计/存储，须遵守《个人信息保护法》。

5. **免费额度**：Cloudflare 免费版对请求数/CPU 时间有限额，个人工具足够；超量再考虑付费。

---

## API 用法

```
GET /api/check?formula=<化学式>
```

示例：

```bash
curl "https://chem-check.<子域>.workers.dev/api/check?formula=AgOH"
```

返回（节选）：

```json
{
  "ok": true,
  "normalized": "AgOH",
  "name": "氢氧化银",
  "verdict": "unstable",
  "confidence": "high",
  "notes": ["氢氧化银在水中几乎不能独立存在……"],
  "warnings": ["⚠ 不稳定：受热、光照或久置易分解，现配现用。"],
  "tags": ["unstable", "oxidize"],
  "related": ["Ag2O"]
}
```

`verdict` 取值：`yes`(稳定存在) / `conditional`(仅特定条件存在) / `unstable`(可生成但极不稳定) / `no`(通常不存在)。

**深度判定（未收录物质，调用 Workers AI）**：在 `formula` 后加 `&deep=1`，例如：

```bash
curl "https://chem-check.zztool.dpdns.org/api/check?formula=CaCl2&deep=1"
# → { "source":"workers-ai", "verdict":"yes", "name":"氯化钙", "notes":["常温下稳定，易吸湿"], ... }
```

### 方程式配平与计算

```
GET /api/equation?input=<反应物或方程式>&condition=<可选条件>
```

- 完整方程式（本地代数配平）：

```bash
curl "https://chem-check.zztool.dpdns.org/api/equation?input=KMnO4%2BHCl%3DKCl%2BMnCl2%2BH2O%2BCl2"
# → { "equation":"2KMnO₄ + 16HCl → 2KCl + 2MnCl₂ + 8H₂O + 5Cl₂", "mode":"balance", "species":[{formula,coeff,molarMass,name},...] }
```

- 仅反应物（本地规则或 AI 补全）：

```bash
curl "https://chem-check.zztool.dpdns.org/api/equation?input=HCl%2BNaOH"
# → { "equation":"HCl + NaOH → NaCl + H₂O", "mode":"completion", "type":"酸碱中和" }

curl "https://chem-check.zztool.dpdns.org/api/equation?input=Fe%2BH2SO4"
# → { "equation":"Fe + H₂SO₄ → FeSO₄ + H₂", "mode":"completion", "type":"置换", "ai":true }
```

返回中 `species` 含每种物质的 `coeff`（系数）与 `molarMass`（摩尔质量），前端据此做化学计量计算。

判定结果若来自联网，会附 `sources`（PubChem / 维基百科链接）、`source`（pubchem/workers-ai/knowledge-base/rule）、`fromCache` 等字段。

**上报刷新**（结果有误时强制重查，限流）：

```
GET /api/report?formula=<化学式>&did=<设备ID，可省>
# 命中知识库的精选条目不支持上报；其余强制联网重查并更新 D1 缓存
# 限流：每设备每日 ≤20 次、单化学式每日 ≤3 次；超限返回 429
```

还提供 `GET /api/health` 健康检查。

### D1 数据库

本项目使用独立的 D1 数据库 `chem-check-cache`（缓存 + 上报限流），schema 在 `migrations/0001_init.sql`。首次部署需：

```bash
wrangler d1 create chem-check-cache           # 得到 database_id，填入 wrangler.toml
wrangler d1 migrations apply chem-check-cache --remote   # 生产
wrangler d1 migrations apply chem-check-cache --local    # 本地 dev
```

---

## 化学式引擎说明（覆盖“所有化学式”）

位于 `public/chem-engine.js`，浏览器与 Worker 共用：

1. **解析器**：支持大写元素符号、嵌套括号 `()`、方括号配合物 `[]`、水合点 `·`、末尾电荷 `+`/`-`（如 `SO4^2-`、`Fe3+`）。
2. **知识库**（`KNOWNS`）：约 110 种物质的权威判定与中文注意事项，命中即高置信返回。
3. **规则回退**（`ruleCheck`）：对未收录式，依据周期表氧化态与**电中性**规则推断：
   - 电荷可平衡且氧化态合理 → “可能存在”(medium)；
   - 含变价元素无法唯一判定（如 Fe₃O₄ 混合价）→ 保守判“可能存在”；
   - 电荷无法平衡（如 `NaCl₂`）→ “通常不存在”。

因此可即时处理任意输入的合法化学式，而不仅限常见式。规则推断为辅助判断，权威结论以实验与文献为准。

---

## 文件结构

```
chem-check/
├── public/
│   ├── index.html        # 网页界面（检验报告单/SDS 风）
│   ├── styles.css        # 样式
│   ├── app.js            # 前端逻辑（判定 + 配平计算 + 上报）
│   ├── chem-engine.js    # 化学式解析 + 存在性判定引擎（浏览器/Worker 共用）
│   └── chem-calc.js      # 代数配平 + 摩尔质量 + 化学计量（含 118 元素原子量）
├── src/
│   ├── worker.js         # Worker：路由 + fallback 链编排 + 上报限流 + AI 提示词
│   ├── chem-sources.js   # PubChem / Wikipedia 数据源客户端
│   ├── chem-cache.js     # D1 缓存（stale-while-revalidate）+ 上报限流
│   └── chem-reactions.js # 本地无机反应补全引擎（中和/复分解/置换等）
├── migrations/
│   └── 0001_init.sql     # D1 schema（缓存 + 限流）
├── wrangler.toml         # 部署配置（Worker + 静态资源 + AI + D1 + 自定义域名）
├── package.json
├── LICENSE               # GPLv3
└── README.md
```

## 反应数据来源与后续扩展（参考）

当前补全优先走**本地无机反应规则**（中和/复分解/置换等，毫秒级、零依赖），覆盖不到的交给 **Workers AI**。如需更强的反应数据，可参考这些开放数据库：

- **Open Reaction Database (ORD)** — 约 200 万有机反应，结构化记录条件/产物/产率，CC BY-SA。https://open-reaction-database.org/
- **Chemotion Repository** — KIT 维护，含分子结构、谱图、实验记录（带 DOI）。https://www.chemotion-repository.net/
- **PubChem Reactions** — PubChem 的化学/生化反应数据（与化合物数据打通）。https://pubchem.ncbi.nlm.nih.gov/
- **Catalysis-Hub** — 表面催化反应（反应能/活化能）。https://www.catalysis-hub.org/
- **Organic Syntheses** — 经独立实验室验证的经典有机合成方法。http://www.orgsyn.org/

这些多为大型数据集，适合做离线检索/模型训练；接入本工具可考虑作为新的在线兜底源或离线预置库。

## 开源许可

本项目以 **GNU General Public License v3.0 (GPLv3)** 开源，详见 [LICENSE](./LICENSE)。

## 免责声明

本工具用于教育与快速查证，判定基于公开化学规律与文献整理，不构成实验或安全操作的依据。
涉及剧毒、腐蚀、易燃易爆物质的操作，请严格遵循实验室规范与安全手册。
