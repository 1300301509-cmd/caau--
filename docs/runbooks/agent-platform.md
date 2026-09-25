# 业务智能体：自由对话与单场草稿确认（CAAU-049/059/060）

## 已实现范围

Nest `ai` 模块使用 LangGraph.js 编排并在 PostgreSQL `caau_agent` schema 保存 checkpoint。Web 已登录业务页的固定“CAAU 智能助手”浮动入口打开同一 Drawer；小程序多个已登录业务页的浮动入口打开同一独立对话页（登录页与健康诊断页没有入口）。两端共用现有 API 和各自的会话/任务状态，不另建模型系统，支持：

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

`AgentSession` / `AgentTurn` 保存原始对话、`currentEventId` 和 `currentMatchId`。模型使用最多最近 30 条未压缩消息的带标记节选；更早的消息滚动生成 `contextSummary`，并以 `summarizedThroughSequence` 记录来源边界。原始消息不因摘要而删除；模型失败保留旧摘要和消息，不阻断本轮对话。摘要可能遗漏细节，不能成为业务规则或执行依据。关键定位参数始终在结构化任务字段。每次读取会话、生成摘要和送模型前都重新鉴权；撤权后接口返回 403，不返回旧 turn、摘要或预览。

### L2 任务记忆（已实现）

`AgentTask` 保存 owner、目标、步骤、event/match ID、逐字段合并的 `parameters`、`pendingFields`、候选 ID、baseline revision、任务 revision、预览 JSON、有效期和 `checkpointThreadId`。同一任务的后续补参和调整复用同一个 task/thread；请求带 `taskId` 时明确继续，`newTask=true` 时明确新建，切换到另一赛事也自动新建并清空旧条件。省略的字段不会覆盖已有有效条件，例如“移到周日”→“上午十点”→“再晚半小时”形成 10:30 的同一任务预览。来源星期或序号变化会清除旧 `sourceMatchId` 并重新定位；明确日期与目标星期互斥，后说的字段覆盖前者；绝对日期/星期/时间变化清除派生的 `targetStartAt`。相对时间跨日或跨周时按北京时间推进完整日期，并清除已不再适用的星期锚点。

LangGraph checkpoint 只保存结构化流程/资源/版本状态，不保存 Cookie、Bearer token、供应商密钥或用户消息原文。checkpoint 不是业务事实来源；每次消息在模型收到结构化历史前先校验会话 owner、当前身份及会话历史任务涉及的赛事权限，赛事读取和纯预览前再次鉴权。同一任务并发请求使用任务 revision 比较，冲突请求返回 409，不静默覆盖条件。

### L3 长期记忆（个人偏好已实现）

`AgentMemory` 现保存本人明确确认的个人偏好（回答方式或一般排赛倾向），最多 30 条、每条 300 字。Web 与小程序对话设置可以添加、查看和删除；“请记住：回答……”只会提出建议，用户点击“保存这条记忆”才生效。新对话只继承本人未删除的偏好，不继承旧会话/任务。偏好可用于回答和方案讨论，不能自动变成赛事规则、排赛约束、执行权限或业务默认参数。账号撤销、跨账号访问和删除后再调用模型均受当前身份/状态约束。知识表与向量库仍未建设；未来资料检索必须有来源、版本及权限范围。技术决策见 [ADR-0028](../adr/0028-agent-three-level-memory.md)。

## API

