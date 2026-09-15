# ADR-0008：单份材料、赛事共享审核与自动同步

状态：A 技术设计已提交 `7a4aa73`；B 后端本地实现与 PostgreSQL/API 验证完成，模型落地说明见第 10 节。C Web与真实多会话同步验收已完成，见 [Web手册](../runbooks/individual-material-web.md)；D Taro待实施，Web通过不代表小程序/微信验收完成。业务依据为 [CAAU-011 规格](../product/individual-material-review-spec.md) 及 [需求登记](../product/requirements.md) R-014～R-019。

基线：`40a5c80`，工作区干净，从其创建 `codex/caau-012-individual-materials`，不切回缺成果的 main。只做办赛材料，不扩展报名、支付、俱乐部或外部通知。

## 1. 已核验现状及改造边界

| 现状（源码依据） | 改造约束 |
| --- | --- |
| `authorization/policy.ts` 的 taskPolicy 及 `materials/materials.service.ts` 的列表按 TaskScope.reviewerGrantId 判断审核权 | 新版必须同时改列表、详情、审核、附件和同步策略；不能只放开审核按钮 |
| `authorization/authorization.service.ts` 的 assignTaskAnchor 必须提供一名审核员；AssignmentHistory.reviewerGrantId 非空 | 新版指派接口分离经办人与赛事审核授权；不能给历史填造假审核员 |
| `materials/requirements.ts` 要求 1～50 项；发布会冻结 RequirementVersion、模板关联并初始化整包执行 | 新版任务允许零项参考要求；不得修改旧快照或全局放松旧模式验证 |
| `workflow/workflow.service.ts` 按 TaskExecution 行锁处理草稿、整包提交与审核，APPROVED/CLOSED 阻止写入 | 新版独立状态、版本与锁对象；保留任务级截止、generation、交接和关闭控制 |
| FileUpload.materialId 来自配置清单；旧下载依赖当前草稿或 SubmissionAttachment | 不把自由材料 UUID 塞进旧接口绕过绑定校验；新文件归属独立建模 |
| admin.grant.delete 对历史引用授权返回 409；当前 EventGrant 没有 active 字段 | 增加保留 ID 的赛事级撤权，不通过删除历史或停用全部赛事成员权绕过 |
| 五份历史 migration 保护提交、审核、模板、指派及审计；已发布配置有触发器 | 只追加 migration，保留所有旧 checksum；新增 SQL 若替换触发器函数必须写在新 migration 并回归旧保护 |

上述路径均位于 `apps/api/src/modules/`；模型见 `database/prisma/schema.prisma`。以上为 A 设计阶段的源码核查；A 当时只读源码/迁移，B 数据库及文件保留验证另记于第 10 节。

## 2. 旧整包兼容与切换

选择**独立执行模型 + 同一任务管理锚点 + 旧版只读历史**，不将旧整包拆成假单份审核。

