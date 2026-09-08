# ADR-0005：材料执行、私有文件与已确认交接规则

状态：CAAU-005 第二段实现设计，业务依据见 [首版规格](../product/mvp-material-review-spec.md)。保留 004/005 第一段迁移，使用追加迁移演进。

## 事务和历史

- 新增 TaskExecution（taskId 一对一）：EDITING/SUBMITTED/APPROVED/CLOSED、revision、assignmentGeneration、当前提交及下一版本计数、当前有效截止映射。保持已发布 MaterialTask/RequirementVersion 原文不变，延期不伪造新的要求版本。
- 截止映射初始化为任务和各材料的原截止时间。提交必须早于任务截止及本次必交/填写材料的截止，比较 PostgreSQL clock_timestamp()，不信客户端时间。整包延期接口提供一个新截止，必须晚于旧映射中全部截止，并整体更新当前任务/材料截止；DeadlineHistory 保留完整新旧映射、原因、操作者、服务器时间。草稿保存不检查截止。审核退回不暗改截止，需要延期时由赛事管理员另执行明确延期命令。
- MaterialDraft 当前可变草稿，revision CAS；DraftEdit 保存每次内容/附件关联、编辑者和时间的不可变快照。提交后不改提交快照；退回从当前提交复制产生新的草稿修订并记录来源，旧草稿编辑记录保留。
- SubmissionVersion 保存 requirementVersionId、version、原提交者/时间、assignmentGeneration、内容及附件 ID 快照；ReviewRecord 每 submissionId 唯一，保存整包 PASS/RETURN 与问题材料/原因/修改要求，均数据库不可变。SubmissionCommand 以 taskId/actorId/key 唯一保存请求 hash/结果，重复键不同请求 409，重试仍验证当前授权。
- 所有命令复用 authorization.run 的 Serializable 事务和成功审计；操作执行前锁 TaskExecution 行，再重新校验会话和指派。串行化冲突有限重试重新鉴权；同 key 提交重试读回原结果；并发审核只有一条结论，后到返回 409。

## 交接、关闭和权限

同机构交接由本赛事管理员执行，校验用户/成员有效与审核冲突；同事务更新 TaskScope、assignmentGeneration、执行 revision、草稿 revision、AssignmentHistory 和审计。草稿、确认附件及 DraftEdit 不复制/不重写作者，新的经办人按当前任务权限接管。旧经办人的后续草稿、提交、上传确认、绑定、下载均拒绝；交接前未完成的 UploadIntent 属于旧 generation，不允许新旧任一方继续确认，应重新上传，避免悬挂上传污染接管草稿。已确认且绑定的材料完整保留。

跨机构重指派（包括旧发布前 assignment 接口）拒绝；管理员可关闭原任务，记录原因/时间，禁止继续办理及审核、保留可授权查阅的历史，再独立创建新任务。新任务没有旧附件/内容复制入口。已提交/已审核历史保留原人和时间，交接或关闭不会覆盖。通过后不提供重新提交/重开，交接只改变责任人而非历史结论。

## 私有文件

本轮实现本地私有存储适配器，根目录在忽略的 `.local/files`，无静态映射；随机 UUID object key，不使用用户文件名拼路径。上传意图记录真实 task/material/organization/generation、预期字节数和 SHA-256、格式、过期时间。二进制 POST 使用 application/octet-stream、有实际字节上限及超时，独占创建防覆盖；不完整流清理本次部分文件。

完成确认从私有磁盘重新读取并核对真实大小/hash/支持格式特征，才转 CONFIRMED；绑定草稿验证同任务/材料/机构与确认状态，提交再核验实际对象存在且完整。确认前文件不可绑定/下载。完整写入但 DB/审计失败可留下 PENDING 私有对象，绝不算已提交；用户可重试确认，不提供公开地址。自动垃圾回收本轮不实现，不能误删历史附件。

本地首批内容校验支持 txt/pdf/png/jpg/jpeg，并且必须满足总部配置；其他格式明确拒绝，不假装已经验证 Office/压缩包。技术传输上限 10 MiB（不是业务默认），校验 UTF-8/魔数及 PDF 结束标志等完整性特征。**这不是病毒扫描**；本地身份模式不可生产开启，云私有桶/杀毒隔离扫描/大文件分片留部署准入，不能称生产文件安全已完成。

下载每次从附件真实任务和当前指派鉴权，只有在当前草稿或历史提交中已绑定且 CONFIRMED 的对象可读；无裸签名地址或公开 URL。返回 attachment、octet-stream、no-store、nosniff，经办方不因猜到 objectId 跨任务读取。下载再次校验存储内容 hash，审计不含文件正文或请求内容。正在传输的已授权响应不承诺追溯撤回，交接提交之后发起的请求立即拒绝。

## 本轮交付边界

实现后端及 JSON/二进制 OpenAPI 客户端；用真实 PostgreSQL、私有目录和 HTTP 上传/下载验证失败、越权、幂等、并发、延期和交接。第一段 Web 页面保留，但第二段办理/审核/延期/交接页面以及小程序待办/草稿/上传/重交页面未纳入本轮后端交付；微信登录、工具/真机、远程 CI 和生产存储单独验收。