- `GET /api/v1/agent/model-status`：仅总部超级管理员读取安全模型状态；
- `POST /api/v1/agent/model-status/test`：仅总部超级管理员显式执行连接测试；
- `POST /api/v1/agent/sessions`：创建绑定当前用户的会话，可带当前 `eventId`；
- `GET /api/v1/agent/sessions`：列出当前仍有权恢复的会话；
- `GET /api/v1/agent/sessions/:sessionId`：恢复并重新校验会话/任务；返回当前赛事最近一条持久 `lastExecution` 或 null；有权会话列表同样携带该字段；
- `POST /api/v1/agent/sessions/:sessionId/messages`：提交消息或结构化的 event/match/team 选择；可带 `taskId` 继续单场任务，或带 `newTask=true` 显式新建任务，两者不可同时提供；修改排程需求单带本会话 `planningId`、当前 `planningRevision`，同名参赛记录候选带 `teamId`；
- `POST /api/v1/events/:eventId/schedule/preview-adjustment`：纯调整预览，无业务写入；
- `POST /api/v1/agent/planning-requests/:planningId/confirm`：仅提交 `{expectedRevision}` 人工确认排程**需求**，绝不生成/保存赛程，不签发单场执行票据；
- `POST /api/v1/agent/planning-requests/:planningId/candidates`：提交已确认 `expectedRevision`、`baselineRevision`、`format=ROUND_ROBIN`、明确 `configSource`（EVENT_SCHEDULE 或 EXPLICIT）、完整配置和明确固定场次数组；只计算并独立存候选快照，不写赛程；
- `GET /api/v1/agent/planning-requests/:planningId/candidates/latest` 和 `.../:candidateId`：逐次鉴权/检查需求、基础赛程和参赛快照；无候选 404、失效返回 `STALE`，不允许执行；
- `POST /api/v1/agent/confirmation-tickets/:ticketId/confirm`：回显 ticket 的 eventId、matchId、parameterHash 后确认单场草稿调整；
- `POST /api/v1/agent/confirmation-tickets/:ticketId/cancel`：当前 owner 且赛事仍可读时取消/重复取消；仅返回 `{id,state}`。

前端只通过生成的 `@caau/api-client` 调用这些接口。业务页传入的 `event` 仅是页面提示：无明确选择时不默认选第一场；恢复中的 task.eventId 优先于页面事件，跨赛事须明确从有权赛事列表切换对话；“新任务”创建独立的持久会话，旧预览和票据仅可从有权历史对话明确找回，不随新任务复制。小程序的返回/最小化保留未发送输入和当前对话于本次登录内存，重新打开重新读取服务器会话；关闭不调用取消或确认。登录身份/票据 epoch 改变和撤权后清理内存；后端仍逐次重新鉴权。会话 `turns` 只显示数据库近期历史，旧候选在刷新后须重新发描述，不用模型推断来补选。CAAU-060 后，未支持的跨模块/整套重排/发布请求由服务端路由为说明能力边界的对话（同时有防止模型误路由进排赛工具的程序约束），只保存 turn，不创建 `FAILED` 业务任务、预览、确认票据或赛程版本；仍不代表提供其它业务工具。

## 授权赛程查询（CAAU-062）

普通聊天专项：在已按数据库手册准备本地隔离 test 服务并完成 API 构建后，运行 `CAAU_CHAT_ONLY=1 CAAU_DATABASE_INTEGRATION=test node --env-file=apps/api/.env --env-file=.local/db/test.env scripts/qwen-planning.manual.mjs`。该显式真实模型测试验证无赛事自我介绍、通用问答/追问、任务中插话和消息恢复；只创建并清理自身临时合成库，不访问开发库，不自动回退模拟模型。普通日志不记录用户原文；该模式只显示脚本内合成提问的回答供人工质量复核，不能将一次通过外推为供应商长期稳定或 Web/微信运行时验收。

全局助手先在当前身份下路由：普通聊天不读赛程；“查这周赛事比赛”“查 2027-06-05 第二场详情”“刚才那场的场地”走只读 `schedule.list`／`schedule.match`，明确“把刚才那场改到……”才可转为新单场预览。服务端闭合注册表、结构化参数校验与 `schedule.read` 的事务读取，不允许模型选写工具、执行 SQL 或执行确认。回答显示赛事、北京时间日期、草稿／已发布和 V 版本，未生成／零结果不推断球队有空；缺赛事和歧义显示候选，页面当前赛事仅作提示、活动任务赛事优先。多条结果只列前五场并提示缩小范围。查询结果来源（eventId、revision、status、所展示 matchIds 与唯一引用 matchId）写入助手 turn 的结构化字段；历史读取和模型上下文必须对**所有**查询来源重新鉴权，撤权后无任务会话同样不可恢复。赛程版本在读写结果之间变化时 409 重新查询；不覆盖用户工作或重用旧预览。详细边界：[ADR 0024](../adr/0024-agent-readonly-schedule-tools.md)。