1. 追加 TaskMaterialChannel（一任务至多一行）标记新版通道，保存启用者、数据库时间和兼容来源。不改 MaterialTask 已发布配置、RequirementVersion、旧 SubmissionVersion/ReviewRecord/附件/模板或旧指派记录。
2. 新建任务明确选择新版通道，不再要求指定单一审核员或固定清单。使用现有 Event/TaskScope/MaterialTask 作为赛事、机构、经办与模板的唯一锚点；新版不另建重复赛事/机构/截止时间副本。新任务可发布空参考清单，仍必须配置任务截止；可选参考要求/模板沿用发布前管理和发布时冻结。
3. 既有已发布、未关闭且旧执行处于 EDITING/SUBMITTED 的任务，由有权赛事管理员显式启用新版；命令要求 expectedRevision、确认说明与审计，前端预览“旧草稿/待审核整包将只读”。不自动迁移、不伪造退回或通过，旧待审核版本保留当时“待审核”标签，并另显示“旧流程已停止办理”。
4. 启用后旧材料写入口（保存、上传、确认、提交、审核）统一返回 `LEGACY_READ_ONLY`；不能仅靠隐藏页面。旧列表、草稿编辑历史、整包 V1/V2、审核与已绑定附件保持当前授权下只读。旧未完成上传不再确认，但不删除文件。
5. 旧 APPROVED/CLOSED 任务不隐式开启新版；保留只读。需要新的办理任务时由管理员显式在同赛事新建，不自动复制历史或批准结果。尚未启用的旧任务在分阶段开发期间保持原流程；新版正式切换时必须列出未启用存量，不能让用户误认为全部已改造。
6. 新版材料从空草稿起步。旧草稿和内容仍可查阅，使用者可自行录入；首期不提供自动拆包、批量复制、跨机构迁移或复用旧附件 ID 的入口。需要新提交附件时重新上传，不改变旧字节或作者。
7. 旧只读历史沿用原访问范围（原任务审核指派、当前经办、有权赛事管理员，仍按对象区分：审核员不能读草稿）；新增赛事审核权不自动扩大对旧整包及草稿的访问。新版共享队列只展示新版正式提交，兼容入口明确区分两种范围。
8. 旧模板继续由当前经办按原模板权限下载，新版可以参考但不必选择模板。新版提交不可把模板下载权传给审核员，也不可绕过旧模板限制。

旧草稿转成新版材料的自动转换、旧已通过任务重开均不在本次技术默认行为内。该兼容策略先保全业务含义，避免把旧审核误说成当时已逐份审核。

## 3. 权限与任务管理

### 3.1 授权映射

- 新版审核权使用现有 EventGrant → active OrganizationMember(role=REVIEWER) → active InternalUser，严格匹配材料所属 eventId；已有显式赛事审核授权可直接映射，不扫描总部账号后批量授予全部赛事。
- 延续当前角色模型：REVIEWER 是总部审核角色；不存在已实现的 Organization.kind=HEADQUARTERS，不凭组织名称判断总部。创建角色/授权仍走受审计管理入口，不允许用户自授角色。
- 系统管理员只有账号/授权管理能力，不自动获得业务查看或审核。赛事管理员有范围内管理/提交历史查看权，不因管理身份获得审核权。审核员不读未提交草稿。
- 当前指派的 active ORGANIZER 才可新增、改草稿、上传、提交及读自身任务历史；同机构未指派成员不自动获得权限。
- 延续冲突角色防护：含 ORGANIZER 身份的用户不能通过第二角色查看其它机构或审核；审核员不能审核本人或自己 active 成员关系所属承办机构的材料。
- 查询列表必须直接带授权过滤，详情/历史/文件/同步必须复核对象关系；客户端传 eventId/taskId/materialId 不能作为授权依据。对不存在和无权对象采用一致拒绝策略，不返回最新状态、总数或文件名供枚举。
- 通过 authorization 模块公开策略与事务服务参与用例，不在 UI/api-client 实现权限真相。旧 taskPolicy 保留旧语义，新版策略显式命名，避免全局替换造成旧数据扩权。

### 3.2 可撤销赛事授权

追加 EventGrant.active（旧值回填 true），新设带审计的启用/撤销接口，不物理删除受历史引用的 ID。所有旧/新策略、列表、指派校验同步检查 active；处理器授权撤销后旧人立即无法继续办理，不能遗漏旧下载入口。

成员/用户停用、会话注销/过期继续生效。逐请求鉴权，写事务取得锁后重新验证；撤权与业务请求并发按数据库事务顺序线性化，不宣称可以追回已下载的数据。撤权提交后新发起的请求必须被拒绝；已在传输的已授权响应无法追溯撤回。不得仅缓存开页时角色或永久保留长连接授权。

### 3.3 截止、交接、关闭

