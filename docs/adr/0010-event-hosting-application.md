# ADR-0010：赛事承办申请、原子获批与来源追溯

状态：CAAU-027 待确认设计；未实施。业务依据见[赛事承办申请产品规格](../product/event-hosting-application-spec.md)。

## 1. 决策背景

当前 `POST /events` 由总部直接创建仅含名称、说明的正式赛事；`ORGANIZER EventGrant` 是成员访问授权，`TaskScope` 是材料任务指派。系统没有“赛事创建前申请”、赛事级承办机构关系、申请版本或赛事来源。

新流程要求承办机构先提交赛事名称、时间、地点和申请资料；已提出的资料清单为必交营业执照、简介（办赛经验）、现场照片，选交其他文档。总部审核包含“审核中”状态，通过后才创建正式赛事并登记申请机构为承办方。未通过不得创建赛事。申请人仅是本次提交人，不能被技术实现推导为唯一赛事经办人。现有材料流程必须作为获批后的独立后续流程继续保留。

## 2. 核心决策

1. 新建独立 `event-hosting-applications` 业务模块；申请不是 `Event` 草稿，也不提前创建 `EventScope`。
2. 使用可变草稿和不可变提交版本；审核动作永远指向 submissionId。
3. 通过命令在一个数据库事务内完成：锁定并裁决申请版本、创建 EventScope/Event、创建赛事来源、登记承办机构关系、记录决定/命令/审计并更新申请状态。
4. `EventOrganizerAppointment` 表达赛事与机构的承办业务事实；`EventGrant` 继续只表达成员访问授权，`TaskScope` 继续只表达材料任务责任。
5. Event 通过不可变来源记录和初始赛事信息版本追溯到唯一获批提交版本；后续赛事变更不得改写来源快照。
6. 获批事务不自动创建 `EventGrant`、经办人员关系或 `MaterialTask`，直到对应业务规则确认。
7. 现有赛事不反推申请或承办关系；后续只追加迁移并保持旧流程原样。

## 3. 建议数据模型

以下是实现结构建议，不是已执行 schema；名称可在后端阶段按 Prisma/PostgreSQL 约束细化。

### 3.1 申请聚合

| 对象 | 关键字段与不变量 |
| --- | --- |
| `EventHostingApplication` | id、applicantOrganizationId、status、revision、draft JSON、currentSubmissionId、approvedEventId、createdBy/At；机构不可在提交后悄然替换；一个申请至多一个 approvedEventId |
| `HostingApplicationSubmission` | id、applicationId、version、formSnapshot、requirementVersionId/requirementSnapshot、submittedBy/At；`unique(applicationId, version)`；UPDATE/DELETE/TRUNCATE 受不可变保护 |
| `HostingApplicationRequirementVersion` | id、版本、发布信息；首版要求明确包含三项必交（营业执照、简介〔办赛经验〕、现场照片）和一项选交（其他文档），不得擅增项目；格式、大小、数量、特殊情况及配置/发布机制确认后落地对应限制 |
| `HostingApplicationDocument` | 资料条目元数据，关联某要求项或经允许的自选资料；草稿阶段可修订，提交时由 SubmissionDocument 冻结 |
| `HostingApplicationUpload` | 申请、机构、actor、私有 storageKey、原文件名、大小/hash/格式、PENDING/CONFIRMED、过期/绑定时间；不复用现有材料附件归属 |
| `HostingSubmissionDocument` | submissionId、document snapshot、fileId；append-only，复合外键防跨申请/跨机构绑定 |
| `HostingApplicationAction` | applicationId、submissionId、from/to、action、actor、服务器时间、结构化 detail；提交、开始审核、补充要求、驳回、通过均追加历史；打开详情不写动作 |
| `HostingApplicationCommand` | actorId、applicationId、idempotencyKey、requestHash、result；相同键同载荷返回原结果，不同载荷 409 |