隔离 `CAAU_BROWSER_API_PORT=3100 VITE_API_BASE_URL=http://127.0.0.1:3100 corepack pnpm db:test` 验证模拟模型、真实 API 与 Web 浏览器；真实 Qwen 手工专项 `CAAU_DATABASE_INTEGRATION=test node --env-file=apps/api/.env --env-file=.local/db/test.env scripts/qwen-browser.manual.mjs` 只操作隔离临时合成库并清理，切勿将凭据或原文输出到公共日志。二者不代替微信开发者工具、真机及远程环境。不主动终止已有 Studio 进程；可只读核验 `/assistants/{id}/graph` 是否已热加载查询节点。本机现有 2024 Studio 返回三个查询节点，但这不代表官方页面登录后已手动执行新分支。重启仅按 [Studio 手册](agent-studio.md) 使用独立临时库，不动开发库或其它进程。

## 独立排程需求单（CAAU-063）

统一助手支持明确“收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07”→“D 队只能周三”→“改成周三和周五”→“取消 D 队时间限制”→“希望 A 队和 B 队尽量交手”。这些是**演示文本**，不能推导真实赛程规则或赛事日期。仅当前有赛事操作权限的 owner 可创建/修改/确认；服务端以 active EventTeam 识别球队、以具体日期记录星期条件，标记 MUST/PREFER、原 USER turn 来源和 PENDING/CONFIRMED 状态。日期/球队/“优先对阵”不明确时澄清，不猜测完整条件；无日期时先存待补描述，补日期后将两条来源关联。同名参赛球队选择 `teamId`；普通闲聊、已有赛程查询和单场改期原任务不受影响。

每次带最新 `planningId` + `planningRevision` 编辑，409 时刷新同一有权会话并重新核对条件，不能静默重试旧修改。`planningRequest` 返回赛事、revision、原话 `sourceTurns`、条件、待补与冲突；确认按钮仅在有明确条件且无待补/矛盾时启用。人工确认只冻结需求的当前 revision：**不**调用赛程生成/调整、不签发票据、不新增草稿或发布。后续修订令旧确认失效；参赛记录停用后即使历史曾确认，当前视图标 `STALE`，要移除无效条件再重新确认。恢复会话及送模型前扫描所有历史规划来源按**当前**权限鉴权，撤权后 403/会话列表隐藏；`sourceTurns` 只在该会话/身份下返回。业务规则与技术边界见[规格](../product/agent-schedule-planning.md)及[ADR 0025](../adr/0025-agent-planning-requirement-revisions.md)。Studio 共用业务分支 `plan_requirements → save_requirements`，无规划执行节点；运行中的独立 Studio 不需为新增 UI 强行停止或清理临时库。

隔离真实 Qwen 专项与既有单场 Web 专项**分别**运行；先确认本机 test 服务与构建 API 可用，不输出或提交 env 内容：

```sh
CAAU_DATABASE_INTEGRATION=test node --env-file=apps/api/.env --env-file=.local/db/test.env scripts/qwen-planning.manual.mjs
```

该脚本仅创建并清理本轮随机 `caau_qwen_plan_*` 合成库。默认模式仍核对 CAAU-063 日期→参赛时段→替换→取消→对阵偏好→独立确认，随后另一个独立需求单验证 CAAU-064 候选；指定 `CAAU_CANDIDATE_ONLY=1` 时只测两轮真实模型日期/球队时段→确认→纯程序候选，适合独立分层验收。两种模式都核对 0 正式赛程版本/票据/单场任务增长；供应商失败保持失败，不用模拟结果冒充。小程序编译/Node 替身不算微信开发者工具 `wx.request` 或真机验收。

## 整套候选赛程预览（CAAU-064）

