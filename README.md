# 化学式速查 · Chemical Assay Sheet

一个**网页版化学小工具**，能力一览：

1. **物质存在性判定**：输入任意化学式，毫秒级判断"稳定存在 / 仅特定条件下存在 / 可生成但极不稳定 / 通常不存在"，给出注意事项、**颜色与形态**（含显色离子来源，如 CuCl₂ 溶液蓝色因 Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺）、**氧化/还原性**（分类讨论，如在水中 vs 酸性条件下）、**溶解度**（按溶剂分类）、**电极电势**（分情形给出半电池反应、标准电势 E° 与随离子浓度变化的能斯特方程）、危险信息、摩尔质量，并附 PubChem/维基百科来源链接。所有字段结构化固定输出，缺失填"无"。
2. **化学方程式配平**：输入完整方程式（如 `KMnO4+HCl=KCl+MnCl2+H2O+Cl2`）用**代数法**自动配平（保证原子守恒，可处理氧化还原）。
3. **反应补全 + 化学计量**：仅给反应物（如 `HCl+NaOH`，条件可留空）→ 本地规则或 **Workers AI** 补全产物并配平，返回完整方程式与各物质摩尔质量，并可“给某物质的量 → 算其余”。
4. **状态符号与可逆**：产物自动标注沉淀 `↓`、气体 `↑`；可逆反应（如 `N₂+3H₂⇌2NH₃`、`CO₂+H₂O⇌H₂CO₃`）用 `⇌` 表示。
5. **剂量相关反应**：同一对反应物因少量/过量产物不同时，**列出全部方程式**（分步 + 总反应）。例如 CO₂ 通入澄清石灰水：少量生成 `CaCO₃↓`，过量溶解为 `Ca(HCO₃)₂`，并给出总反应。
6. **双水解反应**：Al³⁺/Fe³⁺ 盐与 S²⁻/CO₃²⁻/HCO₃⁻/AlO₂⁻/SiO₃²⁻ 盐相遇时自动识别双水解，生成氢氧化物沉淀 + 气体/硅酸 + 盐，并配平。如 `AlCl₃+Na₂CO₃ → 2Al(OH)₃↓ + 3CO₂↑ + 6NaCl`。
7. **物种存在性校验**：方程式各物质联动存在性判定，若某物质通常不存在会提示，避免"算了不存在的反应"。
8. **元素质量分数**：判定结果附带元素组成表（符号/名称/原子数/质量分数），带可视化进度条。
9. **酸根结构识别**：自动检测并标注常见含氧酸根（硫酸根/亚硫酸根/硝酸根/磷酸根/高锰酸根等 16 种）。
10. **待核实状态**：未收录化学式在联网深度判定期间显示"待核实（WAITING）"章戳，联网完成后自动更新。
11. **深色/浅色主题 + 中英双语**：一键切换明暗主题与中英文，偏好记忆到 localStorage。
12. **URL 分享 / 打印**：判定结果同步到链接（`?f=CuSO4`，方程式 `?e=...&cond=...`），一键复制链接；报告单支持直接打印输出。
 13. **结构式渲染（OpenChemLib）**：判定结果直接画出结构式——本地内置分子辞典（覆盖 180+ 种常见物质），输入如 `CuSO4`、`C2H6O`、`CaCO3` 即出键线结构图；**同一分子式存在同分异构体时全部画出**（如 `C2H6O` → 乙醇 + 二甲醚）；**纯离子化合物**（如 `NaCl`、`AgOH`）因无独立分子结构，改为显示"离子组成"卡（`Na⁺ · Cl⁻`）；渲染库为离线自托管的 OpenChemLib（工业级化学库，解决旧 smiles-drawer 对含氧酸布局失效的问题），键线配色随明暗主题自动切换。

- 判定采用**多级 fallback 链**（本地 → 缓存 → 联网权威源 → AI）：

  ```
  本地知识库(198精选, 毫秒) 
    → 价键/氧化态规则(即时) 
    → D1 缓存(永不过期，上报刷新时覆盖) 
    → PubChem(美国国家化学数据库, 1.1亿+化合物, 权威证实存在性+CID+中文名) 
    → Wikipedia(中/英, WikiData 兜底) 
    → Workers AI(Qwen3-30B, 拿着 PubChem/Wiki 事实+本地价态提示做总结) 
    → 回写 D1 缓存
  ```

- **D1 缓存**：联网判定结果缓存**永不过期**（避免重复付费联网），仅当用户通过上报机制标记有误时才强制重查覆盖。
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