- TaskExecution 仍是同一任务的有效截止、generation 和关闭状态来源，新通道不另存可编辑的平行截止。旧整包状态与单份状态不做互相映射；新版页面显示五种材料状态，任务关闭独立作为只读原因，不增加第六种材料状态。
- 自由新增材料未绑定参考要求时，仅取 `deadlines.task`；可选关联本任务冻结要求时，提交取任务截止与该项当前截止的较早值。关联由服务端校验，首次提交后不可切换，以免退回重交逃避原要求；名称/类别自由不等于免除已选要求。
- 不关联要求的附件受技术能力限制（当前 txt/pdf/png/jpg/jpeg、10 MiB）；关联要求时取技术能力与冻结配置交集/较小上限。技术限制不是已确认业务默认；不自动把任意参考项的限制应用到全部自由材料。
- 草稿保存允许逾期；正式提交在持锁后读取 PostgreSQL `clock_timestamp()`，必须严格早于有效截止，等于也拒绝。提交版本记录当时的有效截止、来源要求及 generation。退回不延期，审核操作不受提交截止限制。
- 延期仍由当前赛事管理员执行，复用 DeadlineHistory 的旧新完整映射、原因、人、服务器时间；新版材料动态读取同一映射。延期与提交争用任务控制锁，避免读到一半更新。
- 同机构交接复用同一 TaskScope 和 generation，记录新指派历史但不改旧作者。已绑定确认附件由新经办接管；旧 generation 的未完成意图失效，不能借旧授权继续确认。客户端保存/提交携带 generation，旧页面必须 409/403 后重新核对。
- 新版指派历史使用独立经办交接记录（审核授权不再属于指派字段），不向旧 AssignmentHistory 强填 reviewerGrantId。所有调用旧 assignTaskAnchor 的新通道分支须拆开，包括发布、交接、详情中 reviewer 非空断言。
- 关闭统一作用于任务两种通道，不删除历史，不修改材料已形成的状态/结论。跨机构必须关闭原任务、另建新任务，不提供材料/文件复制 API。

## 4. 单份模型及数据库不变量（拟追加）

以下保留 A 阶段的逻辑对象设计；B 阶段实际表名与合并落点见第 10 节，不应把每个逻辑对象都当成一张独立表。

| 对象 | 核心字段与约束 |
| --- | --- |
| TaskMaterialChannel | taskId 唯一外键；启用人/时间/来源；新版任务发布配置模式，不修改旧发布快照 |
| IndividualMaterial | id、taskId、organizationId、可选 requirementItemId；五态枚举、revision、draftRevision、currentSubmissionId、nextVersion；创建人/时间；task/organization 不可改 |
| IndividualDraft / IndividualDraftEdit | 一材料一当前草稿；名称、类别（可空）、说明、附件关联；每次保存快照与 revision/actor/time，不可变编辑历史；退回保留来源提交 |
| IndividualSubmission | materialId、taskId、version、名称/类别/说明快照、提交人/数据库时间、generation、有效截止/要求引用；unique(materialId,version)，复合键约束当前指针与任务归属 |
| IndividualUpload | materialId/taskId/organizationId/generation/actorId、私有 object key、原文件名、大小/hash/格式、状态/过期；确认后核心元数据不可变；不复用旧 FileUpload.materialId 语义 |
| IndividualDraftAttachment / IndividualSubmissionAttachment | 显式关系；同材料/任务复合外键，禁止跨材料/跨机构绑定；提交关联 append-only |
| IndividualAction | materialId/submissionId、revision、action、from/to 状态、actual actorId、数据库时间、退回原因/修改要求；唯一(materialId,revision)，append-only |
| IndividualDecision | submissionId 唯一、对应通过/退回动作；确保同版本只有一个终局结论 |
| IndividualCommand | actorId/materialId/key 唯一、规范化请求 hash、动作、结果 version/revision；append-only，重试不生成新动作 |
| IndividualAssignmentHistory | taskId、前后 handlerGrantId、前后 generation、人/时间/原因；append-only；不制造单一审核指派 |

