# 交接文档 · 化学式速查（chem-check）

> 本文档面向**接手本项目的人**（包括未来的自己）。读完应能：跑起来、改得动、不踩前人踩过的坑。
> **维护约定见文末「📝 文档维护」——README 与本文档必须随每次开发同步更新。**

- **线上地址**：https://chem-check.zztool.dpdns.org （备用 https://chem-check.tgcz2011.workers.dev ）
- **代码仓库**：https://github.com/tgcz2011/Chemistry （`main` 分支，GPLv3）
- **项目根目录**：`chem-check/`（本文件所在目录）
- **技术栈**：Cloudflare Worker（静态资源 + API）+ Workers AI + D1，前端为无框架原生 ESM。

---

## 一、项目要点（一句话 + 设计哲学）

**一句话**：输入任意化学式/化学方程式，毫秒级判断物质是否存在、配平方程式、补全产物、算化学计量，并给出颜色/形态/电极电势/注意事项/来源。

**核心设计哲学**——**多级 fallback 链**，不靠单一来源，逐级兜底：

```
本地知识库(198精选, 毫秒) 
  → 价键/氧化态规则(即时) 
  → D1 缓存(永不过期，上报刷新时覆盖) 
  → PubChem(美国化学数据库, 权威证实存在性+CID+中文名) 
  → Wikipedia(中/英, WikiData 兜底) 
  → Workers AI(Qwen3-30B, 拿着前面的事实做总结) 
  → 回写 D1 缓存
```

为什么这样设计：
- **PubChem 是关键**——它是真实权威数据库，能直接"证实"一个化学式存在（给 CID），而不是让 AI 凭空猜。这解决了"所有化学式预设不完"的问题。
- **AI 放最后且带着事实**——把 PubChem/Wiki 查到的事实塞进提示词，AI 只做总结判断，大幅降低幻觉。
- **本地能算的不联网**——配平、常见反应补全、剂量变体都是纯本地逻辑，零成本零延迟。

---

## 二、功能清单（已实现）

| # | 功能 | 说明 | 入口 |
|---|------|------|------|
| 1 | 物质存在性判定 | 稳定存在/仅特定条件/极不稳定/通常不存在 四档 + 注意事项 | `GET /api/check?formula=X` |
| 2 | 颜色与形态 | 按形态给颜色（固体/晶体/水溶液/气体）+ 色块。如 CuCl₂ 固体棕黄、稀溶液蓝、浓溶液绿 | 同上，结果含 `colors` |
| 3 | 方程式配平 | 代数法（浮点 RREF 求零空间→有理化最小正整数），可处理氧化还原 | `GET /api/equation?input=A+B=C+D` |
| 4 | 反应补全 | 只给反应物 → 本地规则 / AI 补全产物并配平。如 `HCl+NaOH → NaCl+H₂O` | `GET /api/equation?input=A+B` |
| 5 | 化学计量计算 | 给某物质的量（g/mol）→ 算其余物质的质量/摩尔 | 前端计算器 |
| 6 | 状态符号 | 产物自动标沉淀 `↓`、气体 `↑`（溶解度表+气体表） | 方程式结果 |
| 7 | 可逆反应 | 用 `⇌` 表示，如 `N₂+3H₂⇌2NH₃`、`CO₂+H₂O⇌H₂CO₃` | 方程式结果 `reversible` |
| 8 | 剂量相关反应 | 少量/过量产物不同时**列出全部方程式**（分步+总反应）。内置 14 组 | 方程式结果 `mode:"dosage"` |
| 9 | 物种存在性校验 | 方程式各物质联动判定，不存在的会警告（避免算不存在的反应） | 方程式结果 `nonexistent` |
| 10 | 深度判定（AI） | 未收录物质调 Workers AI，返回名称/存在性/颜色/注意事项 | `&deep=1` |
| 11 | 上报刷新 | 用户标记有误结果，限流后强制联网重查并更新缓存 | `GET /api/report?formula=X` |
| 12 | D1 缓存 | 联网结果缓存**永不过期**（避免重复付费联网），仅上报标记有误时强制重查覆盖 | 自动 |
| 13 | 双水解反应 | Al³⁺/Fe³⁺ 盐遇 S²⁻/CO₃²⁻/HCO₃⁻/AlO₂⁻/SiO₃²⁻ 自动识别双水解，生成氢氧化物沉淀+气体/硅酸+盐 | 方程式结果 `type:"双水解"` |
| 14 | 元素质量分数 | 判定结果附元素组成表（符号/名称/原子数/质量分数），前端带进度条 | `composition` 字段 |
| 15 | 酸根结构识别 | 自动检测 16 种常见含氧酸根（硫酸根/硝酸根/磷酸根/高锰酸根等） | `radical` 字段 |
| 16 | 待核实状态 | 未收录式联网判定期间显示"WAITING"虚线章戳+脉冲动画 | 前端 `opts.waiting` |
| 17 | 深色主题+双语 | 一键切换明暗主题与中英文，偏好记忆 localStorage | `data-theme` / `data-lang` |
| 18 | **氧化/还原性分类** | 按条件分类讨论（水中/酸性/碱性/加热等），AI 提示词强制输出 | `redox` 字段 |
| 19 | **溶解度分类** | 按溶剂分类（水/乙醇/有机溶剂等），含具体数值 | `solubility` 字段 |
| 20 | **颜色显色来源** | colors 增加 `ion` 字段，标注显色离子（如 `Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺`） | `colors[].ion` |
| 21 | **统一结构化返回** | 所有字段必现，缺失填 `[]`/`null`；`tags` 改名 `hazards` | `normalizeResult()` |
| 22 | **API 网关与限流** | 同源网页免费无限；外部调用需 key（Authorization: Bearer 优先）且按 IP 限 50/天；CORS 收敛（不再通配 `*`） | `apiGate()` + `api_usage` 表 |
| 23 | **电极电势** | 按情形（酸性/碱性/中性/非水/固态）给出半电池反应、E° 与能斯特方程；本地 ELECTRODE 表约 210 种 + AI 兜底 | `electrode` 字段 |

