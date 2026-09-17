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
6. 获批事务为申请机构内当时 active member + active `HostingApplicationHandlerGrant` 的人员创建独立 `EVENT_BASIC_INFO_VIEW` 授权；不赋予宽泛 `EventGrant`/角色，不创建 `MaterialTask`、`TaskScope` 或任务办理权。
7. 现有赛事不反推申请或承办关系；后续只追加迁移并保持旧流程原样。
8. 承办申请审核使用独立、可撤销的申请审核权限，不读取 `EventGrant`；有权总部审核员共享队列，显式开始审核但不建立 owner/领取锁，其他有权审核员可接续。
9. 所有审核写动作记录实际 actor、数据库时间和 submissionId/version；禁止审核本人提交的申请，同一版本冲突状态变更只能一个提交成功。
10. 申请办理权属于“有效同机构成员 + 有效申请办理权限”，不属于 createdBy；同机构有权经办人共享草稿和补充版本。所有草稿写入使用 revision CAS 并记录实际 actor/时间，跨机构拒绝，已提交版本保持不可变。

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
| `HostingApplicationAction` | applicationId、submissionId、from/to、action、actor、服务器时间、结构化 detail；创建/保存/附件操作/提交/补充重交、开始审核、补充要求、驳回、通过均记录实际人及 revision/version；正式版本和审核动作 append-only，打开详情不写动作 |
| `HostingApplicationCommand` | actorId、applicationId、idempotencyKey、requestHash、result；相同键同载荷返回原结果，不同载荷 409 |
| `HostingApplicationHandlerGrant` | id、organizationMemberId、organizationId、active、grantedBy/At、revokedBy/At；授予成员办理本机构申请的能力，不绑定 createdBy；成员与 grant 机构必须一致 |
| `HostingApplicationReviewGrant` | id、organizationMemberId、active、grantedBy/At、revokedBy/At；独立授予总部审核员共享申请查看/处理能力，不含 eventId，不关联或派生 `EventGrant` |

草稿 JSON 可以保存尚未最终定型的时间/地点结构，正式提交快照也使用受 DTO 校验的结构化 JSON；字段口径确认后再决定是否拆成列。不可因使用 JSON 放弃长度、时区、格式和必填校验。

### 3.2 正式赛事来源与承办关系

| 对象 | 关键字段与不变量 |
| --- | --- |
| `EventOrigin` | eventId 主键、applicationId unique、approvedSubmissionId unique、createdAt；三者不可变，保证一申请/一获批版本只创建一个赛事 |
| `EventProfileVersion` | eventId、version、name/time/location 快照、sourceType/sourceSubmissionId、createdBy/At；V1 来源为获批提交，后续正式变更追加版本 |
| `EventOrganizerAppointment` | id、eventId、organizationId、sourceApplicationId/sourceSubmissionId、status/effectiveAt、createdBy/At；是机构关系，不含人员 grant |
| `EventInformationAccessGrant` | id、eventId、organizationMemberId、capability=`EVENT_BASIC_INFO_VIEW`、sourceHandlerGrantId/sourceApplicationId/sourceSubmissionId、active、grantedAt/revokedAt；逐人最小查看授权，独立于 appointment、`EventGrant` 和 TaskScope；`unique(eventId, organizationMemberId, capability, source)` |
| `EventOrganizerAgent` | appointmentId、organizationMemberId、职责/状态/有效期；仅在后续经办关系规则确认后实施，不由申请人或基本查看授权自动生成 |

现有 `Event.name` 可作为当前名称投影以兼容已有查询，但初始值必须来自同一获批快照并在事务内写入；时间和地点的正式字段/版本结构待产品口径确认。`EventOrigin` 是创建来源，`EventProfileVersion` 是当时正式信息版本，两者均不能被后续编辑覆盖。

若业务最终确认一个赛事只能有一家承办机构，再增加相应唯一约束；当前不以数据库约束擅自限定主办/承办/协办基数。

## 4. 状态机与命令

状态机必须包含 `IN_REVIEW`：

```text
DRAFT → PENDING_REVIEW → IN_REVIEW → APPROVED       （终态）
                         ├────────→ REJECTED       （当前申请终态）
                         └────────→ NEEDS_SUPPLEMENT → PENDING_REVIEW
                                      同一申请 Vn+1
```