## API 调用教程

### 访问方式与限流规则

| 调用方式 | 是否需要 API key | 限流 |
|---------|:---:|------|
| **网页查询**（同源 Origin/Referer 匹配站点域名） | 否 | 不限 |
| **外部 API 调用**（跨域，如 curl / 其他网站 / 后端服务） | **否**（按 IP 自助额度） | **同一 IP 每日 50 次** |

> **网页查询不计入限流**——在 `chem-check.zztool.dpdns.org` 页面上查询是免费无限的。
> 外部调用**无需申请 key**：按调用来源 IP 自动计算额度，同一 IP 每日 50 次，随取随用。
> 查看自己 IP 的今日剩余额度：访问 [额度查询页](/usage) 或 `GET /api/usage`。

### 获取 API key（已废止）

旧版需要 `API_KEYS` 环境变量手工配置静态 key；现在外部调用**不再需要 key**，按 IP 自助额度（50 次/天/IP）。历史 key 配置说明已移除，请求头 `Authorization: Bearer` / `X-Api-Key` 不再校验，跨域调用无需预检凭据。

### 站长控制台

访问 `/console`（需 `CONSOLE_PASSWORD` 密码登录），统一查看：
- **运行总览**：今日/累计外部调用、活跃 IP、D1 缓存条目、上报纠错数
- **近 7 日调用趋势** 与 **调用目的地 TOP**（按 Referer 域名 / 地域 / User-Agent 聚合）
- **物质查询统计**（最近被联网判定并缓存的化学式）与 **上报纠错 TOP**
- **API 配置管理**：当前限流参数与控制台密码状态

> 控制台会话为签名 cookie（7 天有效），凭据不经过 URL。`CONSOLE_PASSWORD` 通过 `wrangler secret put CONSOLE_PASSWORD` 配置，未配置时登录接口返回 500 提示。

### 接口列表

| 接口 | 说明 |
|------|------|
| `GET /api/check?formula=X[&deep=1]` | 物质存在性判定（`deep=1` 触发联网兜底链） |
| `GET /api/report?formula=X[&did=Y]` | 上报信息有误，强制联网重查并更新缓存 |
| `GET /api/equation?input=..&condition=..` | 方程式配平 / 补全 / 化学计量 |
| `GET /api/usage` | 当前 IP 额度查询（今日已用/剩余/上限/重置时间，无需 key） |
| `GET /api/health` | 健康检查（无需 key） |

### 统一响应结构

所有 `/api/check` 和 `/api/report` 的返回都经过**结构化归一化**——所有字段必现，无资料填 `[]`（数组）或 `null`（标量），不会出现字段缺失的情况。