---

## 三、技术架构与数据流

**单 Worker 架构**：一个 Worker 同时托管前端静态站（`assets` 绑定 `public/`）和 API（`/api/*`）。一次 `wrangler deploy` 全上。

**核心引擎是同一份代码跑两端**：`public/chem-engine.js`（解析+判定）、`public/chem-calc.js`（配平+计量）是纯 ESM，浏览器直接 `<script type="module">` 用，Worker 也 import 用。**改判定/配平逻辑只改这两个文件，两端同时生效。**

**请求流**：
- 前端优先调 `/api/*`；调不到（如纯静态部署）自动回退到浏览器本地引擎判定。
- `/api/check`：本地引擎 → 未命中且 `deep=1` → D1 缓存 → PubChem → Wiki → AI → 回写缓存。
- `/api/equation`：完整方程式→本地配平；只给反应物→剂量变体表→本地反应规则→（仅当走 AI 时）D1 缓存→AI。

---

## 四、项目结构与依赖

```
chem-check/
├── public/                      # 前端（也是 Worker 的静态资源目录）
│   ├── index.html               # 页面结构（检验报告单/SDS 风）
│   ├── styles.css               # 样式（暖纸色+发丝线+颗粒噪点+章戳）
│   ├── app.js                   # 前端逻辑：判定+配平计算+变体渲染+上报+电极电势渲染 (~480 行)
│   ├── chem-engine.js           # ★核心：化学式解析+存在性判定引擎+电极电势表 (ELECTRODE,~210 种)+酸根检测 (~3760 行，浏览器/Worker 共用)
│   └── chem-calc.js             # ★核心：代数配平+摩尔质量+化学计量+元素质量分数 (~220 行，含118元素原子量)
├── src/                         # Worker 端
│   ├── worker.js                # 路由 + fallback 链 + AI 提示词 + API 网关(限流/key/CORS) + 结构化返回 (~710 行)
│   ├── chem-sources.js          # PubChem / Wikipedia 客户端 (~145 行)
│   ├── chem-cache.js            # D1 缓存(永不过期) + 上报限流 + API 限流 (~122 行)
│   └── chem-reactions.js        # 本地无机反应补全 + 状态符号 + 可逆 + 剂量变体 + 双水解 (~257 行)
```

**依赖**：
- **运行时 npm 依赖：零**。全部原生 ESM，无框架、无构建步骤。
- **devDependency**：`wrangler`（实际用的是系统 `/opt/homebrew/bin/wrangler`，v4.118.0）。
- **Cloudflare 绑定**（在 `wrangler.toml`）：
  - `AI` → Workers AI，模型 `@cf/qwen/qwen3-30b-a3b-fp8`
  - `DB` → D1 数据库 `chem-check-cache`（id `8bbd002e-c105-4b9a-b46e-195dc100074f`）
  - `ASSETS` → `public/` 静态资源
  - 自定义域名 `chem-check.zztool.dpdns.org`
