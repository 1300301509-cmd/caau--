# 独立 LangSmith Studio 工作台

任务：CAAU-061，扩展 CAAU-062/063/064；设计见 [ADR-0023](../adr/0023-independent-agent-studio.md)、[ADR-0025](../adr/0025-agent-planning-requirement-revisions.md) 和 [ADR-0026](../adr/0026-agent-whole-schedule-candidate-preview.md)。不嵌入 CAAU Web。

## 启动

在仓库根目录、官方 Node 24.20.0 下运行：

```sh
export PATH="$PWD/.local/toolchain/node-v24.20.0-darwin-arm64/bin:$PATH"
corepack pnpm install --frozen-lockfile
corepack pnpm db:test:up
corepack pnpm agent:studio
```

需要 Docker 本地 test 服务、忽略的 `.local/db/test.env` 和 `apps/api/.env` 中已有的 `CAAU_QWEN_*` 配置。不会读取开发库配置；仅复制千问配置到子进程环境。不需要填写 LangSmith API Key。首次使用官方网页可能需要登录或注册 LangSmith，由本人完成。

打开 [Studio](https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024)。本地 API 是 `http://127.0.0.1:2024`，选择 `caau_agent` 和 **Graph** 模式。浏览器如询问是否允许官方页面访问本地网络，请本人核对并允许连接此本机服务。保持启动终端运行。

此命令创建全新的合成测试库，日期为 **2027-06-05（周六）至 2027-06-06（周日）**。这不是当前 CAAU 开发库。关闭后重新启动会建立新库、新会话。

## 如何输入与观察

在 Input 的 **Message** 展开后输入自然语言；也可点 **View Raw** 输入：

```json
{"message":"你好，请用一句话介绍你能做什么。"}
```

点击 **Submit**，在右侧查看 `answer`、`reply` 与节点状态。同一 Thread 依次提交：

1. `把周六第二场比赛移到周日，场地保持不变。`
2. `上午十点`
3. `再晚半小时`

最终 `reply.task.preview.after.startAt` 应为 `2027-06-06T02:30:00.000Z`，对应北京时间周日 10:30。这里只生成预览，没有确认保存按钮，也不会新增赛程版本或发布。

| 节点 | 含义 |
| --- | --- |
| load_context | 创建或恢复测试会话、鉴权读取上下文 |
| intent_router | 真实模型判断意图，再应用业务防护规则 |
| respond_chat / save_dialogue | 生成回答并完整保存问答 |
| plan_query / execute_query / save_query | 授权只读赛程查询，不改变预览或赛程 |
| plan_requirements / save_requirements | 提取需求，服务端校验并保存独立排程需求；**不**生成赛程或执行票据 |
| generate_candidate / validate_candidate | 仅在明确输入已确认需求版本、赛制和完整配置时纯计算整套候选，独立校验并展示 `candidateResult`；不调用正式赛程写入 |
| prepare_task | 建立或继续单场任务，重新读取持久任务参数 |
| authorize_context | 再次鉴权 |
| parse_intent | 真实模型增量解析比赛和时间 |
| locate_resources | 定位赛事/场次，缺参时返回补充提示 |
| deterministic_preview | 执行业务确定性校验并生成预览 |
| return_result / inspect_result | 保存业务对话并读取权威任务结果 |

`eventId`、`matchId` 通常留空；有候选需要明确选择时填写工作台返回的 ID。`newTask=true` 表示显式新单场任务。用官方新建 Thread 创建独立对话。

CAAU-063 需求采集需用**新 Thread**：先发送“收集排程需求，赛事日期范围 2027-06-05 到 2027-06-06”，无赛事时从 `reply.candidates` 选择合成赛事 ID 并以相同文本重发；接着分别描述该赛事参赛球队的时段（例如“[候选的合成球队名称]只能周六”）、“改成周六和周日”、取消等。会话响应的 `reply.planningRequest` 和图中的 `plan_requirements → save_requirements` 应反映 revision、具体日期、来源和待补；继续编辑需要 `planningId` 和 `planningRevision` 与当前版本一致，同名参赛球队需显式 `teamId`。**Studio 图不提供需求确认按钮或正式赛程写入节点**；需先在有权业务 API/Web/小程序中按独立按钮确认需求（也不生成赛程）。CAAU-064 后，可在独立 Studio 新 Thread 输入精确消息“生成整套候选赛程预览”，并明确填写已确认的 `planningId` / `planningRevision`、`candidateBaselineRevision`（尚无正式赛程为 0）、`candidateConfigSource`、完整 `candidateConfig`（赛程日期须等于需求中的 MUST 日期）及已核对的 `candidateFixedMatchIds`，否则拒绝，不会从对话猜时长、场地或休息。当前 Studio 合成赛事的参赛队 ID 应从有权 API 获得，不能照抄手册中的样例 ID；只读 HTTP 图加载不等于官方页面登录后人工执行通过。

## 验证与关闭

服务已运行时可单独执行真实 Qwen 验收（不进入默认 CI）：

```sh
node scripts/studio.manual.mjs
```

脚本检查官方图与 schema 端点、真实聊天、同一会话三轮预览、完整目标日期时间、状态中无凭据字段，以及赛程版本/命令回执数量不变。

终端 **Ctrl+C** 停止。正常退出会删除本次创建的随机合成库和本次 checkpoint 目录，不操作开发库和 Docker 数据卷。`.local/studio/current.json` 仅记录当前进程、端口、合成库名和测试赛事 ID，不含凭据。开发图使用编译产物，改源码后运行 `corepack pnpm --filter @caau/api build` 会触发服务重载。

## 提示和排障

- 官方页面提示缺少 `LANGSMITH_API_KEY`：云端 tracing 被有意关闭，图和本地交互仍可使用；云端 Trace/评测未启用。
- 页面跳到登录：完成 LangSmith 登录，再打开上述 Studio 链接。
- Chat 按钮不可用：当前使用自定义业务状态，选 Graph 模式。
- 2024 已占用：先确认本项目是否已经启动，不自动停止其他进程。
- 模型超时：查看终端中脱敏的 route/chat/intent/planning 阶段信息，不将错误算作成功。
- CLI 1.5.0 的 `--no-reload` 在本机 Node 24 会传入不支持的 `--clear-screen=false`，启动器使用默认热重载。
- 依赖树存在上游 `@hono/node-ws` 对 `@hono/node-server` 的 peer 范围告警；本次使用 HTTP/SSE，实际图/schema/运行端点单独验证，未验证 WebSocket 通道。

具体已通过与待验收项目见 [roadmap](../planning/roadmap.md)。