- 五态：`DRAFT` 待提交、`PENDING_REVIEW` 待审核、`IN_REVIEW` 审核中、`RETURNED` 退回修改、`APPROVED` 审核通过。打开详情只读。
- DRAFT/RETURNED 可存草稿；提交单份生成 V1/V2 并变 PENDING_REVIEW；开始审核变 IN_REVIEW；任一当前有权审核员可通过/退回。不要求操作人等于开始人，不设 owner/租约/永久领取锁。
- IN_REVIEW 再点开始返回冲突，不伪造第二次开始；乙可以直接形成结论，实际乙写入最终动作。退回要求原因、修改要求均非空且限制长度。APPROVED 不可修改/隐式重开。
- 每一步创建/保存/提交/重交/开始/结论以及管理操作记录实际人和服务器时间。正式流转动作必须有目标提交、前后状态；界面显示稳定 ID 与当前姓名，不因改名改写历史 actorId。
- 正式提交要求该份有非空说明或至少一份已确认、有效绑定的附件；不要求其它材料存在/提交。名称必填，类别开放，不预置固定五项。
- 追加不可变触发器覆盖 UPDATE/DELETE/TRUNCATE；runtime 只获明确 SELECT/INSERT 或当前状态所需 UPDATE。外键与延迟约束校验 submission/current 指针、版本、结论和状态一致；删除级联不用于历史。
- 用户输入有长度/数量/字节上限，列表/历史分页。上限作为技术防滥用参数明示，不充当业务清单要求。

## 5. 写事务、并发与幂等

用例由新 `individual-materials` 模块编排，沿用 authorization.run 的 Serializable、失败关闭、有限串行化重试与同事务审计；Prisma 入口仅在 @caau/database。

统一锁序：任务控制行 → 材料行 → 文件/版本；同一任务控制读用共享锁，延期/交接/关闭用排他锁，新版材料写再取得自身行排他锁，使不同材料不互相等待整包内容。旧流程独占任务锁与新通道启用同序。所有路径（包括授权变更与管理操作）须按一致顺序复核，避免锁后继续使用事务前对象。

命令流程：鉴权 → 持锁并重载 actor/当前授权 → 检查通道/关闭/generation → 校验幂等键 → expectedRevision/expectedSubmissionId → 状态/截止/附件 → 新快照、动作、结论/命令结果、CAS 更新 → AuditRecord → commit。串行化重试必须重跑授权及版本比较，绝不能自动用最新 revision 替换调用方预期。

- 创建使用调用方生成的 materialId UUID、幂等键及请求 hash，命令唯一键含 actorId/materialId/key；首次创建同时写入结果，禁止与其它任务已有 materialId 碰撞后返回其数据。响应丢失重试不创建两份材料。
- 保存草稿 CAS 使用 draftRevision；正式提交同时校验 material revision、draftRevision 和 generation。开始/结论必须指定当前 submissionId 与 material revision。
- 所有正式流转支持幂等键；同人同键同请求返回原结果（另返回当前状态），同键不同请求 409。重试仍先验证当前权限；撤权者不能靠命令结果缓存读回数据。
- 相反结论同发：唯一结论约束和 CAS 只能成功一次。后来请求返回结构化 409 `{code,current:{id,revision,state,currentSubmissionId},message}`；组装 current 前再次鉴权，已撤权则只给 401/403，不能泄露状态。
- 审计或任一历史写入失败整事务回滚，不能产生可读新状态。日志只含允许列表 ID/枚举/修订号，不含任意正文、原因、令牌或文件字节；完整业务原因存在受授权历史表。
- 上传沿用已验证 PrivateStore 字节/hash/格式验证、安全文件名、私有代理下载，不公开对象路径；流式写入失败残留不算确认或绑定。本轮不自动清理历史文件、不将魔数校验称为杀毒。

## 6. 自动同步方案

### 6.1 首期选择：短轮询权威快照

Web fetch 与 Taro.request 共用 `@caau/api-client` 无平台状态协调器；首期不新增 WebSocket、SSE 或 Redis 依赖。每个可见页面前台约 **2 秒**一次顺序轮询批次，前一批完成再排下一批，不重叠；写成功后立即触发刷新。轮询是自动近实时拉取，**不是服务端推送或零延迟承诺**。