- **前端外部依赖**：Google Fonts（Fraunces 衬线 + IBM Plex Sans/Mono）。⚠️ 国内加载可能慢，是潜在优化点（可换国内镜像或自托管）。

**数据量**：知识库 198 种物质、ELECTRODE 电极电势表约 210 种、COLORS 颜色表 69 种、剂量变体 14 组。

---

## 五、部署与运维

```bash
cd chem-check

# 本地开发（热重载 public/）
wrangler dev --ip 127.0.0.1        # http://localhost:8787

# 部署到生产
wrangler deploy

# 实时日志
wrangler tail

# D1 数据库（首次或改 schema 后）
wrangler d1 migrations apply chem-check-cache --remote   # 生产
wrangler d1 migrations apply chem-check-cache --local    # 本地 dev

# 清方程式缓存（改引擎后若担心残留）
wrangler d1 execute chem-check-cache --remote --command "DELETE FROM formula_cache WHERE formula LIKE 'eq:%'"
```

**测试纯逻辑（无需起 dev，绕开网络坑）**：反应引擎、配平、判定都是纯 ESM，可直接用 Node 测：
```bash
node -e 'import("./src/chem-reactions.js").then(m=>console.log(m.localCompleteReaction(["CaCO3","H2SO4"])))'
```

---

## 六、⚠️ 踩过的坑（前人血泪，接手必读）

按"最可能再踩"排序。**每条都是真实犯过的错。**

### Cloudflare / Wrangler 配置类
1. **TOML 的 `[ai]` 段会吞掉后面的顶层键**。曾把 `routes` 吞进 `ai` 表导致**自定义域名整个丢失**。
   → 用内联表 `ai = { binding = "AI" }`，或数组表 `[[d1_databases]]`，别用裸 `[段]`。
2. **设了 `routes` 后 `workers.dev` 默认被禁用**。要保留备用域名需显式 `workers_dev = true`。
3. **wrangler 必须在含 `wrangler.toml` 的目录运行**，否则报 "Missing entry-point"。后台任务 shell 的 cwd 不持续，**后台启动命令里要显式 `cd`**。
4. **边缘部署后有 10~30 秒传播延迟**。测新功能前等一等，或给 URL 加缓存破坏参数（`?v=2`），否则会看到旧版本怀疑人生。

### Workers AI（qwen3-30b）类
5. **它返回的是 OpenAI `chat.completion` 格式**，文本在 `choices[0].message.content`。我最初取 `res.response`（是个对象），`String()` 后变 `"[object Object]"`，JSON 提取直接失败。→ `runAI` 已做多路径兼容，别改回单一路径。
6. **该模型不支持 `response_format:{type:"json_object"}`，会抛错**。→ 用纯文本输出 + `extractJSON` 提取（能接受被前导/尾随文本包着的 JSON）。
7. **务必关推理（thinking）**：`enable_thinking:false` 或提示词加 `/no_think`。否则本地 dev 曾跑到 150 秒；关了之后 edge 2~5 秒。
8. **边缘 AI 冷启动偶发失败**。→ `aiJudgeSubstance` 里加了一次重试，明显改善。别随便去掉。

### 网络/本地环境类（国内开发特有）
9. **本地 dev 现在起不来**：`env.AI` 是 remote 模式，经本地代理无法建立 remote preview session，导致整个 `wrangler dev` 起不来。→ **纯逻辑用 Node 直接测**（见上），联网功能以**生产 edge 为准**。
10. **本地 dev 下 Wikipedia 被墙超时、AI 走代理极慢**，但 **PubChem 经代理可用**（202 ListKey 轮询正常）。所以联网 fallback 链本地测不全，别在本地纠结，直接看线上。
11. **curl 要走对代理**：本机 curl localhost 需 `--noproxy '*'`（环境有代理变量）；但 `workers.dev` 经本地代理反而不通，**自定义域名 `zztool.dpdns.org` 反而能 curl**（疑为透明代理按 SNI 处理差异）。
12. **shell 里 `&` 后台起的进程会被工具回收**。长跑的 dev server 要用工具的 `run_in_background`，别用 `&`。

