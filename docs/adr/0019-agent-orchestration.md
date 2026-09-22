# ADR-0019：业务智能体编排、工具与授权边界

状态：2026-09-23 CAAU-049 C1 已实现单场赛程草稿的“预览—确认—执行”、持久一次性票据与恰好一次命令回执；Agent 发布、整套重排写入、长期记忆及小程序入口仍未实施。

## 决策

在 `apps/api/src/modules/ai` 使用 LangGraph.js 建立服务端 Agent Orchestrator，嵌入现有 NestJS 模块化单体。首期为单 Agent 加业务工具组。终端 pi-agent 是开发工具，不是产品运行时。前端只提交当前登录会话、用户输入和可验证的页面上下文；模型通过严格结构化工具调用现有业务能力。模型不直接访问数据库、Prisma、任意 HTTP、文件系统或服务端密钥。

Agent 工具适配器调用业务模块公开 service 或同等受控用例，并把原始用户会话作为 actor 上下文。原业务模块在每次调用时重新执行授权、状态、CAS、幂等、事务和审计；Orchestrator 的工具过滤及模型提示不作为安全边界。

写工具采用“计划—确认—执行”协议：Orchestrator 先生成结构化影响预览，再签发与 userId、资源、工具版本、参数摘要、expectedRevision 和过期时间绑定的一次性确认票据；确认后才执行。发布/审批使用独立能力和独立确认，不能与草稿写入共用一次确认。

## 原因

现有赛程、材料、申请、球队和物料模块已经包含业务规则与真实权限。让模型直接写库或复制规则会产生第二套状态机，无法保证并发、撤权和历史一致性。结构化 function calling 适合把自然语言转换为现有 DTO；最终决定仍由确定性服务执行。

## 工具注册表

注册项至少包含工具名/版本、严格输入输出 schema、所需能力、资源提取器、风险等级、确认策略、幂等策略、超时/调用预算及日志脱敏规则。首期只注册赛程读取、生成草稿、调整草稿和后续独立发布工具。

工具名表达业务动作，不暴露数据库表。禁止通用 SQL、任意 URL、任意控制器调用或“以管理员执行”参数。actorId、组织和权限不由模型参数提供。

## 权限演进

C1 已将 `scheduling` 控制器和业务审计拆分为：

- `schedule.read`
- `schedule.draft.adjust`（C1 同时承载既有人工生成候选和单场草稿调整；Agent 只开放后者）
- `schedule.publish`

这些能力结合用户有效状态、角色/关系、eventId 范围和业务状态判断。已有 Web 操作同步消费相同能力，避免 Agent 与页面产生两套权限结果。持有效赛事 grant 的低权限成员可读取和预览但不能调整或发布；总部超级管理员、有效赛事经理及有效承办经办人保持既有操作范围。`schedule.publish` 是独立人工能力，未注册为 Agent 工具。若后续开放 Agent 整套重排，再从 `schedule.draft.adjust` 独立拆出 `schedule.draft.generate` 并补 expectedRevision。

## 模型与供应商边界

通过服务端模型适配层接入千问或混元；先选择一个实际可用的模型验证结构化工具调用、中文参数、超时与限流，再验证另一供应商。具体 model ID、端点和依赖版本在实现时核验并固定，不把兼容 API 等同于全部行为兼容。模型 SDK 只存在于 `ai` 模块，业务模块和生成的 `@caau/api-client` 不依赖模型 SDK；密钥只保存在服务端环境。

## 工作流与恢复

B1 实际图流程为：鉴权与上下文 → 模型增量解析意图 → 赛事/场次定位 → 缺参等待或确定性预览 → 返回结果。每条新消息都从鉴权节点进入；等待态以正常图结束和 checkpoint 保存，不使用会跳过前置鉴权节点的直接 interrupt resume。后续消息用同一 `thread_id` 启动下一轮，合并 checkpoint 中的结构化已知条件。业务读取和预览节点仍分别重新鉴权。未来写入流程再扩展为等待确认 → 重新鉴权及版本校验 → 执行业务命令 → 返回权威结果；确认后的写入只能由固定程序节点执行。

采用 PostgreSQL checkpointer 保存运行状态，其连接和初始化由 `@caau/database` 封装并按数据库运行手册管理，不由 API 随意建表。thread/session 必须绑定用户并在每次读取、恢复时验证归属；checkpoint 不存会话令牌或模型密钥。测试身份切换后沿用当前有效业务 actor，不能借用签发测试会话的管理员权限。