- `saveDraft(expectedDraftRevision)`：允许任一当前有效、同机构且有申请办理权限的经办人保存；CAS 冲突返回最新 draft revision，不自动合并、不覆盖已成功写入。动作记录实际 actor、数据库时间和前后 revision。
- `submit(expectedDraftRevision, expectedApplicationRevision, idempotencyKey)`：同一权限策略下验证当前权威草稿、三项必交资料及其它表单；生成不可变 Vn 和 SUBMIT 动作，submittedBy 取当前 actor 而非 createdBy。
- `startReview(submissionId, expectedRevision, idempotencyKey)`：有独立申请审核权限的总部审核员明确点击后，从 PENDING_REVIEW 进入 IN_REVIEW，记录实际人员、数据库时间和目标版本。打开详情只读，不调用该命令、不改变状态。该动作不创建 owner、领取记录或排他锁，其他有权审核员可接续。
- `requestSupplement(submissionId, expectedRevision, request, idempotencyKey)`：从 IN_REVIEW 进入 NEEDS_SUPPLEMENT；不创建赛事，保存补充要求，当前版本保持不可变，并在同一 applicationId 下允许准备补充草稿。
- `resubmit(...)`：只允许 NEEDS_SUPPLEMENT 的原申请由任一当前有效、同机构且有申请办理权限的经办人从补充草稿生成 Vn+1 并回到 PENDING_REVIEW；记录该次实际 submittedBy，旧版本、附件关系、补充要求和审核动作不可变。
- `reject(submissionId, expectedRevision, reason, idempotencyKey)`：从 IN_REVIEW 进入终态 REJECTED，不创建赛事。该 applicationId 此后拒绝 saveDraft、submit/resubmit 及任何恢复命令，只允许按权限读取历史；另建申请必须生成新的 applicationId，并从 V1 开始。
- `approve(submissionId, expectedRevision, idempotencyKey)`：从 IN_REVIEW 进入 APPROVED 并执行第 5 节原子事务；没有通用 `PATCH status`。

“审核中”和显式开始审核均为已确认规则；GET 详情不得产生状态变更。开始审核不独占，后续 requestSupplement/reject/approve 可由任一当前有权且非本人提交者执行，实际结论人不必等于开始人。所有命令固定 submissionId/version 并记录实际 actor 与数据库时间。驳回和补充必须是不同动作、状态和审计语义：补充沿用原申请生成新版本，驳回终止原申请且不能重新打开状态机。

## 5. 原子获批、幂等与并发

### 5.1 API 输入

通过命令至少携带 applicationId、当前 submissionId、expectedRevision 和 UUID idempotencyKey。服务端从当前会话取得审核 actor，不接受客户端指定 approvedBy、organizationId 或 eventId。

### 5.2 单事务步骤

由申请模块作为用例编排者，通过公开服务共享同一个 Prisma transaction：

1. 开启 Serializable 事务，锁定申请行；
2. 重新加载会话、active 总部成员和独立 `HostingApplicationReviewGrant`；不查询 `EventGrant`。若 actor 是该申请任一提交版本的 submittedBy，则拒绝审核写命令；
3. 读取幂等命令：同 actor/申请/key 且请求 hash 相同则在重新鉴权后返回原 eventId；不同载荷返回 409；
4. 校验申请仍为 IN_REVIEW、revision/submissionId 均为当前值，且 submission 属于该申请和申请机构；
5. 从不可变 submission 快照取得名称、时间、地点和 applicantOrganizationId，不信任审批请求重复传值；
6. 按统一锁序读取并锁定该申请机构在事务时点的 active member + active `HostingApplicationHandlerGrant` 集合，作为本次自动查看授权对象；并发授予/撤销按事务提交顺序决定，不使用请求开始前缓存；
7. 创建 EventScope 与共享 ID 的 Event，并创建 EventProfileVersion V1；
8. 创建 EventOrigin，唯一关联 applicationId 和 approvedSubmissionId；
9. 创建 EventOrganizerAppointment，机构必须等于申请快照中的申请机构，来源必须等于该 submission；
10. 为第 6 步每名有效经办人创建 `EventInformationAccessGrant(EVENT_BASIC_INFO_VIEW)`，来源指向对应 handler grant、本申请及获批 submission；不得创建宽泛 `EventGrant`、角色、MaterialTask、TaskScope 或任务办理授权；
11. 写 APPROVE action、审核决定、application.status/approvedEventId、命令结果和 AuditRecord；
12. 提交事务后才向客户端返回 eventId。

