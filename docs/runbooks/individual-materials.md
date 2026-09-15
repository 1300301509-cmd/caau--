# 单份材料后端操作与阶段验收（CAAU-012 B）

状态：后端本地交付，Web/Taro 单份页面与轮询协调器待 C/D 阶段。方案见 [ADR-0008](../adr/0008-individual-material-review.md)，实际检查见 [roadmap](../planning/roadmap.md)。旧整包入口和历史不等于单份入口；不自动启用存量任务。

## 环境与安全

沿用 [数据库操作文档](database-contract.md)、[本地身份操作](authorization.md) 和 [旧任务操作](material-tasks.md)。官方 Node24.20.0/pnpm10.32.1；保持本地 opaque 会话模式，不是正式微信登录。所有业务接口均需 bearer header，每次重新验证会话/用户/成员/赛事授权；禁止把令牌放 URL。

追加迁移 `202609160001_individual_materials`；旧五份 migration 不变。隔离 test 上通过 deploy/status/重复 deploy/diff、升级保留及真实 API 检查后，本机 dev 已执行 deploy/status（5→6），23 张旧表的旧字段投影/行摘要、6 个私有对象字节及五份旧 checksum 一致。没有 reset/删卷/跨机构迁移，没有自动创建或启用 dev 新通道。凭据和保留摘要仅在忽略的 `.local/`，不提交或输出数据正文。

其他环境不能把本机结果当作已升级。先备份和验证该环境保留摘要，再显式执行迁移；发现漂移停止调查，不接受 reset。不要把新代码连接到未升级数据库后据 health200 宣称业务可用。

## 新任务与旧任务切换

下列路径均相对于 `/api/v1`，具体字段/枚举来自 Nest `/api/openapi.json` 及 `@caau/api-client`。

1. 总部有权赛事管理员 `POST /individual-material-tasks`：eventId、organizationId、handlerMemberId、title。返回任务 id；创建 DRAFT 和独立通道，不需要 reviewerMemberId。
2. 复用 `PATCH /material-tasks/:id/requirements` 配置 `{expectedRevision,requirements:{deadline,materials:[]}}`；新版允许空参考清单，旧模式仍不允许。可配置可选参考要求及发布前模板，格式/大小不能超过现有技术能力。
3. 复用 `POST /material-tasks/:id/publish`，传 expectedRevision，冻结要求/模板并初始化任务控制数据。详情的 `reviewerMemberId` 可空，`individualChannel` 表示新通道；Web 本轮仅补了空审核员文案兼容，没有单份办理页面。
4. 对既有 EDITING/SUBMITTED 的已发布任务，管理员可显式 `POST /material-tasks/:id/individual-channel`，传任务执行 expectedRevision 和 reason。启用后旧草稿保存/上传/确认/整包提交/整包审核返回 `LEGACY_READ_ONLY`；旧数据不拆包、不伪造逐份结论。旧 APPROVED/CLOSED 不可启用。
5. 启用后旧版本、草稿历史、附件仍按旧范围只读：当前经办、原任务审核员、有权管理员，审核员仍不读草稿。新赛事审核员不因此获得旧整包访问权。存量未启用任务暂保持旧流程，发布切换由后续页面阶段明确引导。

经办交接/延期/关闭继续使用原任务控制接口；新通道交接不强填旧单一审核员，使用新的经办历史。新通道不使用旧发布前 assignment 接口；创建时选择经办，发布后的同机构交接按现有命令执行。跨机构仍关闭重建，不能复制原文件。

## 单份材料接口

| 操作 | 路径 / 主要请求 |
| --- | --- |
| 新增 | `POST /individual-materials`：调用方 UUID id、taskId、UUID key、content；可选 requirementItemId |
| 保存草稿 | `PATCH /individual-materials/:id/draft`：expectedDraftRevision、generation、content |
| 正式提交 | `POST /individual-materials/:id/submit`：key、expectedRevision、expectedDraftRevision、generation |
| 明确开始 | `POST /individual-materials/:id/start-review`：key、expectedRevision、generation、submissionId |
| 通过 | `POST /individual-materials/:id/approve`：同开始命令字段 |
| 退回 | `POST /individual-materials/:id/return`：同上，另需非空 reason、modification |
| 历史 | `GET /individual-materials/:id/history?offset=0&limit=20`，返回 materialRevision、serverTime、动作与提交版本分页 |

content 为 `{title,category,text,fileIds}`：title 必填，category 可空，text 与附件至少一项在提交时非空。创建时 fileIds 必须为空，先取得材料 ID 再上传；单份提交不依赖其它材料或参考清单是否全部完成。

五态严格由命令驱动：DRAFT（待提交）→PENDING_REVIEW（待审核）→IN_REVIEW（审核中）→APPROVED（通过）或 RETURNED（退回修改）；RETURNED 存草稿状态不变，重新提交生成 V2 后回待审核。打开详情不会开始审核。开始人不占有材料，乙可接续甲的审核。通过后不开放修改/重开。