LangGraph interrupt 恢复会重新执行节点；checkpoint 不提供业务命令恰好执行一次的保证。确认状态、固定 commandId、持久命令回执和业务事务必须协作：业务已提交而图状态未保存时，应返回原结果，不能再次修改。现有赛程仅保存 lastCommandId，接入写工具前需补足跨后续命令的重放保护。

现有 generate 会直接保存草稿且没有 expectedRevision，不可作为无副作用预览。B1 已复用原算法和冲突校验新增纯预览；C1 只接入有 expectedRevision 的单场调整，整套重排和 Agent 发布后续分阶段开放。

## C1 确认与恰好一次语义

预览成功后由固定程序持久化 `AgentConfirmationTicket`，绑定当前 actor/task/event/match、调整后的时间和场地、expectedRevision、规范化参数摘要及 SHA-256、工具名/版本、服务端固定 commandId 与过期时间。客户端确认只回显 ticket ID、event/match 上下文和参数哈希，不能提交新业务参数；票据绑定字段由数据库触发器保护。新预览会取消同任务旧票据，取消、过期、参数变化或 revision 变化均要求重新预览。

确认端点不调用模型。在一个 Serializable 事务中，它锁定票据、重新认证当前 actor、重新执行 `schedule.draft.adjust` 赛事权限、校验票据，再以固定 commandId 调用 scheduling 的受控事务内用例；赛程版本、票据消费和不可变 `AgentCommandReceipt` 同事务提交。并发双击依靠行锁、Serializable 重试和 ticket/command 双唯一约束只产生一个赛程版本。提交后响应中断或 API 重启时，从持久回执返回原 revision、状态和冲突结果，不再次修改。详细接口与权限矩阵见 [C1 设计](../planning/caau-049-c1-agent-confirmation.md)。

选型依据：[LangGraph 概览](https://docs.langchain.com/oss/javascript/langgraph/overview)、[中断与恢复](https://docs.langchain.com/oss/javascript/langgraph/interrupts)、[持久化](https://docs.langchain.com/oss/javascript/langgraph/add-memory)。

## 三级记忆落地

B1 已实现 L1 `AgentSession/AgentTurn`，以结构化字段保存当前赛事和场次，同时保留必要近期对话与短摘要；已实现 L2 `AgentTask`，保存 owner、目标、步骤、结构化已知条件/待补字段、候选 ID、资源 ID、baseline revision、任务 revision、预览、有效期和 checkpoint thread。同一任务逐字段合并条件并稳定复用 task/thread；显式新任务或赛事切换清空旧任务条件。每次访问及恢复都重新检查 session actor、当前身份、历史任务资源权限、版本和有效期；模型调用前先完成这些检查，业务读取和预览前再次检查。撤权后不返回旧上下文、不调用模型，旧预览不携带执行权；并发条件更新通过任务 revision 返回 409，避免后写覆盖。

L3 本批仅保留设计边界，不创建空偏好表、知识表或向量库。未来只保存用户明确要求的偏好及带来源、版本、访问范围的知识；聊天总结不能成为正式规则。具体运行方式见[业务智能体赛程预览](../runbooks/agent-platform.md)。

## 记录与隐私

业务修改继续写原业务审计。Agent 另记运行轨迹，但只保存完成调查所需的最小内容；工具参数中含敏感信息时保存摘要。自然语言原文、私有附件和个人信息的保存期限在上线前确定。业务数据库仍是事实来源，Agent 对话和长期记忆不用于授权或自动恢复业务状态。

## 失败与降级

模型超时、限流或不可用时终止本轮，不能执行未确认写入，原业务页面继续可用。工具返回 401/403 时清除受保护上下文；409 时读取新版本并要求重新核对；未知写结果只能用原 commandId 查询/重试，不能生成新命令造成重复执行。

## 后果

- 需要新增 Agent 会话、turn、工具调用和确认票据的持久化设计，以及提示/工具版本管理。
- 需要把现有宽粒度赛程操作权限拆细，并同步回归 Web 权限。
- 每增加一个 Agent 能力，都必须先交付可独立测试的领域 API、权限矩阵和工具评测。
- 智能体可以逐步扩展，同时不会成为绕过原系统的超级入口。