### 化学逻辑类
13. **单质曾被误判"不存在"**：规则引擎假定 H 恒为 +1，导致 `H2`/`O2`/`Fe` 电中性校验失败。→ `ruleCheck` 已加**单质分支**（0 价单质天然电中性）。改规则时注意别回归。
14. **中文名可信过滤不能少**：`CaCl2` 曾从维基误命中列表页，返回"极度危险物质列表"当名字。→ `firstTrust` 会剔除"XX列表/索引/消歧义"及英文句子/全大写串。
15. **方程式结果只缓存 AI 补全**：配平/本地规则/剂量变体是本地即时计算，**不缓存**。曾因缓存了 `N2+H2=NH3` 里 H2 的误判（修复前的 bug 值）导致修了 bug 还显示旧错。→ 引擎逻辑更新后，若有疑虑清一次 `eq:` 缓存。
16. **`buildWarnings` 曾返回嵌套数组**导致前端渲染异常。→ 现在必须是扁平字符串数组，改它时注意。
17. **剂量变体只写物种、系数交给配平器**：变体表里的 `left`/`right` 只列化学式，系数由 `balanceEquation` 算，这样保证原子守恒、不会手写出不守恒的方程式。

### API 网关与结构化返回类
18. **`apiGate` 是 async 函数，调用处必须 `await`**。曾漏写 `await`，导致 `gate` 是 Promise、`gate.denied` 恒为 `undefined`（falsy），外部调用绕过了 key 校验和限流。→ `const gate = await apiGate(request, env, url)`，别漏 await。
19. **`normalizeResult` 把 `tags` 改名 `hazards` 后，前端必须同步改**。曾只改后端没改前端，导致 hazards 区域不显示。→ `normalizeResult` 输出 `hazards`（从 `res.tags` 取值），前端 `renderReport` 要读 `res.hazards` 而非 `res.tags`。同理 `handleReport` 返回的 `result` 也要过 `normalizeResult`，否则上报刷新后前端拿到的还是旧 schema。
20. **AI prompt 要求所有字段必现（含空数组）**。曾只描述"colors/redox/solubility"但 AI 偶尔省略字段，导致 `normalizeResult` 收到 `undefined`。→ prompt 里明确写"所有字段必须出现，即使为空数组 []，也不得省略"，并附正确示例（CuSO4）和错误示例（"× 省略 colors/redox/solubility/electrode 字段"），降低 AI 漏字段概率。新增字段（如 electrode）要同时改：prompt JSON 结构 + 字段规则 + 解析器 + normalizeResult + 前端渲染，五处缺一不可。
21. **wrangler OAuth token 会过期且 refresh_token 可能同时失效**。在非交互环境（如 CI/沙箱）无法 `wrangler login`。→ 需设 `CLOUDFLARE_API_TOKEN` 环境变量，或交互式 `wrangler login`。token 过期时 `wrangler whoami` 报 "auth token has expired"。
22. **CORS 原先是通配 `*`**，任何站点都能跨域读 API 且无需 key。→ 已收敛为 `applyCors`：同源不加 CORS 头；跨域必须带有效 key 才回显来源（未授权响应不设 CORS，浏览器读不到）；`OPTIONS` 预检单独处理（允许 Authorization/X-Api-Key 头）。改 CORS 时注意"未提供 key"的 401 与"key 无效"的 403 的 authorized 参数不同（前者 false、后者 true），否则失败响应可能被浏览器读取。
23. **在 chem-engine.js 大段插入数据表时，误删了 `export const COLORS = {` 声明头**，导致 COLORS 内容成了孤儿对象、模块整体 SyntaxError。→ 在巨型对象之间插表后务必 `node --check` + 实际 import 验证模块可加载，并检查新表与既有表（KNOWNS/COLORS）的声明头、闭合 `};` 是否齐全。另：ELECTRODE 新表插入在 COLORS 之前，属"新增数据表放独立导出对象"（不动 KNOWNS/COLORS 键）以保零回归。

---

## 七、🔑 需要注意的点（运维/合规/成本）