正式流转命令返回 resultRevision、resultSubmissionId 和 current。未知提交结果重试必须保留相同 key 与载荷；同键不同载荷 409。并发操作只有一个生效，业务冲突返回 `INDIVIDUAL_CONFLICT` 或 `IDEMPOTENCY_MISMATCH` 与有权可见的 current；已撤权只返回 401/403。部分任务级冲突只返回通用 409，不保证有 current。客户端门面仅在 409 详情匹配生成契约时提供 `ApiError.detail`。

自由材料取任务有效截止；可选关联要求时取任务与该项较早截止，关联创建后不可改。上传亦取技术能力与该项限制的交集。逾期可保存，禁止提交；延期待由管理员显式执行 `newDeadline` 命令，退回不会自动延期。

## 文件与审核授权

- `POST /individual-materials/:id/uploads` 创建意图，字段 originalName、extension、expectedBytes、sha256、generation。
- `POST /individual-uploads/:id/content` 上传 `application/octet-stream`，再 `POST /individual-uploads/:id/confirm` 核验真实字节/大小/hash/格式。确认前不绑定；确认不等于已提交。
- `GET /individual-uploads/:id/info` 与 `/content` 每次鉴权；仅当前有权可见草稿或历史提交中的已绑定文件可读，审核员不能读草稿附件。JSON 返回不暴露 storageKey。模板继续走旧独立权限，只有当前经办可下载，不把模板权限扩大给审核员。
- 同机构交接后已绑定文件由新经办接管，旧 generation 的未完成上传不能继续确认。没有自动删除文件/垃圾回收；格式特征检查不是杀毒或生产存储安全验收。
- 使用 `authorization/event-grants` 为 REVIEWER 成员授予具体赛事权；不会自动授权全部总部账号。`PATCH /event-grants/:id/active` 由 SYSTEM_ADMIN 做保留 ID 的撤销/恢复，正文 `{active:false}` 或 true；历史引用不物理删除。所有旧/新策略及列表检查 active。
- SYSTEM_ADMIN 不自动有业务阅读/审核权；ORGANIZER 不能自审或借第二角色跨机构，审核员所属承办机构冲突也拒绝。

## 前台轮询接口（尚无轮询页面）

`GET /individual-materials/snapshot` 支持可选 taskId、selectedId、state、offset、limit（默认20、上限50）。返回短事务内一致的队列页/total、selected 详情及最新动作、serverTime；详情包含 revision、contextRevision、generation、closed、当前不可变提交与实际操作人 ID/当前姓名/时间。

审核员未传 state 时默认待审核/审核中；显式 state 可查询有权历史状态。selected 可指向该队列过滤之外但仍有权的材料。审核员收到 draft=null，不返回未提交材料及其数量。历史单独分页接口在自身事务内读取并标记 materialRevision，客户端不能把迟到的历史结果当成较新状态。

接口逐次鉴权、no-store，没有事件游标、WebSocket/SSE 或进程内广播依赖。提交/动作与审计同事务提交后才能被下一次快照看到，重启也可读。`@caau/api-client` 已支持生成契约的 query 编码。

**本阶段没有实现 2 秒定时器或前后台生命周期。** C/D 阶段还必须实现 request/session epoch、取消与迟到响应丢弃、编辑缓冲分离、断线退避/连接状态、回前台重查及撤权清理。不得仅用此接口存在或返回200声称已自动同步；p50/p95/max 延迟、断线恢复和未保存输入保护都要真实多会话页面实测。

## 实际验收与未验边界

- `db:test` 41 项全部通过，零跳过：旧权限/整包/浏览器/数据库故障恢复回归，新增五态、独立提交、共享接续、并发保存/开始/相反结论、并发同键创建/提交、版本/动作/附件不可变、审计失败回滚、引用截止与文件限制、延期/交接/关闭、撤权/停用/注销/过期/同机构冲突及跨赛事机构隔离。
- 升级 fixture 在旧五次迁移上建立合成 V1 RETURN/V2 PASS、模板和真实私有字节，再应用第六次迁移；23 张旧表摘要及五 checksum 不变，重启后旧提交、附件、模板 API 可读。新版也验证 API 重启读取。
- frozen install、contract:generate/check、check、三应用 build、34 项包/应用/HTTP 测试通过。Chromium 原3项与 db:test 内旧业务页面回归通过；不是新版多会话页面验收。
- 本机 dev 5→6 deploy/status 和保留摘要检查通过；没有启用存量新通道。证据在忽略的 `.local/evidence/caau-012-backend/`。
- 未运行：新版 Web 多会话自动刷新、断线/乱序响应/输入保留/延迟，微信开发者工具、真机、远程 CI/部署、生产登录/私有存储扫描/独立安全评审。小程序构建只证明已有页面与新契约兼容，不是新版微信业务运行。