已确认的规划需求卡下新增**单独的“仅生成候选预览，不保存赛程”**入口。Web/小程序逐项核对全部有效参赛队、完整赛事日期和每天时段、场地、每场时长/场地缓冲/球队最短休息及配置来源；沿用已有赛程配置时如与确认需求冲突，不会自动覆盖，须显式提供全部配置。已有赛程需选择明确固定范围（可以明确空集）；过去已开始的时间或有本版本工作人员安排的场次必固定，已发布/淘汰赛基线从严拒绝。仅单循环：每队两两交手一次；没有明确日期/轮次含义的“希望这两队交手”在单循环必然发生，须先澄清或修订，不以它声称优化成功。`AVAILABLE` 不暗示其它日子禁止；若标 MUST 仍只表示“可在”，需先修订为明确 ONLY/BLOCK 或 PREFER，不能当成已验证的硬安排约束；ONLY/BLOCK 的 MUST 不可放宽。搜索与独立校验分开，FOUND/PROVEN_CONFLICT/SEARCH_LIMIT 不能混用，偏好逐条报告。候选含北京时间整周对阵与新旧时间场地差异、快照/失效标志；需求、基础版本、参赛或人员配置变更后旧结果只作 STALE 查看，恢复前鉴权。不触发原 scheduling.generate() 写草稿，不产生版本/票据/回执，也没有保存/发布按钮。具体边界见[需求规格](../product/agent-schedule-candidates.md)与[ADR 0026](../adr/0026-agent-whole-schedule-candidate-preview.md)。

Studio Graph 限明确填写 candidateConfig/candidateConfigSource/candidateBaselineRevision/candidateFixedMatchIds，并在已确认需求规划 ID + revision 下以**精确消息**“生成整套候选赛程预览”进入 `generate_candidate → validate_candidate`；结果在 `candidateResult` 中，不依赖模型编排，不提供正式赛程写入节点。Studio HTTP 图可读不代表官方页面手动通过，且原已运行实例和测试临时库不应被清理。真实千问专项 `scripts/qwen-planning.manual.mjs` 后段会在**另一个合成会话**用模型理解日期+球队硬时段，再显式确认、调用纯程序候选接口并检查 0 正式版本/票据/任务增长；失败轮次不计为通过。微信工具 `wx.request`、真机及远程待分别验收。

## 自由对话与业务衔接（CAAU-060）

登录后无需先选择赛事，可直接问候、讨论赛制和排程思路；没有有权业务数据时只提供注明假设的一般建议，不联网查询或编造赛事事实。通用对话使用现有千问配置和无业务写入的 LangGraph 路由/回答子图；本地确定性适配器只供模拟回归，不算真实模型。模型结合本轮消息、当前权限下的近期 turn 和活动任务分类 `CHAT`、`CLARIFY`、`UNSUPPORTED`、`START` 或 `CONTINUE`；明确启动/继续单场改期才进入原有带 PostgreSQL checkpoint 的业务图。任务中穿插聊天只追加会话 turn，不改 `AgentTask` revision、参数、旧票据或预览。仅点击票据绑定的按钮才进入执行事务，“好的”不代替确认。

模型不负责授权。服务端在将历史 turn/预览送入模型之前重新核验会话 owner、所有历史任务的当前赛事读取权及显式传入赛事的读取权；回答阶段再核验，持久化回答前再次核验。撤权后的旧会话列表不返回、读取/发消息 403；仍可新建无赛事的空会话聊天，但旧内容不得混入新模型上下文。对无法确定是否要操作的消息先追问；明确要求整套重排、增加指定比赛、登记俱乐部等只说明不支持并可讨论思路，不创建失败业务任务。模型连接/供应商异常返回 503，不降级为模拟回复或伪成功；普通聊天不依赖赛程确定性预览工具。回答原文最多 4000 Unicode 字符（`AgentTurn.content` 为 VARCHAR(4000)，接口完整回显），超限明确返回 **502** 且不保存问答，不误报为连接失败、不静默截断。最多最近 30 条未压缩模型历史每条最多取 600 字带标记的节选；数据库原文、接口会话恢复及两端展示不截断。新写入的 USER/ASSISTANT 在一个事务里连续分配会话内唯一序号，服务端历史和恢复按此序号排序；旧时间戳并列的准确先后无法从历史数据还原。路由/意图各限 18 秒、自由回答限 45 秒，均不自动重试；两端共用客户端仅对 `sendAgentMessage` 设置 95 秒（可选摘要 18 秒 + 路由 18 秒 + 聊天 45 秒 + 服务端开销），其它接口原时限不变。失败保留输入，须先核对当前历史/票据再主动重试；不自动确认，不放宽数据库 CAS/幂等。服务端 `CAAU agent model` 诊断按阶段 `summary`/`route`/`chat`/`intent`（连接测试另为 `connection`）记录耗时、固定错误类别、可取得的供应商状态码及 Token 用量，缺失项记 null；不输出请求原文、供应商报错消息、响应体、密钥或令牌。不以三次本地通过宣称外部供应商长期稳定或真机通过。

