# CAAU-049 C1 单场赛程草稿确认设计

状态：C1 本地交付；2026-09-23 补齐撤权取消与持久回执恢复验收。范围仅为智能体纯预览后的单场草稿调整；不开放智能体生成整套赛程或发布赛程。

## 接口

- 现有 `POST /api/v1/agent/sessions/:sessionId/messages` 在预览成功后签发确认票据，并在任务响应中返回安全票据信息。
- `POST /api/v1/agent/confirmation-tickets/:ticketId/confirm`：请求回显预览返回的 `eventId`、`matchId` 和 `parameterHash`，固定执行票据中 `schedule.draft.adjust@v1` 的参数；任一上下文变化即拒绝。
- `POST /api/v1/agent/confirmation-tickets/:ticketId/cancel`：当前 owner 且当前仍有该赛事读取权限时取消票据；重复取消也重新鉴权。只返回 `{id,state:'CANCELLED'}`，不回传赛事/比赛/场地/摘要。
- 现有手工 `PUT /api/v1/events/:eventId/schedule/matches/:matchId` 保持生成客户端契约和行为；改为消费同一 `schedule.draft.adjust` 权限。
- 不增加任何 Agent 发布接口；`POST .../schedule/publish` 仍只属于人工 Web 能力。

确认成功响应只返回权威命令结果：ticket/command ID、是否为持久回放、event/match ID、新 revision、`DRAFT` 状态及确定性冲突列表。`GET /api/v1/agent/sessions/:sessionId` 和有权会话列表额外返回 `lastExecution`（无回执时为 null）：该会话当前赛事最新一条持久回执的执行时间及**当时**权威结果。只有当前 owner 且会话所有历史赛事范围均仍可读取时返回；列表逐个验证，不暴露撤权会话。新任务不会清除旧回执；确认成功推进会话排序时间。Web 使用此响应在刷新、重新登录及未知写结果时恢复，并单独读取当前赛程 revision/status；回执不是当前赛程快照。

## 权限矩阵

| 能力 | 总部超级管理员 | 有效赛事经理 | 有效承办经办人 | 其他持有效 EventGrant 的低权限成员 | 无范围/已撤权 |
| --- | --- | --- | --- | --- | --- |
| `schedule.read`（读取/预览） | 允许 | 允许 | 允许 | 允许 | 拒绝 |
| `schedule.draft.adjust`（生成候选/手工调整/Agent 确认） | 允许 | 允许 | 允许 | 拒绝 | 拒绝 |
| `schedule.publish`（仅人工 Web） | 允许 | 允许 | 允许 | 拒绝 | 拒绝 |

低权限读取不会获得草稿调整或发布能力。C1 先保持既有赛事经理与有效承办经办人的人工发布路径，发布仍使用独立能力且绝不暴露给 Agent；身份、成员、grant、承办关系在每次读取、签票和确认时重新判断，票据不保存授权快照。

## 确认票据

`AgentConfirmationTicket` 服务端生成并持久化：

- owner（当前实际 actor）、task、event、match；
- 调整后的 `startAt`、`venue` 和 `expectedRevision`；
- 服务端规范化参数摘要及 SHA-256 `parameterHash`；
- 工具名 `schedule.draft.adjust`、版本 `v1`；
- 签发时固定的 `commandId`；
- `PENDING / EXECUTED / CANCELLED`、签发时间、过期时间、消费时间。

同一任务产生新预览时取消旧的待确认票据。确认不接受新的时间、场地、赛事、比赛或 revision；客户端只能回传票据 ID 和参数摘要哈希。数据库触发器禁止修改票据绑定字段。

## 持久命令回执

`AgentCommandReceipt` 以 ticket ID 和 command ID 双唯一持久化，保存 owner、event、match、参数哈希及权威结果 JSON，并设为不可更新/删除。

确认在一个 Serializable 数据库事务中完成：重新鉴权 → 校验票据 owner/状态/期限/hash → 使用票据固定 command ID 调用 scheduling 的受控单场调整用例 → 写入赛程新版本、票据消费状态及成功回执。这样：

- 双击或网络重试在已有回执时返回原 revision/冲突结果并标记 `replayed=true`；
- API 重启后仍从数据库回放；受控会话读取还可在请求响应丢失后取回原始命令 ID、执行版本、当时冲突结果，无需发起第二次写入；
- 业务提交后 HTTP 响应中断时，赛程与回执已同事务提交，不会再次修改；
- 事务在提交前中断时，赛程、版本、票据消费和回执全部回滚。

## 失败规则

- 确认要求 `schedule.draft.adjust`；取消及回执读取要求当前 owner + `schedule.read`，撤权、跨账号或跨赛事访问均 403，拒绝响应不含票据摘要；
- 票据过期、取消、参数哈希变化、任务/票据绑定异常：409；
- 当前赛程 revision 不等于 `expectedRevision`：409，必须重新预览，不自动 rebase；
- 模型只参与确认前的意图解析。确认端点不调用模型；模型超时不会签发新票据，更不会执行写入；
- 保存后状态固定为 `DRAFT`，即使基线曾发布也不自动再次发布。
