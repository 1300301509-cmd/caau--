# 业务智能体赛程预览（CAAU-049 B1）

## 已实现范围

Nest `ai` 模块使用 LangGraph.js 编排并在 PostgreSQL `caau_agent` schema 保存 checkpoint。当前 Web【比赛管理中心 → 赛程编排】提供最小对话入口，支持：

- 从当前登录账号的 `competition-events` 同等权限范围定位赛事；
- 读取最新赛程，以星期、当天序号或用户明确选择的 match ID 定位场次；
- 多个候选时返回选择项，不自动选中；
- 用 scheduling 模块的确定性校验生成修改前后、冲突、基线 revision 和 30 分钟有效期；
- 保存会话、近期 turn、摘要、当前赛事/场次、任务步骤、结构化已知条件/待补字段、候选 ID、资源 ID、基线版本、预览和 checkpoint thread；
- 使用实际业务图节点完成“鉴权与上下文 → 意图增量解析 → 赛事/场次定位 → 缺参等待 → 确定性预览 → 返回结果”，而不是用单一节点包装 service；
- 服务重启后从同一 LangGraph thread 恢复缺参状态；恢复时重新检查当前用户、历史任务涉及的赛事权限、赛程 revision 和预览有效期。

本批没有赛程写工具，不调用会保存草稿的 `generate`，也不发布赛程。预览过期或 revision 变化后标记为 `STALE` 并清除响应中的旧预览；它不会自动取得未来写入授权。

## 三级记忆边界

### L1 会话记忆（已实现）

`AgentSession` / `AgentTurn` 保存最多用于恢复的近期对话、短摘要、`currentEventId` 和 `currentMatchId`。关键定位参数是结构化字段，不只存在自然语言摘要。每次读取会话都按当前 actor 重新鉴权；撤权后接口返回 403，不返回旧 turn、摘要或预览。

### L2 任务记忆（已实现）

`AgentTask` 保存 owner、目标、步骤、event/match ID、逐字段合并的 `parameters`、`pendingFields`、候选 ID、baseline revision、任务 revision、预览 JSON、有效期和 `checkpointThreadId`。同一任务的后续补参和调整复用同一个 task/thread；请求带 `taskId` 时明确继续，`newTask=true` 时明确新建，切换到另一赛事也自动新建并清空旧条件。省略的字段不会覆盖已有有效条件，例如“移到周日”→“上午十点”→“再晚半小时”形成 10:30 的同一任务预览。来源星期或序号变化会清除旧 `sourceMatchId` 并重新定位；明确日期与目标星期互斥，后说的字段覆盖前者；绝对日期/星期/时间变化清除派生的 `targetStartAt`。相对时间跨日或跨周时按北京时间推进完整日期，并清除已不再适用的星期锚点。

LangGraph checkpoint 只保存结构化流程/资源/版本状态，不保存 Cookie、Bearer token、供应商密钥或用户消息原文。checkpoint 不是业务事实来源；每次消息在模型收到结构化历史前先校验会话 owner、当前身份及会话历史任务涉及的赛事权限，赛事读取和纯预览前再次鉴权。同一任务并发请求使用任务 revision 比较，冲突请求返回 409，不静默覆盖条件。

### L3 长期记忆（仅规划）

本批不建长期偏好表、知识表或向量库。后续只有用户明确保存的偏好，以及带来源、版本和访问范围的知识，才可进入长期记忆。聊天摘要不能自动转成正式规则、排赛约束或默认业务参数。

## API

- `GET /api/v1/agent/model-status`：仅总部超级管理员读取安全模型状态；
- `POST /api/v1/agent/model-status/test`：仅总部超级管理员显式执行连接测试；
- `POST /api/v1/agent/sessions`：创建绑定当前用户的会话，可带当前 `eventId`；
- `GET /api/v1/agent/sessions`：列出当前仍有权恢复的会话；
- `GET /api/v1/agent/sessions/:sessionId`：恢复并重新校验会话/任务；
- `POST /api/v1/agent/sessions/:sessionId/messages`：提交消息或结构化的 event/match 选择；可带 `taskId` 继续任务，或带 `newTask=true` 显式新建任务，两者不可同时提供；
- `POST /api/v1/events/:eventId/schedule/preview-adjustment`：纯调整预览，无业务写入。

前端只通过生成的 `@caau/api-client` 调用这些接口。小程序继续复用同一 API 的方案不变，但本批未增加小程序入口。

## 模型配置

无模型凭据时，服务使用确定性模拟解析器支持固定中文验收表达，用于本地和 CI 业务链路测试；这不等于真实模型接入通过。千问使用服务端 OpenAI 兼容适配：

```sh
CAAU_QWEN_API_KEY=...                 # 仅放服务端忽略的环境文件
CAAU_QWEN_MODEL=qwen-plus             # 可选，默认 qwen-plus
CAAU_QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 # 可选
```

不要把密钥放在前端、数据库、checkpoint、日志、提交或聊天中。模型状态接口和总部 Web 只返回 `SIMULATED/QWEN`、模型名称、Base URL 主机、是否配置凭据，以及当前 API 进程内最近一次脱敏连接测试结果；永不返回 API Key、完整供应商响应或请求头。连接测试只在总部超级管理员明确点击时执行，进程重启后结果恢复为“尚未测试”。设置 `CAAU_QWEN_API_KEY` 后模型异常返回 503，不降级为可能改变理解结果的静默模拟；无论模型是否可用都不会写赛程，原赛程页面仍可使用。

## 启动与验证

先按[数据库手册](database-contract.md)应用迁移，禁止 reset：

```sh
corepack pnpm db:up
corepack pnpm db:migrate:deploy
corepack pnpm db:api
corepack pnpm dev:admin
```

隔离验收：

```sh
corepack pnpm contract:check
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm db:test
```

真实模型、模拟模型、浏览器、小程序和真机必须分别报告。浏览器源码构建或既有 scheduling 浏览器回归不等于真实模型、小程序或真机验收。
