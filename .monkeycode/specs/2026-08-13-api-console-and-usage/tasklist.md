# 实施计划：API 控制台与额度自助

- [ ] 1. 数据库迁移：新增 api_call_log 明细表
   - 新建 migrations/0003_api_call_log.sql：ip/call_date/referer/country/ua 字段 + idx_api_call_date 索引（对应设计「数据模型」）
   - 要求：幂等（CREATE TABLE IF NOT EXISTS），与 0002 风格一致

- [ ] 2. 后端：扩展 checkAndIncrApi 写入调用明细
   - 修改 src/chem-cache.js：checkAndIncrApi 增加 referer/country/ua 参数，限流通过后同批写入 api_call_log（设计「Correctness Properties」第 2 条）
   - 新增查询函数：sumApiToday/countApiLog/trendApi7d/destTopApi/formulaTopCache/reportTop 等控制台统计查询
   - [ ] 2.1 为 checkAndIncrApi 与统计查询编写 Node 单元测试
     - 用 mock D1（prepare/bind/run 返回可控行）验证：计数递增、明细同批写入、429 命中不写明细、趋势/目的地聚合正确

- [ ] 3. 后端：apiGate 废止 API key 校验
   - 修改 src/worker.js：删除 extractApiKey/validKeys 逻辑，外部调用仅按 IP 限流（设计「Architecture」关键变化）
   - 429 响应保留 X-RateLimit-* 头，不设 CORS；放行后 applyCors 回显来源

- [ ] 4. 后端：公开额度接口 GET /api/usage
   - worker.js 新增路由：返回当前 IP 的 {ip,used,limit,remaining,reset}（需求 2 AC2）
   - 同源/外部均可访问，不要求凭据

- [ ] 5. 后端：控制台会话机制（HMAC 签名 cookie）
   - 实现 signToken/verifyToken（base64url payload + HMAC_SHA256），cookie chem_console 属性 HttpOnly/SameSite=Lax/Max-Age 7 天（设计「会话机制」）
   - POST /api/console/login、POST /api/console/logout、GET /api/console/session
   - [ ] 5.1 为 signToken/verifyToken 编写 Node 单元测试
     - 验证：正确签名可解析、篡改 payload 校验失败、过期 token 拒绝、错误密码不产生 cookie

- [ ] 6. 后端：控制台统计接口 /api/console/stats/*
   - 实现 summary/trend/destinations/formulas/reports/config 六个接口（需求 4-8，设计「接口清单」）
   - 所有接口过会话校验，失败 401；未配置 CONSOLE_PASSWORD 时 login 返回 500 提示
   - [ ] 6.1 为统计接口编写集成测试
     - 用 mock D1 数据验证 summary 汇总、destinations 三组 TOP、formulas 最近更新 TOP、reports 聚合结果

- [ ] 7. 检查点：后端全链路本地验证
   - node --check 全部改动文件；curl 验证：外部限流、/api/usage、无会话 401、登录/登出、各 stats 接口结构（设计「Test Strategy」）
   - 单元测试全部通过；若有问题询问用户

- [ ] 8. 前端：公开额度页 public/usage.html
   - 双语（复用 chem_lang/chem_theme），fetch /api/usage 渲染已用/剩余/上限/重置，5 秒自动刷新（需求 2 AC1/3/4）

- [ ] 9. 前端：站长控制台 public/console.html
   - 登录表单 + 登录态后加载 5 大统计板块与 API 配置管理（需求 3-8）
   - 会话失效自动回登录态；内联脚本独立于 app.js

- [ ] 10. 前端：styles.css 追加 usage/console 样式
   - 沿用报告单风格（暖纸色/衬线/发丝线），含表格/卡片/趋势条/登录表单

- [ ] 11. 文档同步：README API 调用教程改写
   - 「获取 API key」段落改为「额度说明」（外部调用按 IP 50/天，无需 key），补充 /usage 与 /console 入口（设计 References[^1]）
   - HANDOFF.md 功能清单追加 #25、踩坑记录（如有）

- [ ] 12. 检查点：整体回归 + 页面验证
   - 预览地址人工过 /usage、/console（登录/各板块/中英/深浅主题），回归主页查询与 /docs/api
   - 全部通过后提交并推送
