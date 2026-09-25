# CAAU 智能助手 V1 意图与工具归档

状态：**2026-09-25 当前实现的只读快照**。本目录供下一版对话编排重设计时对照，不参与编译，也不表示运行中的 V1 已停用。任务登记：CAAU-085。

基准提交：`03a7e24d7215a2e6088496fe954d31a8daab560f`，分支 `codex/caau-049-langgraph-architecture`。制作快照时工作区已有未提交的 CAAU-083/084 等改动；本目录的 `source/*.ts.txt` 是**制作当时文件的完整内容**，不能只用基准提交还原。`SHA256SUMS` 校验归档副本，原工作文件继续保留在 `apps/api/src/modules/ai/`。无凭据、环境文件、数据库内容或聊天记录进入归档。

## 快照文件

| 归档副本 | 当前源码职责 |
| --- | --- |
| `ai.controller.ts.txt`、`ai.dto.ts.txt`、`ai.module.ts.txt` | HTTP 接口、权限声明、输入输出契约、依赖装配 |
| `ai.service.ts.txt` | 对话路由、LangGraph 节点、会话/任务状态、只读查询、单场预览与确认票据 |
| `model-adapter.ts.txt` | 七类路由意图、提示词、千问/模拟适配器、各类结构化提取 |
| `schedule-tools.ts.txt` | `schedule.list`、`schedule.match` 封闭只读工具注册表与参数校验 |
| `planning.ts.txt`、`planning.service.ts.txt` | 排程需求提取结构、条件归并、澄清、版本与确认 |
| `candidate.algorithm.ts.txt`、`candidate.service.ts.txt` | 单循环候选计算、校验、持久候选快照与失效判断 |
| `memory-policy.ts.txt`、`memory.service.ts.txt` | 本人长期偏好准入、查看、保存和删除 |

在此目录运行 `cd source && shasum -a 256 -c ../SHA256SUMS` 可校验 12 个副本。副本扩展名为 `.txt`，防止被构建或误作为活动源码导入。共享的 [赛程服务](../../../apps/api/src/modules/scheduling/scheduling.service.ts)、[授权策略](../../../apps/api/src/modules/authorization/policy.ts)和数据库模型属于现行业务底座；本归档记录调用边界，不复制或废弃它们。测试和客户端仍以活动源码为准，相关入口列在文末。

## V1 意图分发

入口为 `POST /api/v1/agent/sessions/:sessionId/messages`。服务端鉴权并读取会话、任务、最近查询和需求单后，`AgentModelAdapter.route` 输出以下七类之一；`AiService.resolveDialogueRoute` 再用关键词与任务状态修正或拒绝模型结果。千问使用结构化输出，未配置千问凭据时使用确定性模拟适配器。

| 意图 | 当前行为 | 后续约束 |
| --- | --- | --- |
| `CHAT` | 通用回答并保存成对消息；不创建业务任务 | 允许自由聊天；不能声称已读取业务数据 |
| `CLARIFY` | 由聊天模型追问或业务方法返回固定澄清 | 当前没有统一、持久的“待回答问题”对象 |
| `UNSUPPORTED` | 解释当前能力边界，不调用写入工具 | 禁止把未接入操作偷偷路由到已有写工具 |
| `QUERY` | `planQuery` 提议只读查询，服务端定位、鉴权、执行并保存来源 | 不能由模型直接查库；撤权后历史来源不得再送模型 |
| `PLAN` | `planPlanning` 提议需求变更，服务端验证并保存 `AgentPlanningRequest` | 需求确认另走专门按钮；需求单不是正式赛程 |
| `START` | 新建单场改期任务，进入带 checkpoint 的业务图 | 只生成确定性预览及待确认票据 |
| `CONTINUE` | 根据活动单场任务增量补参或重新定位 | 必须校验原任务、赛事和 revision |

此外，`model-adapter.ts` 分别实现聊天回答、赛程只读查询计划、排程需求变更提案、单场改期参数增量提取、较早对话摘要和模型连接测试。模型提出意图/参数，业务读写均由服务端决定。七类路由并不是七个独立模型。

## V1 工具与操作边界