- **凭证安全**：仓库**不含任何密钥**。`wrangler.toml` 里的 `database_id` 是标识符（非密钥，别人拿到也无法访问，仍需你的账号授权）。真正的登录态在 `wrangler login` 的本地凭证里，**不要提交 `.dev.vars`/`.env`/`.wrangler/`**（已在 `.gitignore`）。
- **AI 成本**：Workers AI 按用量计费（神经元）。已做的成本控制：① 本地规则优先，AI 兜底；② 只缓存 AI 结果，命中缓存不调 AI；③ 关 thinking 减少 token。若要进一步省，可给 AI 判定也加更激进的缓存。
- **内容合规**：化学内容含剧毒/爆炸/腐蚀信息，属教育用途。**README 和页面底部的免责声明别删**。面向国内大众时保留"安全提示"。
- **国内访问**：Cloudflare 默认境外节点，大陆访问慢属正常（非故障）。要加速需 EdgeOne/DNSPod 回源或 China Network（需 ICP 备案）。详见 README「国内部署注意事项」。
- **D1 缓存永不过期**（`STALE_MS=Infinity`）：联网结果一旦缓存不再过期，避免重复付费联网；仅上报标记有误时强制重查覆盖。**改判定逻辑后旧缓存不会自动失效**——必要时候手动清缓存。
- **限流规则**：上报接口每设备每日 ≤20 次、单化学式每日 ≤3 次，超限返回 429。设备指纹 = IP+UA 的 djb2 哈希（无 `did` 时）。外部 API 调用每 IP 每日 ≤50 次（同源网页查询不计）；需配置 `wrangler secret put API_KEYS`（逗号分隔多个 key），**外部调用用请求头传 key（`Authorization: Bearer <key>` 或 `X-Api-Key`），`?key=` 仅作旧版兼容兜底**。

---

## 八、当前进度（截至 2026-08-12）

**已完成并生产验证通过**：
- ✅ 去 AI 味的 SDS/检验报告单 UI（暖纸色+章戳+噪点，已上线）
- ✅ 多级 fallback 判定链（知识库→规则→D1→PubChem→Wiki→AI）
- ✅ 方程式配平（含氧化还原）、反应补全、化学计量计算
- ✅ 状态符号 ↓/↑、可逆 ⇌、剂量变体（14 组，含分步+总反应）
- ✅ 物质颜色/形态（约 40 种 + AI 补充）、物种存在性校验
- ✅ D1 缓存 + 上报限流、GitHub 开源（GPLv3）
- ✅ **双水解反应**（Al³⁺/Fe³⁺ 配 S²⁻/CO₃²⁻/HCO₃⁻/AlO₂⁻/SiO₃²⁻，Fe³⁺+S²⁻ 排除走氧化还原）
- ✅ **元素质量分数表**（compositionMassPct，含进度条可视化）
- ✅ **酸根结构识别**（detectRadical，16 种含氧酸根，借鉴 Formula.zip analyzer 设计）
- ✅ **待核实（WAITING）状态**（未收录式联网判定期间虚线章戳+脉冲动画）
- ✅ **深色/浅色主题 + 中英双语切换**（data-theme/data-lang，localStorage 持久化）
- ✅ **统一结构化返回**（normalizeResult：所有字段必现，缺失填 `[]`/`null`；`tags` 改名 `hazards`）
- ✅ **AI prompt 修缮**（redox/colors.ion/solubility/hazards/electrode 全部必填；附 JSON schema + 正确示例 + 错误示例；max_tokens 提至 2400）
- ✅ **氧化/还原性分类**（redox：按条件分类讨论，如水中 vs 酸性 vs 置换反应）
- ✅ **溶解度分类**（solubility：按溶剂分类，含具体数值）
- ✅ **颜色显色来源**（colors 增加 `ion` 字段，如 CuCl₂ 溶液蓝因 Cu²⁺ 水合为 [Cu(H₂O)₄]²⁺）
- ✅ **API 网关与限流**（同源网页免费无限；外部需 API key 且 IP 限 50/天；api_usage 表计数）
- ✅ **完整 API 调用教程**（README：限流规则 + key 配置 + 统一响应结构 + 调用示例 + 错误响应）
- ✅ **API key 改请求头传递 + CORS 收敛**（Authorization: Bearer 优先 / X-Api-Key；`?key=` 仅兼容兜底；CORS 不再通配 `*`，跨域已授权才回显来源；OPTIONS 预检 204）
- ✅ **化学式判定规则增强**（#2：金属氢化物/硼烷/硅烷 H 取 −1（isHydrideH）；变价元素混合价整数组合（mixedValenceCheck）；新旧引擎全量 280+ 物质回归：22 处修复、0 处回归。修复如 LiH/NaH/KH/CaH2/AlH3/B2H6/SiH4/NaBH4/LiAlH4/Mn3O4/Co3O4/Fe3O4/Pb3O4/LiMn2O4/Pr6O11/Tb4O7/U3O8）
- ✅ **wrangler 依赖锁版本**（#7：package.json `^3.0.0`→`^4.118.0`，新增 package-lock.json，实际解析 wrangler 4.121.0）
- ✅ **Formula.zip 净化**（删除 __MACOSX/.DS_Store；wrangler.jsonc 的 database_id 脱敏为占位符、移除自定义域名段；保留 worker-configuration.d.ts）
- ✅ **电极电势栏目**（#8：本地 ELECTRODE 表约 210 种双语数据（半电池反应/E°/能斯特方程/条件说明），全覆盖 KNOWNS；analyze 返回 electrode、normalizeResult 补字段、AI prompt 加 electrode 必填、前端渲染表格（无数据写"无"）；配套 CSS）。**过程中清理了 ELECTRODE 表 23 个重复键（235→212）**——历史遗留的尾部追加与先出现条目键名重复，保留"末次出现"（即 JS 对象实际生效值）删除先出现，行为零变化。
- ✅ 生产实测：`AgOH`(知识库)、`CaCl2`(PubChem)、`K2FeO4`(PubChem+AI/高铁酸钾)、`Na2FeO4`(纯AI/高铁酸钠)、`CaCO3+H2SO4`(复分解+CO2↑)、`N2+H2⇌NH3`(可逆)、`AlCl3+Na2CO3`(双水解→2Al(OH)₃↓+3CO₂↑+6NaCl)、限流第4次被拦截，全部正确。