选择理由：现有 opaque bearer 会话与 Taro JSON 请求直接适配，逐次鉴权、断线恢复及多 API 实例不依赖进程内广播。浏览器 EventSource 的鉴权适配与微信 SSE 解析需额外平台验证；WebSocket 还需握手/重连/代理/跨进程分发和连接撤权。当前规模未给定，先用正确、可验证的拉取实现，不把未验长连接当已支持。

不引入增量事件游标或内存事件总线作为正确性前提，也不使用自增 ID 充当全局 commit 顺序（事务可能倒序提交）。持久动作表保存完整历史，snapshot 只读取已提交事务，故回滚的变化不会被通知到页面；进程提交后崩溃仍能在下次轮询读到。这是本方案对“事务成功后通知”的实现，短暂中间状态由历史完整呈现，不保证每一步都在屏幕停留一个轮询周期。

### 6.2 快照与授权

- 新 `GET /api/v1/individual-materials/snapshot` 返回当前授权下的列表页、总数、serverTime，以及可选选中材料的状态、当前提交概要、最新动作和历史页；详情字段与列表在同一短读事务快照中获取。身份由 header 决定，不接受任意 actorId 订阅。
- scope/filter/page 是输入，不是授权。每次重算有效赛事范围；审核列表只含已正式提交材料，不暴露未提交标题/数量/附件。草稿只通过经办或有权管理详情接口读取，不随审核同步传送。
- 响应 `Cache-Control: no-store`，token 不放 URL。不得在“无变化”判断前跳过鉴权，也不能用全局 maxRevision 透露其他机构变化。首期每次返回受限页权威数据，不依赖全局游标。
- 分页队列默认包含待审核/审核中，返回当前过滤条件下总数和更新时间；页内更新与总数自动更新。历史页可按单份 revision 触发补读；切页/改筛选立即重查，分页不承诺保留旧快照位置。
- 从 API 错误中区分 401（整个身份失效）与 403（选中对象撤权）。401 停止轮询并清除受保护视图；403 清除目标详情/文件缓存，重新获取可访问队列，不误注销仍对其它赛事有权的身份。空授权队列返回空内容，不保留被撤权条目。

### 6.3 客户端一致性、断线与输入保护

- requestEpoch 绑定 sessionEpoch、scope/filter/page 和页面生命周期；换身份/离开/重新认证时递增并取消请求或丢弃迟到响应。队列整页采用最新请求结果，不能只比较单份 revision 而漏掉撤权删除。
- 详情同材料 revision 只前进不倒退，task context revision/generation 另比较以捕获延期/交接/关闭；重复响应不追加重复历史。旧写响应也受 epoch/revision 门控，不覆盖较新的自动快照。
- 权威状态与本地 editor buffer 分离；远端草稿 revision 改变时提示“有新版本，请核对”，保留本地输入但阻止盲目覆盖。在线状态/历史更新不重新初始化表单。发生撤权或换身份时必须清掉受保护内容，不为了保输入把旧机构数据显示给新人。
- 网络失败/超时立即显示“同步中断，展示上次成功数据”及最后同步时间，禁用正式提交/审核；不自动重放写命令。重试间隔从 2 秒指数退避至 30 秒并带抖动。未知写结果允许显式沿用原幂等键重试，不自动制造新命令。
- Web visibilitychange/online 及 Taro useDidShow 回前台立即重新鉴权、全量获取当前范围与所选材料再解锁；hidden/useDidHide/卸载停止定时器，废弃在途结果。网络事件只是提示，不能替代成功 HTTP 作为已连接依据。
- 同一页面保持一个协调器；首期无跨标签页共享缓存，真实独立会话测试以服务端为唯一汇合点。小程序后台不承诺同步，不等于订阅消息或离线通知。

### 6.4 延迟、负载与后续准入

2 秒是首期技术调度参数，拟验收前台本机多会话可见延迟 p95 ≤5 秒，不是已测结果或生产 SLA。记录样本量、commit/成功响应至另一浏览器 DOM 更新的测量方法、p50/p95/max；仅使用响应时间测量时必须标明不等于精确 commit 延迟。断线恢复另报 online/show 至完成权威获取时间。