草稿 JSON 可以保存尚未最终定型的时间/地点结构，正式提交快照也使用受 DTO 校验的结构化 JSON；字段口径确认后再决定是否拆成列。不可因使用 JSON 放弃长度、时区、格式和必填校验。

### 3.2 正式赛事来源与承办关系

| 对象 | 关键字段与不变量 |
| --- | --- |
| `EventOrigin` | eventId 主键、applicationId unique、approvedSubmissionId unique、createdAt；三者不可变，保证一申请/一获批版本只创建一个赛事 |
| `EventProfileVersion` | eventId、version、name/time/location 快照、sourceType/sourceSubmissionId、createdBy/At；V1 来源为获批提交，后续正式变更追加版本 |
| `EventOrganizerAppointment` | id、eventId、organizationId、sourceApplicationId/sourceSubmissionId、status/effectiveAt、createdBy/At；是机构关系，不含人员 grant |
| `EventOrganizerAgent` | appointmentId、organizationMemberId、职责/状态/有效期；仅在经办规则确认后实施，不由申请人自动生成 |

现有 `Event.name` 可作为当前名称投影以兼容已有查询，但初始值必须来自同一获批快照并在事务内写入；时间和地点的正式字段/版本结构待产品口径确认。`EventOrigin` 是创建来源，`EventProfileVersion` 是当时正式信息版本，两者均不能被后续编辑覆盖。

若业务最终确认一个赛事只能有一家承办机构，再增加相应唯一约束；当前不以数据库约束擅自限定主办/承办/协办基数。

## 4. 状态机与命令

状态机必须包含 `IN_REVIEW`：

```text
DRAFT → PENDING_REVIEW → IN_REVIEW → APPROVED
                         ├────────→ REJECTED
                         └────────→ NEEDS_SUPPLEMENT → PENDING_REVIEW
```

- `saveDraft(expectedRevision)`：仅允许有权申请方保存；CAS 冲突返回当前 revision，不覆盖。
- `submit(expectedRevision, idempotencyKey)`：验证营业执照、简介（办赛经验）、现场照片三项必交资料及表单，其他文档允许为空；生成不可变 Vn 和 SUBMIT 动作。
- `startReview(submissionId, expectedRevision, idempotencyKey)`：**建议流程**为审核人员明确点击“开始审核”后从 PENDING_REVIEW 进入 IN_REVIEW，记录实际人员、服务器时间和目标版本。打开详情只读，不调用该命令、不改变状态。该动作是否产生领取/排他权仍待确认。
- `requestSupplement(submissionId, expectedRevision, request, idempotencyKey)`：从 IN_REVIEW 进入 NEEDS_SUPPLEMENT；不创建赛事，保存补充要求，当前版本保持不可变。
- `resubmit(...)`：从补充草稿生成 Vn+1 并回到 PENDING_REVIEW；是否可由另一同机构人员执行取决于待确认权限。
- `reject(submissionId, expectedRevision, reason, idempotencyKey)`：从 IN_REVIEW 进入 REJECTED，不创建赛事；是否还能继续同一申请待确认。
- `approve(submissionId, expectedRevision, idempotencyKey)`：从 IN_REVIEW 进入 APPROVED 并执行第 5 节原子事务；没有通用 `PATCH status`。

“审核中”状态本身是需求，不再作为可选项。明确点击开始审核是当前建议而非已确认唯一触发方式；无论最终采用何种显式操作，GET 详情都不得产生状态变更。驳回和补充必须是不同动作、状态和审计语义。

## 5. 原子获批、幂等与并发

### 5.1 API 输入

通过命令至少携带 applicationId、当前 submissionId、expectedRevision 和 UUID idempotencyKey。服务端从当前会话取得审核 actor，不接受客户端指定 approvedBy、organizationId 或 eventId。

### 5.2 单事务步骤

由申请模块作为用例编排者，通过公开服务共享同一个 Prisma transaction：