```json
{
  "ok": true,
  "input": "CuSO4",
  "normalized": "CuSO4",
  "name": "硫酸铜",
  "verdict": "yes",
  "confidence": "high",
  "source": "pubchem",
  "elements": { "Cu": 1, "S": 1, "O": 4 },
  "charge": 0,
  "mass": 159.609,
  "composition": [
    { "symbol": "Cu", "name": "铜", "count": 1, "massPct": 39.81 },
    { "symbol": "S",  "name": "硫", "count": 1, "massPct": 20.09 },
    { "symbol": "O",  "name": "氧", "count": 4, "massPct": 40.10 }
  ],
  "radical": null,
  "hazards": ["toxic"],
  "redox": [
    { "condition": "在水中", "behavior": "无显著氧化还原性", "detail": "Cu²⁺ 较稳定" },
    { "condition": "活泼金属置换", "behavior": "氧化性", "detail": "Cu²⁺ 可被 Zn/Fe 置换为 Cu" }
  ],
  "colors": [
    { "form": "无水固体", "color": "白色", "hex": "#f4f4f0", "ion": null },
    { "form": "水溶液", "color": "蓝色", "hex": "#2e6fd6", "ion": "Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺" }
  ],
  "solubility": [
    { "solvent": "水", "value": "易溶", "note": "20°C 约 23g/100mL" },
    { "solvent": "乙醇", "value": "微溶", "note": "难溶于无水乙醇" }
  ],
  "electrode": [
    { "condition": "水溶液（标准态）", "reaction": "Cu²⁺ + 2e⁻ ⇌ Cu", "e0": "E° = +0.34 V", "nernst": "E = 0.34 + (0.0592/2)·lg[Cu²⁺]", "detail": "Cu²⁺ 浓度越大，电极电势越高" }
  ],
  "warnings": ["⚠ 剧毒：避免接触与误食..."],
  "notes": ["无水硫酸铜为白色粉末，吸水后变蓝..."],
  "sources": [{ "label": "PubChem CID 24462", "url": "https://pubchem.ncbi.nlm.nih.gov/compound/24462" }],
  "related": ["CuSO4·5H2O", "Cu(OH)2", "BaCl2"],
  "fromCache": false,
  "stale": false,
  "ruleNote": null
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `verdict` | string | `yes`(稳定存在) / `conditional`(特定条件) / `unstable`(极不稳定) / `no`(通常不存在) |
| `hazards` | string[] | 危险标签：`toxic`(剧毒) / `corrosive`(腐蚀) / `explosive`(爆炸) / `oxidize`(易氧化) / `unstable`(不稳定) / `charged`(带电)；无关则 `[]` |
| `redox` | array | 氧化/还原性，**按条件分类**：`condition`(条件) + `behavior`(氧化性/还原性/歧化/无) + `detail`(具体描述)；无资料 `[]` |
| `colors` | array | 颜色与形态，按形态分类：`form`(固体/水溶液/气体) + `color` + `hex`(色值) + `ion`(显色离子来源，如 `Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺`；物质整体显色则 `null`)；无资料 `[]` |
| `solubility` | array | 溶解度，**按溶剂分类**：`solvent`(水/乙醇/...) + `value`(易溶/可溶/微溶/难溶/不溶) + `note`(具体数值)；无资料 `[]` |
| `electrode` | array/nil | 电极电势，**按情形分类**：`condition`(酸性/碱性/中性/非水/固态) + `reaction`(半电池反应) + `e0`(标准电势 E°) + `nernst`(能斯特方程 E°+(0.0592/n)·lg...) + `detail`(说明)；该物质不构成电极体系则 `null`，前端显示"无" |
| `composition` | array | 元素质量分数：`symbol` + `name` + `count` + `massPct` |
| `source` | string | `pubchem` / `workers-ai` / `knowledge-base` / `rule` / `rule-fallback` |
| `fromCache` / `stale` | boolean | 是否来自 D1 缓存 / 是否过期(后台刷新中) |

### 调用示例

**网页查询（同源，无需 key，无限）**：
直接在 `https://chem-check.zztool.dpdns.org` 页面输入化学式即可。

**外部 API 调用（按 IP 自助额度，50 次/天/IP，无需 key）**：

```bash
# 物质判定（含深度联网）
curl "https://chem-check.zztool.dpdns.org/api/check?formula=CuSO4&deep=1"

# 方程式配平
curl "https://chem-check.zztool.dpdns.org/api/equation?input=KMnO4%2BHCl%3DKCl%2BMnCl2%2BH2O%2BCl2"

# 仅给反应物，AI 补全产物
curl "https://chem-check.zztool.dpdns.org/api/equation?input=HCl%2BNaOH"
# → { "equation":"HCl + NaOH → NaCl + H₂O", "mode":"completion", "type":"酸碱中和" }

# 双水解反应（本地规则自动识别）
curl "https://chem-check.zztool.dpdns.org/api/equation?input=AlCl3%2BNa2CO3"
# → { "equation":"2AlCl₃ + 3Na₂CO₃ + 3H₂O → 2Al(OH)₃↓ + 3CO₂↑ + 6NaCl", "type":"双水解" }

# 查看当前 IP 剩余额度
curl "https://chem-check.zztool.dpdns.org/api/usage"
```

**超限（429）响应**：

```json
{ "ok": false, "error": "今日 API 调用已达上限（50 次/IP/天），请明日再试。", "limit": { "used": 50, "limit": 50 } }
```

429 响应附带 Header：`X-RateLimit-Limit: 50`、`X-RateLimit-Remaining: 0`、`X-RateLimit-Reset: <unix时间戳>`、`Retry-After: 86400`。

**上报刷新**（结果有误时强制重查，限流）：

```
GET /api/report?formula=<化学式>&did=<设备ID，可省>
# 命中知识库的精选条目不支持上报；其余强制联网重查并更新 D1 缓存
# 限流：每设备每日 ≤20 次、单化学式每日 ≤3 次；超限返回 429
```

还提供 `GET /api/health` 健康检查（无需 key）。

### D1 数据库

本项目使用独立的 D1 数据库 `chem-check-cache`（缓存 + 上报限流 + API 限流），schema 在 `migrations/`。首次部署需：

