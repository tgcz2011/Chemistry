# Requirements Document — API 控制台与额度自助（api-console-and-usage）

## Introduction

chem-check 当前的外部 API 调用需手工配置静态 key（`wrangler secret put API_KEYS`），访客获取低效；同时缺少统一的管理与统计视图。本需求将：

1. 把外部 API 鉴权从「静态 key」简化为「按 IP 计算额度」（同 IP 每日 50 次，无需 key），使外部调用零门槛。
2. 提供公开额度查询页 `/usage`，展示当前 IP 的今日已用/剩余/重置时间。
3. 提供仅站长可访问的管理控制台（`/console`），统一查看化学数据规模、调用统计（API/物质查询/上报纠错/调用目的地）与 API 配置管理。

## Glossary

- **系统（System）**：chem-check Worker + 前端静态站 + D1 数据库整体。
- **站长（Owner）**：部署并运维本系统的人，持有控制台密码。
- **普通访客（Visitor）**：使用网页查询或外部调用 API 的任何用户。
- **同源调用（Same-Origin Call）**：来自前端页面自身（`chem-check.zztool.dpdns.org`）的查询，免费无限。
- **外部调用（External Call）**：来自其他域/命令行/脚本的 `/api/*` 请求。
- **额度（Quota）**：单个 IP 在单个自然日内可发起的外部 API 调用次数上限（默认 50）。
- **API key**：旧的静态密钥机制，本需求将其废止。

## Requirements

### Requirement 1：外部调用按 IP 自助计算额度

**User Story:** AS 普通访客, I want 无需提前申请 key 即可调用 API, so that 接入成本为零、调用即得。

#### Acceptance Criteria

1. WHEN 任意来源向 `/api/check|report|equation` 发起外部调用，系统 SHALL 依据请求 IP 当日累计次数判定是否放行。
2. WHEN 外部调用当日累计次数未达 50 次，系统 SHALL 放行请求并递增该 IP 当日计数。
3. WHEN 外部调用当日累计次数已达 50 次，系统 SHALL 返回 HTTP 429 及 `X-RateLimit-*` 响应头，且响应包含已用/上限/重置时间。
4. WHILE 请求来自同源页面，系统 SHALL 直接放行且不写入外部调用计数。
5. 系统 SHALL 不再校验任何 API key（废止 `API_KEYS` secret 校验逻辑）。

### Requirement 2：公开额度查询页

**User Story:** AS 普通访客, I want 查看自己 IP 的剩余额度, so that 我可预估当天还能调用多少次。

#### Acceptance Criteria

1. WHEN 访客访问 `/usage`，系统 SHALL 展示当前请求 IP 的今日已用次数、剩余次数、每日上限与重置时间。
2. WHEN 访客访问 `GET /api/usage`（同源或外部），系统 SHALL 返回含 `ip/used/limit/remaining/reset` 的 JSON。
3. 系统 SHALL 以中英双语呈现 `/usage` 页面（遵循现有 `chem_lang` 语言偏好）。
4. 系统 SHALL 不在 `/usage` 页面要求任何凭据。

### Requirement 3：站长控制台登录

**User Story:** AS 站长, I want 通过密码登录控制台, so that 统计数据与管理功能仅本人可见。

#### Acceptance Criteria

1. WHEN 站长访问 `/console` 且未持有有效会话，系统 SHALL 展示密码登录表单。
2. WHEN 站长提交与 `CONSOLE_PASSWORD`（secret）一致的密码，系统 SHALL 发放会话凭据并进入控制台。
3. WHEN 密码不正确，系统 SHALL 返回登录失败提示且不发放会话。
4. WHILE 站长持有有效会话，系统 SHALL 允许访问控制台页面与 `/api/console/*` 接口。
5. 系统 SHALL 不通过 URL 查询串传递会话凭据。
6. 控制台后端接口统一走 `/api/console/*` 前缀路由（独立于外部调用限流，不受 50 次/天/IP 限制），控制台页面路径为 `/console`。

### Requirement 4：控制台统计总览

**User Story:** AS 站长, I want 在控制台查看运行总览, so that 我能一眼掌握系统健康与用量。

#### Acceptance Criteria

1. WHEN 站长进入控制台首页，系统 SHALL 展示汇总卡片：今日外部调用数、D1 缓存条目数、今日上报纠错数、累计外部调用数。
2. 系统 SHALL 展示近 7 日外部调用趋势（按日期聚合）。
3. 系统 SHALL 不统计同源网页查询次数（`api_usage` 仅记录外部调用，与现有限流口径一致）。

### Requirement 5：API 调用目的地统计

**User Story:** AS 站长, I want 了解外部调用来自哪里, so that 我能判断 API 的受众与潜在滥用。

#### Acceptance Criteria

1. 系统 SHALL 记录每次外部调用的 Referer/Origin、地域（CF 请求头）、User-Agent 摘要。
2. WHEN 站长请求调用目的地统计，系统 SHALL 按 Referer 域名、地域、UA 三组分别聚合 TOP 列表（按调用次数降序）。

### Requirement 6：物质查询统计

**User Story:** AS 站长, I want 查看哪些化学式被查询最多, so that 我能优先扩充本地知识库覆盖。

#### Acceptance Criteria

1. WHEN 站长请求物质查询统计，系统 SHALL 返回 D1 `formula_cache` 中被缓存条目的 TOP 化学式（按更新时间/命中次数维度）。
2. 系统 SHALL 返回本地知识库（KNOWNS/COLORS/ELECTRODE 等）的条目数规模。

### Requirement 7：上报纠错统计

**User Story:** AS 站长, I want 查看用户纠错上报情况, so that 我能定位频繁被纠错的化学式并修复知识库。

#### Acceptance Criteria

1. WHEN 站长请求上报统计，系统 SHALL 返回按化学式聚合的上报次数 TOP 列表。
2. 系统 SHALL 展示今日/累计上报总数。

### Requirement 8：API 配置管理

**User Story:** AS 站长, I want 在控制台查看与理解当前 API 限流配置, so that 我能调整部署参数。

#### Acceptance Criteria

1. WHEN 站长查看 API 管理区块，系统 SHALL 展示当前每日每 IP 上限（默认 50）及控制台密码状态（已配置/未配置）。
2. 系统 SHALL 提供清晰指引说明限流参数的调整方式（环境变量/secret）。

## Non-Goals

- 本版本不做用户注册、多租户、付费订阅、key 生成/撤销界面（key 机制已废止）。
- 本版本不提供通过控制台直接编辑 D1 数据的写操作（仅查看）。
- 本版本不做 Cloudflare Access 集成（当前选型为 `CONSOLE_PASSWORD` 密码登录）。