1. 开启 Serializable 事务，锁定申请行；
2. 重新加载会话、成员和审核权限；权限策略确认前不实现放行逻辑；
3. 读取幂等命令：同 actor/申请/key 且请求 hash 相同则在重新鉴权后返回原 eventId；不同载荷返回 409；
4. 校验申请仍为 IN_REVIEW、revision/submissionId 均为当前值，且 submission 属于该申请和申请机构；
5. 从不可变 submission 快照取得名称、时间、地点和 applicantOrganizationId，不信任审批请求重复传值；
6. 创建 EventScope 与共享 ID 的 Event，并创建 EventProfileVersion V1；
7. 创建 EventOrigin，唯一关联 applicationId 和 approvedSubmissionId；
8. 创建 EventOrganizerAppointment，机构必须等于申请快照中的申请机构，来源必须等于该 submission；
9. 写 APPROVE action、审核决定、application.status/approvedEventId、命令结果和 AuditRecord；
10. 提交事务后才向客户端返回 eventId。

任一步失败全部回滚，包括 EventScope。不得先把申请标成通过，再由队列或前端补建赛事；也不得调用三个彼此独立提交的 HTTP 接口完成批准。

### 5.3 防重复约束

- `EventOrigin.applicationId` unique；
- `EventOrigin.approvedSubmissionId` unique；
- `EventHostingApplication.approvedEventId` unique nullable；
- 审核终局动作对 application/current submission 建部分唯一约束；
- 命令键 `(actorId, applicationId, idempotencyKey)` unique 并保存规范化请求 hash；
- CAS revision 与行锁防两个审核员对同一版本作相反结论；
- 唯一冲突只在本命令内读取已提交幂等结果，不自动更换 submission/revision 重试。

预期并发结果：两个相同通过请求只得到同一 eventId；通过与驳回并发仅一个成功，另一个 409；审计或承办关系写入失败时不存在正式赛事。网络丢失响应后用原幂等键重试，不生成第二个赛事。

## 6. 授权边界

建议新增独立 policy，不复用“能访问 Event”判断申请权限，因为申请尚无 Event：

- applicant policy：按 active user、active organization membership、允许的组织角色和 application.applicantOrganizationId 判定；具体角色待确认；
- reviewer policy：按待确认的总部申请审核权限及范围判定；不能默认所有 REVIEWER 或 EVENT_MANAGER 都能审核全部申请；
- approved event policy：仍由 EventGrant 等现有策略判定，承办关系本身不直接当 bearer permission。

批准时只写承办业务关系。经办授权规则确认后，可以由同一获批用例在**同一事务**显式写 EventOrganizerAgent、EventGrant 和对应审计；但这些写入必须是独立对象，不能用 grant 替代 appointment。规则未确认时不执行这些步骤。

系统管理员不因角色自动获得业务申请正文/附件；文件下载、列表、详情、历史和命令逐请求复核权限。无权与不存在对象采用一致拒绝策略，日志不记录申请正文、审核原因、文件名、token 或字节。

## 7. 文件与版本安全

复用 API 侧私有存储适配、文件名清理、大小/hash/格式和受控代理下载能力，不复用旧业务外键：

1. 申请上传先建 intent，再上传字节并确认；确认时核对真实字节数、SHA-256 和允许格式。
2. 文件归属固定为 application + applicant organization + actor；绑定时再次校验，禁止跨申请、跨机构和跨版本偷绑。
3. 草稿可移除未提交引用；已提交 SubmissionDocument 与文件核心元数据 append-only。
4. 审核员只能在有权查看对应 submission 时下载；申请方权限变化后按当前 policy 判定，不因曾上传永久开放。
5. 旧材料附件、模板附件和申请附件保持不同关系及下载策略；不迁移、不共用业务 ID。

具体允许格式和大小属于待确认要求；技术上限不得宣传为业务默认。

## 8. 模块与接口边界

后续后端建议落点：

