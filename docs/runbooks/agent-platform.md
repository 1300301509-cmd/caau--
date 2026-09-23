# 业务智能体赛程预览与草稿确认（CAAU-049 C1）

## 已实现范围

Nest `ai` 模块使用 LangGraph.js 编排并在 PostgreSQL `caau_agent` schema 保存 checkpoint。当前 Web【比赛管理中心 → 赛程编排】提供最小对话入口，支持：

- 从当前登录账号的 `competition-events` 同等权限范围定位赛事；
- 读取最新赛程，以星期、当天序号或用户明确选择的 match ID 定位场次；
- 多个候选时返回选择项，不自动选中；
- 用 scheduling 模块的确定性校验生成修改前后、冲突、基线 revision 和 30 分钟有效期；
- 保存会话、近期 turn、摘要、当前赛事/场次、任务步骤、结构化已知条件/待补字段、候选 ID、资源 ID、基线版本、预览和 checkpoint thread；
- 使用实际业务图节点完成“鉴权与上下文 → 意图增量解析 → 赛事/场次定位 → 缺参等待 → 确定性预览 → 返回结果”，而不是用单一节点包装 service；
- 服务重启后从同一 LangGraph thread 恢复缺参状态；恢复时重新检查当前用户、历史任务涉及的赛事权限、赛程 revision 和预览有效期。

C1 在上述真实模型理解与纯预览后增加单场草稿确认。预览成功时签发一次性票据；只有当前 owner 显式确认、重新鉴权且赛程 revision 未变时，固定程序才调用现有单场调整用例。它不调用会整套重排的 `generate`，也没有 Agent 发布入口。预览过期或 revision 变化后标记为 `STALE` 并取消待确认票据，必须重新预览。

## 确认、取消与回执

票据持久绑定 actor/task/event/match、调整后的时间与场地、expectedRevision、参数摘要/哈希、`schedule.draft.adjust@v1`、服务端固定 commandId 及 30 分钟有效期。Web 卡片显示执行人、赛事、比赛、修改结果、基线版本、工具版本和到期时间，并提供“确认保存草稿”与“取消”；低权限读取身份不显示可用写操作。

确认不会再次调用模型，也不接受新时间或场地。服务在 Serializable 事务内重新鉴权并校验票据、执行 scheduling CAS、消费票据并写不可变命令回执。双击、网络重试、API 重启及提交后响应中断都使用原 commandId 和回执返回原 revision/冲突结果；不会重复增加赛程 revision。票据过期、取消、参数/event/match 不匹配或 revision 变化返回 409；撤权、跨账号和跨范围访问返回 403。保存结果始终为 `DRAFT`，发布仍是独立人工操作。

取消及重复取消都检查当前 owner 与赛事读取权限；只返回票据 ID 和 `CANCELLED` 状态，撤权后的 403 不含原赛事、球队或场地摘要。有权会话的 `lastExecution` 返回当前赛事最近一次持久执行回执（执行时间、原 commandId、当时 revision/status/冲突），不依赖浏览器内存或新任务状态。刷新、重新登录或确认响应丢失后，Web 重新读取有权会话并展示该回执；“该命令当时执行”与重新读取的“赛程当前状态”分开显示。当前状态可能已由其他命令推进，不可将历史执行结果视作当前草稿。会话撤权后连回执也不可读取。

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
- `GET /api/v1/agent/sessions/:sessionId`：恢复并重新校验会话/任务；返回当前赛事最近一条持久 `lastExecution` 或 null；有权会话列表同样携带该字段；
- `POST /api/v1/agent/sessions/:sessionId/messages`：提交消息或结构化的 event/match 选择；可带 `taskId` 继续任务，或带 `newTask=true` 显式新建任务，两者不可同时提供；
- `POST /api/v1/events/:eventId/schedule/preview-adjustment`：纯调整预览，无业务写入；
- `POST /api/v1/agent/confirmation-tickets/:ticketId/confirm`：回显 ticket 的 eventId、matchId、parameterHash 后确认单场草稿调整；
- `POST /api/v1/agent/confirmation-tickets/:ticketId/cancel`：当前 owner 且赛事仍可读时取消/重复取消；仅返回 `{id,state}`。

前端只通过生成的 `@caau/api-client` 调用这些接口。小程序继续复用同一 API 的方案不变，但本批未增加小程序入口。

## 模型配置

无模型凭据时，服务使用确定性模拟解析器支持固定中文验收表达，用于本地和 CI 业务链路测试；这不等于真实模型接入通过。千问使用服务端 OpenAI 兼容适配：

```sh
CAAU_QWEN_API_KEY=...                 # 仅放服务端忽略的环境文件
CAAU_QWEN_MODEL=qwen-plus             # 可选，默认 qwen-plus
CAAU_QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 # 可选
```

不要把密钥放在前端、数据库、checkpoint、日志、提交或聊天中。模型状态接口和总部 Web 只返回 `SIMULATED/QWEN`、模型名称、Base URL 主机、是否配置凭据，以及当前 API 进程内最近一次脱敏连接测试结果；永不返回 API Key、完整供应商响应或请求头。连接测试只在总部超级管理员明确点击时执行，进程重启后结果恢复为“尚未测试”。设置 `CAAU_QWEN_API_KEY` 后模型异常返回 503，不降级为可能改变理解结果的静默模拟；模型异常不会签发新票据或写赛程。模型只参与确认前的理解，确认执行完全由固定程序完成；原赛程页面仍可使用。

千问结构化 schema 对来源星期、来源当天序号、目标星期、明确日期、北京时间小时/分钟和相对分钟偏移分别提供字段说明。系统提示明确区分“来源比赛在哪一天的第几场”和“目标改到哪一天几点”，只提取本轮新增或修改，不选择赛事、不执行修改。

### 真实千问手工意图验收

该命令不在默认 `check`、`test` 或 CI 中，不连接业务数据库。凭据只通过当前进程环境或忽略文件 `.local/agent/qwen.env` 提供；不要把文件内容打印到终端或提交：

```sh
chmod 600 .local/agent/qwen.env
corepack pnpm agent:qwen:test
```

脚本仅输出安全模型元数据和结构化意图字段，覆盖：

- “把周六第二场比赛改到周日十点”；
- “将星期六的第2场比赛调整到星期日上午10点”；
- “把周六第二场移到周日”→“上午十点”→“再晚半小时”；
- “换成周六第三场”；
- “改到2027-06-08上午十点”。

缺少凭据时命令以状态 2 退出，不回退到模拟模型；供应商调用失败时只输出脱敏失败信息。它只验收真实模型意图提取，不代表业务 API、数据库预览、浏览器或生产环境通过。

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

数据库浏览器套件默认使用 3000。若该端口承载不能中断的本仓库 API，可让测试构建和所有浏览器夹具共同使用另一空闲端口，例如：

```sh
CAAU_BROWSER_API_PORT=3100 \
VITE_API_BASE_URL=http://127.0.0.1:3100 \
corepack pnpm db:test
```

这只改变隔离测试服务，不重用或修改 3000 上的进程。真实模型、模拟模型、浏览器、小程序和真机必须分别报告；数据库浏览器回归不等于真实模型、小程序或真机验收。