```bash
wrangler d1 create chem-check-cache           # 得到 database_id，填入 wrangler.toml
wrangler d1 migrations apply chem-check-cache --remote   # 生产
wrangler d1 migrations apply chem-check-cache --local    # 本地 dev
```

三张表：
- `formula_cache` — 联网判定结果 + 方程式 AI 补全缓存（永不过期，上报刷新时覆盖）
- `report_usage` — 上报限流计数（每设备每日 ≤20、单式 ≤3）
- `api_usage` — 外部 API 调用限流计数（每 IP 每日 ≤50，同源网页查询不计）

---

## 化学式引擎说明（覆盖“所有化学式”）

位于 `public/chem-engine.js`，浏览器与 Worker 共用：

1. **解析器**：支持大写元素符号、嵌套括号 `()`、方括号配合物 `[]`、水合点 `·`、末尾电荷 `+`/`-`（如 `SO4^2-`、`Fe3+`）。
2. **知识库**（`KNOWNS`）：198 种物质的权威判定与中文注意事项，命中即高置信返回。
3. **规则回退**（`ruleCheck`）：对未收录式，依据周期表氧化态与**电中性**规则推断：
   - 电荷可平衡且氧化态合理 → “可能存在”(medium)；
   - 含变价元素无法唯一判定（如 Fe₃O₄ 混合价）→ 自动尝试两种常见氧化态按整数原子数组合，或保守判“可能存在”；
   - 氢化物特判（金属氢化物/硼烷/硅烷中 H 取 −1），电荷无法平衡（如 `NaCl₂`）→ “通常不存在”。
4. **电极电势表**（`ELECTRODE`）：约 210 种物质的双语电极电势数据（半电池反应、E°、能斯特方程、条件说明），覆盖全部 KNOWNS 与常见单质/盐；查询命中即随判定结果一并返回，未收录则返回 `null`（前端显示"无"）。

因此可即时处理任意输入的合法化学式，而不仅限常见式。规则推断为辅助判断，权威结论以实验与文献为准。

---

## 文件结构

```
chem-check/
├── public/
│   ├── index.html        # 网页界面（检验报告单/SDS 风）
│   ├── styles.css        # 样式（含自托管字体 @font-face 与打印样式）
│   ├── app.js            # 前端逻辑（判定 + 配平计算 + 上报 + URL 分享 + 结构式渲染）
│   ├── chem-engine.js    # 化学式解析 + 存在性判定引擎 + 电极电势表 + 酸根检测 + 颜色表（浏览器/Worker 共用）
│   ├── chem-calc.js      # 代数配平 + 摩尔质量 + 化学计量 + 元素质量分数（含 118 元素原子量）
│   ├── chem-structure.js # 化学式→SMILES 结构辞典（180+ 物质）+ 同分异构体表 + 离子判定
│   ├── chem-engine.test.mjs  # 引擎单元测试（42 用例）
│   ├── chem-structure.test.mjs # 结构辞典单元测试（15 用例）
│   ├── vendor/openchemlib.js   # 结构式渲染库（OpenChemLib 9.x ESM，离线自托管）
│   └── fonts/            # 自托管 woff2（Fraunces + IBM Plex Sans/Mono，国内免翻字体加速）
├── src/
│   ├── worker.js         # Worker：路由 + fallback 链 + AI 提示词 + API 网关(限流/key) + 结构化返回
│   ├── chem-sources.js   # PubChem / Wikipedia 数据源客户端
│   ├── chem-cache.js     # D1 缓存(永不过期) + 上报限流 + API 限流
│   └── chem-reactions.js # 本地无机反应补全引擎（中和/复分解/置换/双水解/剂量变体）
├── migrations/
│   ├── 0001_init.sql     # D1 schema：formula_cache + report_usage
│   └── 0002_api_usage.sql # D1 schema：api_usage（外部 API 限流计数）
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

## 开发者文档

- **[HANDOFF.md](./HANDOFF.md)**：交接文档——项目要点、架构、踩过的坑、注意点、当前进度、后续规划。**接手/改代码前请先读它。**
- **文档维护约定**：`README.md`（面向用户）与 `HANDOFF.md`（面向开发者）**必须随每次开发同步更新**。新增功能、改架构/依赖/部署、踩新坑，都要及时补进对应文档；踩坑务必记到 HANDOFF 的「踩过的坑」一节。详见 HANDOFF 文末。

## 免责声明

本工具用于教育与快速查证，判定基于公开化学规律与文献整理，不构成实验或安全操作的依据。
涉及剧毒、腐蚀、易燃易爆物质的操作，请严格遵循实验室规范与安全手册。