**已知的待改进/小瑕疵**：
- ⚠️ AI 对个别物质会"过度保守"判 uncertain（如 `XeF2`，模型能力所限，可接受）。
- ⚠️ 前端 Google Fonts 国内加载慢，未做镜像/自托管。
- ⚠️ 本地 `wrangler dev` 因 remote AI 起不来（见坑 #9），暂靠 Node 直测 + 线上验证。
- ⚠️ 语言切换后方程式结果区不自动重渲染（仅判定结果会重渲染），需重新点配平按钮。
- ⚠️ wrangler OAuth token 已过期（见坑 #21），需 `wrangler login` 或设 `CLOUDFLARE_API_TOKEN` 后重新部署。
- ⚠️ `H2OO` 等个别非标准式仍判 yes（ruleNote 提示电荷不平衡但 verdict 未降级）——既有行为，暂不处理。
- ⚠️ COLORS 颜色表仅 69 种，未覆盖全部 198 条 KNOWNS；缺颜色的条目前端该栏目为空（不影响判定）。

---

## 九、后续可能规划（TODO，按价值排序）

1. **扩充剂量变体表**：KAl(SO₄)₂、Na₂S 水解、多元弱酸分步电离、Cu 与浓/稀硝酸等。
2. **可逆反应库扩充**：酯化反应、弱电解质电离、水解平衡。
3. **物质颜色数据补全**：把 COLORS 覆盖到知识库全部 198 条（现仅 69 条）。
4. **本地反应规则扩充**：盐+盐沉淀、分解反应、化合反应，进一步减少 AI 依赖。
5. **接入开放反应数据库**（有机反应方向）：ORD(200万有机反应)、Chemotion、PubChem Reactions、Catalysis-Hub、Organic Syntheses。多为大数据集，适合离线预置或作为新的在线兜底源。详见 README「反应数据来源」。
6. **配平增强**：离子方程式、氧化还原半反应配平。
7. **前端字体优化**：Google Fonts 换国内镜像或自托管，改善国内首屏。
8. **AI 缓存优化**：给 AI 判定结果加更长的缓存，进一步降本。
9. **电极电势表扩充**：覆盖更多常见电对（有机电对、非标准态条件），并为 UNKNOWN 物质在 AI 判定时补充能斯特数据。

---

## 十、📝 文档维护约定（重要）

**`README.md`（面向用户）与 `HANDOFF.md`（本文，面向开发者）必须随每次开发同步更新。**

具体要求：
- **新增/修改功能** → 更新 README 的功能清单、API 用法；更新 HANDOFF 的功能表、当前进度。
- **改了架构/目录/依赖/部署方式** → 更新两份文档的对应章节。
- **踩了新坑、犯了新错** → **必须记到 HANDOFF 第六节「踩过的坑」**，写清"现象+根因+解法"，让下一个人不再踩。
- **做了技术选型/重要决策** → 记到 HANDOFF，并说明"为什么这么做"。
- **每次 commit 前自查**：这两份文档是否还准确？不准就顺手改。

> 原则：**代码会变，文档要跟着变；坑记一次，受益所有人。** 过期的文档比没有文档更害人。

---

*最后更新：2026-08-12 · 维护者：tgcz2011*
