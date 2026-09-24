# ADR 0025：排程需求单与单场执行任务分离

状态：已实施（CAAU-063）；沿用 [ADR 0019](0019-agent-orchestration.md)、[ADR 0022](0022-agent-dialogue-task-routing.md)、[ADR 0024](0024-agent-readonly-schedule-tools.md)。业务边界见[排程需求规格](../product/agent-schedule-planning.md)。

## 决策

- `PLAN` 为统一会话的独立分支。新增 `AgentPlanningRequest`（owner、session、event、revision、confirmedRevision、conditions、pending、unresolved）；**不是** `AgentTask`、`AgentConfirmationTicket` 或 `EventScheduleVersion`。每个会话每项赛事至多一份需求单；原有单场改期任务、查询来源和预览票据保留原语义。Studio 与 API 共用规划提取/保存业务方法，显示 `plan_requirements → save_requirements`，Studio 不设确认/生成/发布节点。
- 模型只返回每轮的候选 ADD/REPLACE/REMOVE（日期范围、参赛球队时段、两队偏好）。服务端**从用户本轮原话**解析年份日期、星期和可验证时刻；仅用当前赛事的 active `EventTeam` 确认球队，不使用永久 Team 档案，也不把需求写回球队资料。用户说“只能周三”但尚无赛事日期时，保存来源明确的 unresolved 描述，不伪造完整日期；补全范围后转换为具体日期并保留两个来源 turn ID。含糊时段、同名球队、语义未定的“优先对阵”、更改赛制/晋级或增加比赛先澄清，不能猜测或落库为肯定条件。
- 每条条件记录赛事 ID、参赛记录 ID/当时名称、MUST/PREFER、明确日期及可用/不可用类别、来源 turn ID 和 PENDING/CONFIRMED。恢复展示来源用户原话、摘要、待补和确定性重叠/互斥；软偏好与硬条件重叠也提示重新确认。日期范围单次最多 31 天、每轮最多 8 项、单单最多 30 条，是当前性能和响应长度的**技术边界**，不是用户已确认的正式业务排赛规则。不会把偏好视为已经产生一场比赛，不根据需求推断可排性。
- 确认端点只接受 `expectedRevision`，在鉴权事务中 CAS 标记需求单与条件为已确认；不进入 scheduling 生成/调整、不签发执行票据、不改写赛程。后续真正变化将 revision+1、清除 confirmedRevision 并将所有条件置为待确认；旧版本确认 409，重复确认同一仍有效的版本安全回放。当前参赛记录若已停用，历史确认显示 `STALE`，不能沿用或重新确认；可撤销旧条件后重新收集。赛程执行另需将来独立、重新授权和明确人工关口，目前不存在从需求单直接执行的接口。
- 创建/修改、会话恢复/列表、送模型历史、确认及 Studio 每节点都校验当前 owner 和当前赛事**管理操作权限**；扫描所有历史需求单，不能只看最近 turn 或活动单场 task。外部传入的 planningId 在送模型前校验属于当前会话，跨账号/跨赛事 ID 不得透出业务内容。前端只用生成的 `@caau/api-client`，传 planningId+当前 revision，409 后刷新会话，不把聊天中的“好的”当成需求确认。
- 通过 **两个前向迁移**增加表并向受限 app 角色授权新表。第一个迁移已在隔离临时库执行后发现缺少 runtime grant，故不回改它，第二个迁移补足授权；保留已执行历史迁移及现有开发库数据，不 reset。运行时只需 SELECT/INSERT/UPDATE 新表，不给 DELETE 或数据库管理能力。

## 权衡与后续

需求单记录用户当时要求而非“计算出的可行赛程”。明显矛盾阻止确认，未知冲突与业务可行性仍需人工和未来独立调度流程校验；参赛信息发生变化时历史来源保留、当前有效性重新评估。软条件不能承诺一定实现。后续如需跨周超过 31 天、跨多赛事计划、更多时段表达或正式生成/审批，必须有新的产品规则、权限和验收，不能把需求确认复用为调度执行许可。模拟、隔离 API、真实模型、微信运行时/真机、Studio 官方页面和远程环境分别报告。