- `apps/api/src/modules/event-hosting-applications/`：申请聚合、状态机、版本、文件归属、审核编排；
- `authorization`：公开申请方/审核方 policy 和共享事务能力，不拥有申请业务表；
- `materials/events` 当前模块：公开可在外部 transaction 中创建 EventScope/Event 的服务；不由申请模块直接访问其私有 repository；
- 新的赛事关系服务：拥有 EventOrigin、EventProfileVersion、EventOrganizerAppointment；可在模块边界确认后独立为 events 域；
- `@caau/database`：唯一 Prisma 入口；前端不得依赖数据库实体；
- `@caau/api-client`：只从 Nest OpenAPI 生成 DTO/请求元数据，再提供平台适配。

接口按用例拆分：草稿读取/保存、提交、列表/详情、版本历史、上传/确认/下载，以及建议的 start-review、request-supplement、reject、approve；禁止开放客户端可任意写状态、eventId、applicantOrganizationId 或 approvedBy 的通用更新接口。详情 GET 必须无副作用，不能隐式调用 start-review。

## 9. Web 与小程序技术落点

- Admin 新增 `features/event-hosting-applications` 和独立路由；审核命令固定 submissionId/revision，成功响应以服务端 eventId 为准。按钮 pending 时禁重复只是体验保护，数据库幂等才是正确性保护。
- Miniapp 新增独立 feature/pages，不依赖当前 event context；会话变化、离页和迟到响应继续使用 epoch/清理模式，草稿输入与服务端 revision 分离。
- 两端只消费 `@caau/api-client`；不导入 API/Prisma 源码。状态不只用颜色，补充/驳回原因有明确文本，提交和批准显示不可逆后果。
- 是否复用现有约 2 秒轮询由页面体验和负载阶段决定；没有确认通知要求前不承诺实时推送。

## 10. 迁移与兼容策略

1. 只追加 migration；不编辑现有六份迁移或重算历史 checksum。
2. 新表允许 `EventOrigin` 只覆盖新申请创建的赛事；现有 Event 不要求来源行。
3. 不扫描 `EventGrant`、`TaskScope` 或 MaterialTask 回填 EventOrganizerAppointment。
4. 对新 Event 的 EventOrigin/初始 profile/appointment 使用事务内约束；旧 Event 继续按现有 name/description 查询。
5. 迁移夹具先构造旧赛事、grant、旧整包和单份材料 V1/V2/附件，再升级并比较表投影、数量、文件 hash、权限及重启读取。
6. 发布采用后端/契约先行、页面后接入；前端上线前不把申请接口暴露成半成品入口。失败采用前向修复，不 reset、不删除卷、不改历史迁移。

## 11. 被否决或暂不采用的方案

- **申请时先创建隐藏 Event**：会让未通过申请产生正式赛事或孤立 EventScope，违反确认规则。
- **把 EventGrant 当承办关系**：无法表达机构业务事实、来源和历史，且授权撤销会错误抹去承办事实。
- **申请人自动成为唯一经办人**：把一次提交动作误作长期人员关系，违反确认规则。
- **审批后依次调用“创建赛事/授权/创建任务”接口**：不能保证原子性，重复点击会产生部分成功和重复赛事。
- **覆盖同一申请记录保存 V2**：会丢失总部实际审核版本及附件证据。
- **从现有任务或 grant 批量推导承办关系**：现有数据语义不足，可能制造错误业务事实。
- **擅自扩充或重新标记申请资料清单**：首版三项必交和一项选交已经提出；不得因格式/大小/数量尚待确认而把整个清单标成未确认，也不得加入未提出材料。

## 12. 实施关口

在进入后端阶段前，至少确认产品规格第 10 节中的申请资格、审核权限、驳回后路径、经办授权、材料任务创建时机、资料格式/大小/数量及特殊情况、要求版本配置来源、时间/地点结构、补充材料规则，以及审核中状态的最终进入/接续方式。未确认项可以保留在模型扩展点中，但不得用技术默认替代业务决定；已提出的四项资料及“审核中”状态不得降级为未确认。