## 模型配置

无模型凭据时，服务使用确定性模拟解析器支持固定中文验收表达，用于本地和 CI 业务链路测试；这不等于真实模型接入通过。千问使用服务端 OpenAI 兼容适配（受控 18/45 秒阶段预算及客户端 75 秒总预算；外部网络/限流仍可能失败）：

```sh
CAAU_QWEN_API_KEY=...                 # 仅放服务端忽略的环境文件
CAAU_QWEN_MODEL=qwen-plus             # 可选，默认 qwen-plus
CAAU_QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 # 可选
```

不要把密钥放在前端、数据库、checkpoint、日志、提交或聊天中。模型状态接口和总部 Web 只返回 `SIMULATED/QWEN`、模型名称、Base URL 主机、是否配置凭据，以及当前 API 进程内最近一次脱敏连接测试结果；永不返回 API Key、完整供应商响应或请求头。连接测试只在总部超级管理员明确点击时执行，进程重启后结果恢复为“尚未测试”。设置 `CAAU_QWEN_API_KEY` 后模型异常返回 503，不降级为可能改变理解结果的静默模拟；模型异常不会签发新票据或写赛程。模型只参与聊天及确认前的路由/理解，确认执行完全由固定程序完成；原赛程页面仍可使用。

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

### 真实千问自由对话与单场任务 Web 专项（显式手工执行）

先检查 3100/4173 空闲和本地隔离 Docker test 服务；`apps/api/.env` 与 `.local/db/test.env` 必须是被忽略的服务端/本机配置文件，**不得打印内容或用于开发/生产库**。按 [数据库手册](database-contract.md)准备 test 服务，不 reset：

```sh
corepack pnpm db:test:up
VITE_API_BASE_URL=http://127.0.0.1:3100 corepack pnpm build
CAAU_DATABASE_INTEGRATION=test node --env-file=apps/api/.env --env-file=.local/db/test.env scripts/qwen-browser.manual.mjs
```

脚本只在隔离 test 服务创建本次随机 `caau_qwen_*` 合成临时库，运行实际千问模型、Web 和 API；结束后仅清理本次临时库。4000 字边界与并发顺序使用隔离 API 注入模拟回答回归，真实千问脚本验收实际短回答的正常路径，**不代表真实千问曾返回 4000 字**。验收无赛事“你好/七支球队赛制”、同一对话进入单场改期、待补时间中插话再续同一任务/线程、预览前不写、明确确认后一次 DRAFT 及原命令回执恢复。它不进入默认 CI，不替代微信工具、真机、正式域名或远程环境。若模型连接或外部请求超时，记录失败，不把模拟回归记成真实通过。

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

这只改变隔离测试服务，不重用或修改 3000 上的进程。真实模型、模拟模型、浏览器、小程序和真机必须分别报告；数据库浏览器回归不等于真实模型、小程序微信运行时或真机验收。3000 被本地已有服务占用时不要停止该服务，可使用上面的隔离端口配置；若在此之后运行 Web E2E，保持同一构建 API 地址并设置 `CAAU_BROWSER_API_PORT=3100 corepack pnpm test:e2e`。不对远程数据库运行这些合成用例。