持续轮询须限制页大小、过滤范围和响应体，不传全部附件/历史。沿用审计策略时一次轮询会产生读审计，实施阶段必须测请求量与审计增长；不得无声绕开审计。多会话仅代表功能验收，生产并发规模/限流/审计保留策略另定。若负载不合适，再追加 ADR 引入仅发送失效提示的推送 + 持久恢复；不得为掩盖慢同步降低验收或隐藏断线状态。

官方能力核对（本设计阶段）：Context7 `/nervjs/taro-docs` 已检索 RequestTask.abort、useDidShow/useDidHide；来源为 https://docs.taro.zone/docs/apis/network/request/RequestTask 、https://docs.taro.zone/docs/hooks 。这仅证明文档存在相关 API，不证明本项目微信运行通过；实现仍以锁定 Taro 4.2.1 类型/构建及开发者工具、真机实测为准。

## 7. API、模块与页面实施清单

先 Nest DTO/控制器，再 contract:generate；不手改三份契约生成文件。建议接口组：

- 任务管理：创建/发布新版任务、启用旧任务新版通道、单独管理赛事审核授权；延期/同机构交接/关闭按通道分支复用公开服务。
- 材料：列表/snapshot、创建、详情、草稿读取/保存、版本/动作历史。
- 命令：`submit`、`start-review`、`approve`、`return`；没有通用 `PATCH state`。
- 文件：新版 upload intent/content/confirm 和 info/content 下载；复用存储适配但独立对象归属；旧模板下载 API 原样保留其权限。
- DTO 清楚区分旧整包和新版单份、material revision/draftRevision/context revision、五态、typed conflict 和幂等重试结果，不直接暴露 Prisma 实体。

实现落点：新业务模块 `apps/api/src/modules/individual-materials/`，authorization 公开策略/授权事务，materials 管发布和模板，workflow 管现有任务控制/旧历史；模块不得直接修改其它模块私有实现。前端只消费 api-client；同步协调器无 React、Nest、Prisma 或 Node 依赖，平台取消/生命周期各自适配。

Web 在现有工作台新增单份材料入口与共享队列，不重做整站视觉；审核详情显式“开始审核”，审核中显示开始人及实际后续动作，允许另一审核员提交结论。旧整包历史独立标签，不能显示假五态。承办联调入口仍标为 Web 联调。

Taro 保留待办/赛事/我的三导航，任务内自由新增材料、按单份编辑/附件/提交，展示独立五态、退回意见和版本历史；隐藏或后台停止轮询，返回立即同步。无未保存输入时可更新表单，有输入时只更新权威区和冲突提示。

状态不能只用颜色；Web 使用单个有上下文的 role=status 通报更新，不每两秒抢焦点或重复朗读整页。退回校验在字段旁显示且可键盘定位，触控目标至少 44px。沿用现有 AntD/Taro 样式，不新增设计系统或依赖。此交互建议已用 ui-ux-pro-max 的 contextual live badge/error summary 条目核对；不是无障碍实测。

## 8. 迁移与发布安全

1. 迁移前保存**脱敏摘要**：旧五份 SQL checksum、旧表全行摘要/数量、旧对象 ID 与字节 hash、V1/V2/模板关联；不打印或提交正文/凭据。先在隔离 test 临时库构造合成旧数据并升级。
2. 只追加新表、可撤权列、所需约束/索引与权限；兼容通道显式启用，不全量重写历史。新 migration deploy/status/重复 deploy/diff 和触发器反例必须通过。
3. 旧五份 SQL 字节不变；旧行（除明确新增列的默认投影）与私有字节摘要一致；旧草稿/版本/附件/模板/审核重启后仍可按原权限读取。
4. 阶段后端未验收前不将 dev 存量启用新版；前端未完成时不得把半成品作为唯一入口。正式切换须协调 API 与两端版本，旧客户端写新版任务收到明确升级/只读错误，不能双写。
5. 故障先关闭新版入口并前向修复，不删除新表/卷、不重写迁移、不降级到可重新写旧整包的旧二进制。已产生新版数据时不自动回退旧流程。开发库迁移在 test 验收后执行 deploy/status 并重复摘要对比，不使用 reset。