任一步失败全部回滚，包括 EventScope。不得先把申请标成通过，再由队列或前端补建赛事；也不得调用三个彼此独立提交的 HTTP 接口完成批准。若第 6 步集合为空，是拒绝批准还是允许创建无人可看的赛事尚未确认，后端不得自行选择默认行为。

### 5.3 防重复约束

- `EventOrigin.applicationId` unique；
- `EventOrigin.approvedSubmissionId` unique；
- `EventHostingApplication.approvedEventId` unique nullable；
- `EventInformationAccessGrant` 对 event/member/capability/source 唯一；批准重试返回原事件及原授权，不重复插入人员授权；
- 审核结论动作对 application/current submission 建部分唯一约束，APPROVE、REJECT、REQUEST_SUPPLEMENT 冲突时至多一条成功；
- 命令键 `(actorId, applicationId, idempotencyKey)` unique 并保存规范化请求 hash；
- CAS revision 与行锁防两个审核员对同一版本作相反结论；冲突失败返回 409 和重新读取提示，不自动改用新 revision/submission，也不覆盖已提交结果；
- 状态转换约束拒绝从 REJECTED 返回 DRAFT、NEEDS_SUPPLEMENT 或 PENDING_REVIEW；服务层和数据库约束共同防止恢复原申请；
- 唯一冲突只在本命令内读取已提交幂等结果，不自动更换 submission/revision 重试。

预期并发结果：两个相同通过请求只得到同一 eventId；通过与驳回并发仅一个成功，另一个 409；审计或承办关系写入失败时不存在正式赛事。网络丢失响应后用原幂等键重试，不生成第二个赛事。

## 6. 授权边界

新增独立 policy，不复用“能访问 Event”判断申请权限，因为申请尚无 Event：

- applicant policy：要求 active user、active OrganizationMember、active `HostingApplicationHandlerGrant`，且 member/grant/application 的 organizationId 全部相同。列表按该机构过滤；详情、草稿、文件和命令逐对象复核。createdBy 只作历史，不参与放行；
- reviewer policy：要求 active user、active 总部成员及 active `HostingApplicationReviewGrant`。所有满足条件的审核员共享查看全部承办申请及其有权附件，不按 `EventGrant`、eventId 或开始人过滤；
- self-review deny：若 actorId 出现在该 application 的任一 `HostingApplicationSubmission.submittedBy`，则 startReview、requestSupplement、reject、approve 全部拒绝；只读可见性仍按 reviewer policy，避免靠隐藏记录造成共享队列不一致；
- continuation：IN_REVIEW 不保存 reviewOwnerId，不要求结论 actor 等于 start actor；每次写事务重新验证当前独立 grant，撤权后不得靠已打开页面接续；
- approved event basic-view policy：只读取 active user、active member 和 active `EventInformationAccessGrant(EVENT_BASIC_INFO_VIEW)`，仅返回允许的赛事基本信息字段；不得从 appointment、申请办理 grant、申请审核 grant 或宽泛 `EventGrant` 推导该最小权利；
- event/task write policy：赛事修改、审核、材料任务列表/详情/文件/命令继续使用各自现有显式授权和 TaskScope。`EVENT_BASIC_INFO_VIEW` 不满足任何写入或任务 policy；同一人员若另获任务指派，只按该独立来源增加对应能力。

申请方权限矩阵必须覆盖：同机构 active handler grant → 可共享办理；同机构无 grant、grant 撤销/成员停用、仅是 createdBy → 不可继续办理；其它机构即使有 handler grant → 不可列表、深链、文件或写入。审核权限矩阵必须覆盖：只有 EventGrant、没有申请审核 grant → 不可查看/处理申请；有申请审核 grant、没有任何 EventGrant → 可共享查看/处理申请；两者都有 → 各自按独立用途生效。不得在批准时把申请审核 grant 复制成赛事 grant。