| 能力／工具 | 调用入口 | 读写与授权边界 |
| --- | --- | --- |
| `schedule.list` | `QUERY` → `planQuery` → `executeScheduleQuery` | 只读；注册表声明 `schedule.read`，服务端实时鉴权并从当前赛程快照筛选，最多展示前五场 |
| `schedule.match` | 同上 | 只读；定位单场详情，歧义时返回候选供选择 |
| 排程需求收集／修订 | `PLAN` → `planPlanning` → `PlanningService.apply` | 写入本人需求单与版本；验证赛事管理权限、真实参赛队、日期和条件，不写赛程 |
| 确认需求版本 | `POST planning-requests/:id/confirm` | 人工按钮、权限与预期 revision；只确认需求，不生成赛程 |
| 整套候选预览 | `POST planning-requests/:id/candidates` | 仅已确认且有效的单循环需求；显式配置、基础版本和固定范围；保存独立候选，不写正式赛程 |
| 候选查询 | `GET .../candidates/latest`、`GET .../candidates/:candidateId` | 重新鉴权并检查需求、参赛队和基础赛程是否已变化 |
| 单场改期预览 | `START/CONTINUE` → `authorize_context` → `parse_intent` → `locate_resources` → `deterministic_preview` | 读取有权赛事、定位场次、校验目标时间；只生成预览与确认票据 |
| `schedule.draft.adjust` | `POST confirmation-tickets/:id/confirm` | 人工确认；票据绑定 actor、赛事、场次、参数哈希、期限和 revision；事务执行并以 commandId 回放原回执；仅 DRAFT |
| 取消单场票据 | `POST confirmation-tickets/:id/cancel` | 重新鉴权并取消待执行票据，不写赛程 |
| 本人长期偏好 | `GET/POST memories`、`POST memories/:id/delete` | 本人显式保存；最多 30 条；删除清空正文并从后续模型上下文移除；不能代替赛事条件 |
| 会话与模型状态 | `sessions` 系列、`model-status`、`model-status/test` | 会话按 owner 隔离；模型状态/测试仅总部超级管理员 |

没有智能体 `schedule.publish` 工具，也没有让模型直接执行 SQL、审批或覆盖正式赛程的入口。`schedule.draft.adjust` 是服务端受控命令标识，不能只凭模型一句“确认”调用。

## 状态与图

- 普通对话图为 `route → respond_chat` 或路由到其它分支，不使用 LangGraph checkpoint；持久 `AgentTurn` 是会话原文来源。
- 单场任务图持久化 `AgentTask` 和 PostgreSQL checkpoint；预览、CAS、票据和回执由服务端管理。
- 排程需求为独立 `AgentPlanningRequest`，候选为独立 `AgentScheduleCandidate`；它们都不是正式赛程版本。
- L1 摘要在 `AgentSession`，L3 本人偏好在 `AgentMemory`；二者不能作为权限、赛程事实或已确认需求。
- Studio 图还暴露 `intent_router → plan_query/plan_requirements/prepare_task` 和显式的 `generate_candidate → validate_candidate`，用于调试，不额外赋予执行权限。

## 已知设计问题，供重设计验收

1. `routePrompt` 把“好的”写成固定 `CHAT`；业务需求澄清又可能被路由为 `PLAN`。两条规则没有统一的待答状态。
2. 首次排程需求的服务端守卫要求本轮含明确条件、整套排程请求或“收集/记录/建立/创建/开始…排程需求”等字样。单独回复“是的”“确定”可能再次得到“请明确是否要开始…”；这是已观察到的交互问题，不能归因为用户回答错误，也不能仅通过增加提示词宣布修复。
3. 目前缺少带问题类型、选项、所属赛事、有效期和答案的持久澄清对象；近期聊天记录和摘要只能帮助模型理解，不能稳定代表等待中的业务步骤。
4. 工具入口分散于会话方法、专用 HTTP 按钮和 Studio 图。下一版应统一能力目录与调用协议，同时保留现有权限、确定性校验、人工确认、CAS、幂等与审计边界。

## 迁移与复核入口

重设计时逐项对照 [ADR-0019](../../adr/0019-agent-orchestration.md)、[ADR-0022](../../adr/0022-agent-dialogue-task-routing.md)、[ADR-0024](../../adr/0024-agent-readonly-schedule-tools.md)、[ADR-0025](../../adr/0025-agent-planning-requirement-revisions.md)、[ADR-0026](../../adr/0026-agent-whole-schedule-candidate-preview.md)及[ADR-0028](../../adr/0028-agent-three-level-memory.md)。接口与真实授权断言在 `apps/api/test/ai.test.mjs`、`scripts/authorization.integration.mjs`、`scripts/scheduling.integration.mjs`、`scripts/scheduling-browser.integration.mjs`；Web 会话交互在 `apps/admin/e2e/agent-window.spec.ts`。这些测试包含既有业务安全门槛，但“是的/确定”承接上一问的完整回归尚需新增。

下一版替换路由或工具调度前，应逐行核对本目录快照与活动源码的差异；不得把归档副本重新作为运行依赖，也不得删除仍被客户端或业务流程调用的接口。归档本身不改变 API、数据库或用户会话。