## 9. 分阶段验收门槛

| 阶段 | 交付 | 必须提供的证据 |
| --- | --- | --- |
| A 技术设计 | 本 ADR、roadmap 任务/范围/验收、本地设计提交 | 链接/路径、Git 差异；业务验证标未运行 |
| B 后端与迁移 | 独立模型/文件/状态机、共享授权及撤权、任务管理兼容、快照 API/生成客户端 | 真实 PostgreSQL/HTTP、升级保留、全部状态与幂等/冲突/审计失败/越权；工程回归 |
| C Web 与同步 | 共享队列、单份办理/审核/历史、同步协调器、旧历史只读入口 | 多独立浏览器会话真实操作、断线/乱序/权限和输入保留、延迟报告 |
| D Taro 与平台 | 单份材料页面、前后台同步和失败恢复 | 小程序构建/请求测试；开发者工具与真机分别记录，缺资源不冒充通过 |

真实验收矩阵（B～D 待执行）：

- 两赛事、两机构、甲乙两有权审核员、无权总部、system、经办及同机构未指派者；分别测队列/详情/命令/草稿/文件/模板/同步的范围。
- 自由建两份，提交一份不依赖另一份；甲开始、乙通过；另一份甲开始、乙退回、承办 V2、再次开始并通过，逐步核对原人/数据库时间/前后状态/版本。
- 两独立 HTTP 会话同时相反结论：只一个 2xx、另一 409 带有权当前状态、恰一终局/动作；同时开始、同键重复/不同载荷、丢失成功响应重试也覆盖。
- 保存/提交与截止、延期、交接、关闭、审核权撤销并发；验证旧页面 generation 冲突、新人接管/旧人拒绝和无跨机构文件绑定。
- 三个独立浏览器上下文连接真实 API/隔离 PostgreSQL，不用 route mock 替代成功闭环；自动同步提交/开始/退回/V2/通过，量化延迟。其它未提交草稿不得进入审核队列。
- 阻断网络后可见断线，恢复后自动回到权威状态；有控制地延迟/重复旧响应验证不会倒退；重新认证/换身份后旧响应不得复活数据。故障注入须标注，服务端操作仍真实提交。
- 保留未保存输入测试与撤权清理测试分开：有权远端变更不覆写输入；撤权后清受保护视图、无后续成功下载，恢复授权后重新查询，不复用旧 scope 缓存。
- 撤销单赛事审核权不影响其它赛事；注销、会话过期、用户/成员停用、同机构冲突均真实验证。旧授权 ID 及全部历史保留。
- 审计 INSERT 失败、事务回滚无可见同步变化；API 重启后新旧版本与文件 hash 保持；不可变表普通 owner DML/runtime 篡改均拒绝。
- 微信开发者工具验证真实页面/请求/文件选择上传下载/前后台/双会话状态；真机在合法 HTTPS 与有权 AppID 上另测网络切换/返回前台。游客页渲染或 Node 请求替身不能完成此项。

A 阶段当时不执行数据库写入、不构建或运行新业务。各阶段失败、修复、未运行项及环境阻塞在 roadmap 留证，不能把 CAAU-005 的旧通过记录算作新版验收。

## 10. B 后端实际落地与技术细化

追加 `202609160001_individual_materials`，不修改旧五份 migration。为避免同一份可变内容/审核结果有两份真相，逻辑对象收敛为八张新表：TaskMaterialChannel、IndividualMaterial、IndividualSubmission、IndividualAction、IndividualCommand、IndividualUpload、IndividualAttachment、IndividualAssignmentHistory。