获批后权限矩阵必须覆盖：appointment 无人员 grant → 不直接放行；active `EVENT_BASIC_INFO_VIEW` → 只读基本信息；只有该查看权 → 赛事 PATCH/审核/任务列表/任务详情/文件/任务命令均拒绝；另有 TaskScope/现有任务授权 → 只增加对应任务能力。申请通过事务分别写 EventOrganizerAppointment 和每人 EventInformationAccessGrant，任一失败全部回滚。

获批时不创建 EventOrganizerAgent、宽泛 EventGrant 或材料任务。总部后续调用现有任务创建/指派用例建立 MaterialTask/TaskScope 和必要现有授权，继续受原任务权限、截止、版本、附件及历史规则约束；不能因机构 appointment 或 `EVENT_BASIC_INFO_VIEW` 自动扩大任务范围。

系统管理员不因角色自动获得业务申请正文/附件；文件下载、列表、详情、历史和命令逐请求复核权限。无权与不存在对象采用一致拒绝策略，日志不记录申请正文、审核原因、文件名、token 或字节。

### 6.1 后续人员变化建议（非业务规则）

- 新增 handler grant 后不自动扫描并授予该机构全部历史赛事；建议由总部按 event 显式授予，或待业务确认后提供受审计同步命令。
- 撤销 handler grant 时，建议同事务停用由该 grant/获批来源派生的 basic-view grant；授权记录按来源分开，不能撤掉该人员从其它合法来源取得的查看权。
- user/member 停用时，basic-view policy 逐请求检查 active 并立即拒绝；建议同时留存停用时间/操作者。重新启用不自动恢复历史 grant。
- 任何人员授权变化都不修改 EventOrganizerAppointment，不创建、转移或关闭 MaterialTask/TaskScope。

以上仅为最小权限和可审计实现建议。新增人员是否自动继承、撤权是否联动、恢复是否自动重授以及执行主体仍待业务确认，实现前须回写产品规则。

## 7. 文件与版本安全

复用 API 侧私有存储适配、文件名清理、大小/hash/格式和受控代理下载能力，不复用旧业务外键：

1. 申请上传先建 intent，再上传字节并确认；确认时核对真实字节数、SHA-256 和允许格式。
2. 文件归属固定为 application + applicant organization，actorId 记录实际上传人而不是唯一访问者；任一当前有权同机构经办人可在草稿中绑定/移除，写入必须携带 expected draft revision。绑定时再次校验，禁止跨申请、跨机构和跨版本偷绑。
3. 草稿可移除未提交引用并记录实际操作人/时间；已提交 SubmissionDocument、文件核心元数据及版本附件关系 append-only，任何经办人都不能回写。
4. 审核员只能在有权查看对应 submission 时下载；申请方权限变化后按当前 policy 判定，不因曾上传永久开放。
5. 旧材料附件、模板附件和申请附件保持不同关系及下载策略；不迁移、不共用业务 ID。

具体允许格式和大小属于待确认要求；技术上限不得宣传为业务默认。

## 8. 模块与接口边界

后续后端建议落点：

- `apps/api/src/modules/event-hosting-applications/`：申请聚合、状态机、版本、文件归属、审核编排；
- `authorization`：公开同机构申请办理 grant/policy、独立申请审核 grant/policy、撤权和共享事务能力；申请业务草稿/版本仍归申请模块；
- `materials/events` 当前模块：公开可在外部 transaction 中创建 EventScope/Event 的服务；不由申请模块直接访问其私有 repository；
- 新的赛事关系服务：拥有 EventOrigin、EventProfileVersion、EventOrganizerAppointment 和细粒度 EventInformationAccessGrant；基础信息读取与赛事/任务写 policy 分离；可在模块边界确认后独立为 events 域；
- `@caau/database`：唯一 Prisma 入口；前端不得依赖数据库实体；
- `@caau/api-client`：只从 Nest OpenAPI 生成 DTO/请求元数据，再提供平台适配。

接口按用例拆分：新建申请、草稿读取/保存、首次提交、补充后重交、列表/详情、版本历史、上传/确认/下载，以及建议的 start-review、request-supplement、reject、approve；禁止开放客户端可任意写状态、恢复 REJECTED、复用旧 applicationId 新建、或写 eventId/applicantOrganizationId/approvedBy 的通用更新接口。详情 GET 必须无副作用，不能隐式调用 start-review。

