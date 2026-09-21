# ADR-0020：赛事人员名单与单场快照

状态：CAAU-050 实施。用户确认总部及承办方共同维护人员，承办方仅能维护自己的赛事。

## 决策

在既有 event-situation 模块内新增 EventStaffService/Controller，维护赛事级 EventStaff 及不可变 EventStaffVersion。复用 eventOperations 和 AuthorizationService.run 的串行化事务、授权重验、失败回滚与审计，不增加人员登录身份或全局通讯录。

EventStaff id 为客户端创建请求 UUID；同操作人、同赛事、同初始资料重试返回原记录，载荷不同返回409。更新使用 revision CAS；停用以 active=false 保存新版本，不物理删除。数据库触发器保护身份与历史。

保留 EventMatchStaff 现有赛程版本/场次快照。现有 staff 项追加可选 sourceStaffId/sourceStaffRevision，旧数据无需回填。关联时同事务核验来源同赛事、有效及版本一致，从名单复制姓名、联系方式、单位；场次岗位和备注独立。来源变更不联表覆盖快照，旧版和人员历史可追溯。JSON 来源保留稳定 UUID，源记录无运行时物理删除能力。

名单和单场指派使用相同赛事操作权限；参赛球队球员名单仍沿用原承办方写权限，不随本次扩大。单场指派仍只面向当前已发布赛程，重编排不自动迁移旧人员。候选赛程指派和赛程页选择器后续单独实施。

## 兼容和验收

追加第16个迁移，不改已部署迁移及现有对象。Nest DTO/Controller先变更，再生成契约和客户端；前端仅调用客户端。验证共同办理、跨赛事拒绝、幂等/CAS、历史不可变、人员改名/停用不改变场次快照、已停用来源拒绝和现有球队人员权限保留。操作与边界见[人员管理](../runbooks/event-staff.md)。