- 当前草稿保存在 IndividualMaterial.draft JSON，draftRevision CAS；每次 CREATE/SAVE 的完整内容快照保存在不可变 IndividualAction.detail。等价承担原逻辑 IndividualDraft/IndividualDraftEdit，不另外维护可漂移的草稿表。
- 当前草稿附件 ID 在受 CAS 保护的 JSON 中，绑定/提交/下载逐份校验真实归属、generation、确认和字节；不可变提交关系为 IndividualAttachment，用 materialId/taskId 复合外键防串材料，不复用旧 FileUpload。
- IndividualDecision 合并进 IndividualAction：PostgreSQL 部分唯一索引限制每 submissionId 至多一条 APPROVE/RETURN；提交版本、动作、命令、附件关系和经办历史均有 UPDATE/DELETE/TRUNCATE 不可变触发器。延迟约束要求材料当前状态/指针/修订与不可变动作、提交一致，状态不可绕过动作直接推进。
- 保留旧公开服务边界：materials 创建/配置/发布新任务，authorization 管指派/撤权及其历史，workflow 管任务有效截止/generation/关闭；新模块仅编排同一授权事务。新版经办指派不要求 reviewer，TaskViewDto 明示 reviewerMemberId 可空及 individualChannel，B段的Web仅做此兼容；C段另交付新版页面，不回写B段的历史验收结论。
- EventGrant.active 追加默认 true，审计撤权接口保留 ID。原单人策略和新赛事策略分开，均检查 active；新指派历史引用的 grant 也不能通过旧 DELETE 入口删除。针对同键并发创建的唯一冲突只在该幂等用例内有限重试，不自动换 revision 或扩大其它授权命令重试。
- snapshot 队列/selected/最新动作在同一短事务读取；历史使用独立分页接口并返回 materialRevision/serverTime，让后续客户端可以丢弃迟到结果。不把全部历史放入每次轮询。审核员默认队列为待审核/审核中，显式 state 可查有权历史状态。
- DTO 提供实际 actorId、当前姓名与原时间，不返回私有 storageKey。客户端仅增加生成 query 参数编码及已验证契约的 409 详情，不实现轮询/页面状态机。

真实证据：`db:test` 41 项通过、零跳过；包含 005→006 升级后 23 张旧表投影摘要、五 checksum、合成旧 V1 RETURN/V2 PASS 和模板/附件字节保留，重启后新旧 HTTP 读取；新版五态/甲乙接续、并发相反结论/保存/开始及同键创建/提交、截止/延期/交接/关闭、撤权/停用/注销/过期/机构冲突和审计失败回滚。当前锁定 Prisma7 的 Serializable/P2034 有限重试做法已通过 Context7 `/prisma/web` v7 事务文档核对；无依赖升级。

本机 dev 在 test 通过后执行 5→6 deploy/status；23 张旧表、6 个私有对象、旧五 checksum 摘要一致，未启用存量新通道、未 reset/删卷。命令/接口和限制见 [单份材料后端手册](../runbooks/individual-materials.md)，详细检查与失败修复见 roadmap。

## 11. C Web 实现细化

协调器放 `@caau/api-client`，不依赖React/DOM/Taro；Web只适配文件读取/下载、visibility/online与表单。读取批次先显示逐对象已鉴权的snapshot，再并行读取身份/任务目录，历史按revision补读；避免串行目录/历史阻塞状态可见。完整批次核对成功才标为在线。写成功递增epoch，丢弃较早快照；会话、选择、生命周期变化亦隔离迟到读/文件结果。403及角色/草稿权限降级清理缓冲、历史、意见与未确认命令，再重查剩余范围。

审核确认固定revision/submissionId；未知结果保留原幂等键/完整载荷，只有显式重试。CAS冲突保留本地输入并要求人工核对，不随轮询替用户保存。正文、分类、附件和CREATE/SAVE快照及不可变提交历史按原权限显示；新页的旧整包入口没有写控件。

真实独立Chromium/PostgreSQL验收、失败修复、样本口径和截图以 [Web手册](../runbooks/individual-material-web.md) 为准。短样本本地p95并非生产SLA，长期轮询审计容量/规模压测、Taro与微信平台仍未验。

B 尚不证明：前台 2 秒轮询、真实多浏览器可见延迟、断线/乱序恢复/输入保护、微信开发者工具/真机或生产负载。下一阶段须按第 6/9 节实现并实测，不能只凭 snapshot200 或定时器配置宣布完成。