## 9. Web 与小程序技术落点

- Admin 新增 `features/event-hosting-applications` 和独立路由；审核命令固定 submissionId/revision，成功响应以服务端 eventId 为准。按钮 pending 时禁重复只是体验保护，数据库幂等才是正确性保护。
- Miniapp 新增独立 feature/pages，不依赖当前 event context；会话变化、离页和迟到响应继续使用 epoch/清理模式，草稿输入与服务端 revision 分离。
- 两端只消费 `@caau/api-client`；不导入 API/Prisma 源码。状态不只用颜色，补充/驳回原因有明确文本，提交和批准显示不可逆后果。
- 是否复用现有约 2 秒轮询由页面体验和负载阶段决定；没有确认通知要求前不承诺实时推送。

## 10. 迁移与兼容策略

1. 只追加 migration；不编辑现有六份迁移或重算历史 checksum。
2. 新表允许 `EventOrigin` 只覆盖新申请创建的赛事；现有 Event 不要求来源行。
3. 不扫描 `EventGrant`、`TaskScope` 或 MaterialTask 回填 EventOrganizerAppointment。
4. 对新 Event 的 EventOrigin/初始 profile/appointment/basic-view grants 使用事务内约束；旧 Event 继续按现有 name/description 查询，不批量给历史人员补授权。
5. 迁移夹具先构造旧赛事、grant、旧整包和单份材料 V1/V2/附件，再升级并比较表投影、数量、文件 hash、权限及重启读取。
6. 发布采用后端/契约先行、页面后接入；前端上线前不把申请接口暴露成半成品入口。失败采用前向修复，不 reset、不删除卷、不改历史迁移。

## 11. 被否决或暂不采用的方案

- **申请时先创建隐藏 Event**：会让未通过申请产生正式赛事或孤立 EventScope，违反确认规则。
- **把 EventGrant 当承办关系**：无法表达机构业务事实、来源和历史，且授权撤销会错误抹去承办事实。
- **用 EventGrant 或正式赛事范围判断申请审核权**：申请在获批前没有 Event；会导致无法审核前置申请或借赛事授权越权读取申请，违反独立审核权限规则。
- **用 ORGANIZER/EventGrant 自动提供获批后查看权**：现有角色/授权参与赛事和任务策略，可能附带修改、审核或任务能力；违反最小只读授权要求。
- **获批时自动创建材料任务**：任务办理人、截止和要求仍应由总部后续明确配置；提前创建会把赛事查看权误作任务责任。
- **申请人自动成为唯一经办人**：把一次提交动作误作长期人员关系，违反确认规则。
- **用 createdBy 作为申请办理权限**：会阻止同机构有权经办人协作，并让已撤权创建人继续访问；创建人只能作为历史字段。
- **审批后依次调用“创建赛事/授权/创建任务”接口**：不能保证原子性，重复点击会产生部分成功和重复赛事。
- **覆盖同一申请记录保存 V2**：会丢失总部实际审核版本及附件证据。
- **从现有任务或 grant 批量推导承办关系**：现有数据语义不足，可能制造错误业务事实。
- **擅自扩充或重新标记申请资料清单**：首版三项必交和一项选交已经提出；不得因格式/大小/数量尚待确认而把整个清单标成未确认，也不得加入未提出材料。

## 12. 实施关口

在进入后端阶段前，至少确认产品规格第 10 节中的申请办理/审核权限授予撤销管理人、批准时无有效经办人的处理、获批后新增经办人/撤权/停用的联动规则、后续材料任务具体配置、资料格式/大小/数量及特殊情况、要求版本配置来源、时间/地点结构和补充材料可改字段/次数/时限。未确认项可以保留在模型扩展点中，但不得用技术默认替代业务决定；获批时为当时有效申请经办人原子授予独立基本信息只读权、不复用宽泛角色、关系与人员授权分记、不自动创建材料任务并沿用现有后续任务规则，以及此前已确认申请/审核规则均不得降级为未确认。本文第 6.1 节及产品规格第 6.1 节的人员变化处理只作为建议，未获确认前不实现自动联动。
