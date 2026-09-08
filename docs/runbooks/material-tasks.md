# CAAU-005：任务发布与材料执行

状态：第三段总部审核/管理、承办 Web 联调及 Taro 业务页面已实现，保留前两段成果。全段设计见 [ADR-0004](../adr/0004-material-workflow.md)、[执行设计](../adr/0005-material-execution.md)，实际验收见 [roadmap](../planning/roadmap.md)。浏览器闭环已本地验收；微信开发者工具/真机未验收。

## 本地操作

先按 [工具链](local-tooling.md) 使用官方 Node24.20.0/pnpm10.32.1，并保留 `.local/db`、既有卷和迁移。

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:up
corepack pnpm db:migrate:deploy
corepack pnpm db:migrate:status
corepack pnpm auth:local bootstrap
# 分别在两个终端运行：
CAAU_IDENTITY_MODE=local corepack pnpm db:api
corepack pnpm dev:admin
```

打开 `http://127.0.0.1:5173/workspace`（首页也有入口）。导入 `auth:local` 输出路径对应的本地会话 JSON 文件。文件仅在浏览器本地解析，API 只接收 bearer header；不将会话写入 localStorage、URL 或前端构建变量。会话默认 8 小时、可退出注销；不得上传真实凭据到截图、工单或 Git。沿用 [本地身份限制](authorization.md)，不称为微信登录。

1. **系统管理员**：在“账号与组织登记”创建内部用户、总部及承办机构，给用户登记 EVENT_MANAGER / ORGANIZER / REVIEWER 角色。成员下拉展示用户 UUID，供可信本地终端执行 `corepack pnpm auth:local <用户UUID>` 发放合成会话；无需手改数据库。账号真实邀请/登录留后续身份集成，系统管理员不能用本身角色创建赛事或看资料。
2. **总部赛事管理员**：导入对应会话，填写赛事名称与说明并创建；当前赛事中选择承办机构、经办人及审核员，创建任务草案。后台负责本赛事授权的事务性创建，不需要开发人员插入 EventGrant。
3. **配置要求**：逐项填写名称、必交性、说明、模板版本、扩展名格式、字节上限、材料截止时间及示例/标准，另填任务截止时间。五项名称来自确认规格，正式格式/大小/模板不预设；可增减项。时间按当前设备时区输入、后端保存带时区的 UTC 时刻。
4. **发布**：先保存要求，再核对指派和配置、确认发布。产生不可变要求 V1；发布前经办/审核员看不到业务任务，发布后指定人员可读取。发布失败不显示成功；409 应刷新后核对，而非盲目覆盖。
5. **承办方 Web 联调**：导入经办会话，选赛事/任务，在“承办材料办理”阅读要求、填写、上传并确认附件、保存草稿，再确认正式提交。退回后刷新办理状态，在新草稿修改重交；页面下方保留各版本及审核原因。
6. **审核员**：导入审核会话，从“待审核列表”进入详情，查看不可变提交和授权下载；整包通过，或勾选问题材料逐项填原因/修改要求后确认整包退回。
7. **赛事管理员**：任务详情“办理进度与总部操作”可延期、同机构交接或关闭。确认框列影响与目标；成功后刷新责任人和队列。延期历史可展开，旧提交/审核作者不会重写。
8. **小程序**：运行 `corepack pnpm dev:miniapp`，工具导入 `apps/miniapp`（平台资源和实际验证另记）。仅“待办、赛事、我的”，我的→本地测试身份密码框粘贴合成 token（仅内存，不发送会话文件到聊天）；待办/赛事→详情→填写/私有上传→保存→提交/重交→历史。具体配置见 [小程序说明](../../apps/miniapp/README.md)。

发布前 assignment 现仅允许同机构调整；发布后使用专用 handover 同机构交接。跨机构一律关闭旧任务另建，不复制旧内容。发布要求、撤回发布、删除历史仍不开放。历史指派引用的授权不能通过旧授权删除接口删除（409）；可停用成员/用户立即冻结访问。有效截止以 execution 为准：逾期仍可存草稿，不可提交，须总部明确延期。

## 真实业务接口

以下路径以 `/api/v1` 为前缀，精确参数和返回类型以 Nest 生成 OpenAPI 为准；前端只调用 `@caau/api-client`。

| 方法/路径 | 用途与权限 |
| --- | --- |
| GET workspace/identity | 当前内部用户与有效角色；无会话内容 |
| GET workspace/directory | 管理员指派目录；赛事管理员仅获 ORGANIZER/REVIEWER 候选，系统管理员可管理完整身份目录；无业务内容 |
| POST events / GET events / GET events/:id | 总部创建；列表与详情按真实赛事授权和已发布任务过滤；不把孤立权限锚点当赛事 |
| POST material-tasks | 本赛事管理员创建配置草案及权限锚点、指派、历史、审计同事务 |
| GET material-tasks / GET material-tasks/:id | 数据库范围过滤列表，详情重新检查当前任务权限；草案仅总部可见 |
| PATCH material-tasks/:id/assignment | 带 expectedRevision 的发布前重指派；只接受本次机构/经办/审核选择 |
| PATCH material-tasks/:id/requirements | 带 expectedRevision 保存总部配置草案；严格递归校验，不是保存承办方材料 |
| POST material-tasks/:id/publish | 校验完整要求及当前有效指派；原子生成要求 V1 并发布。重复请求不生成第二版；并发冲突可能 409 后刷新重试 |

共同规则：未经授权 403、失效会话 401、非法字段 400、revision/发布保护/约束冲突 409、数据库/审计失败脱敏 503。前端按钮隐藏不是鉴权；所有业务读写最终由后端决定。模板版本目前为明确的版本标识，不是模板文件下载；附件通道见下节；正式模板文件管理仍未实现。

任务要求保存/发布现在必须在 `GET workspace/upload-capabilities` 返回的当前格式和大小能力内（txt/pdf/png/jpg/jpeg、10 MiB），配置和上传处均显示限制，后端再次强制校验。旧存量草案若超能力必须调整后才能发布，旧已发布记录不暗改。内部技术输入上限另包括每任务 1～50 个材料、每项最多 20 种格式；这些是当前实现边界，不是总部已确认的正式文件大小政策。列表当前面向本地小规模试点，尚未做服务端分页和大数据量负载验收。

## 迁移与验收

新增 `202609080002_material_tasks`，不改 004 migration：Event/MaterialTask 与旧锚点共享 UUID，任务/赛事复合外键防错绑，RequirementVersion 和 AssignmentHistory 追加历史。数据库触发器禁止修改/删除要求快照与指派历史，禁止修改已发布配置；第二段追加迁移只放开同机构经办交接，不开放已发布审核员变更；延迟约束要求发布状态和匹配快照同事务提交。旧权限 reviewer 写入口不能修改真实业务任务。

```sh
corepack pnpm contract:check
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm db:test
```

`db:test` 现在也构建 Web 并运行真实业务 Chromium 测试，必须安装 Chromium，**3000/4173 端口必须空闲**，不复用已有服务。仅在 test 服务内自身临时库执行；先部署 004/005 第一段迁移，写合成身份/审计及已发布任务，再追加第二段，验证原快照保留和执行状态回填、重复 deploy/status/diff。随后真实业务 API 与真实生产 Web 构建运行在 app 账号上，无 route mock、权限探测替代或缺环境静默跳过。测试结束只关闭自身 API/Web、清理本次临时库，保留 dev 与卷。

第一段历史证据：17 项数据库套件（含旧恢复/shadow 与新增业务/浏览器）、全套静态检查与三端构建、25 项应用/HTTP 测试、原 Chromium3项。业务浏览器覆盖账号/组织/角色登记、建赛事、选择指派、五项要求、发布、API 重启后读取、承办方可见范围、系统管理员业务页面拒绝及 375px 无横向溢出；截图在忽略的 `.local/evidence/caau-005/workspace-mobile.png`，不是微信真机。

已修复并重跑：Prisma 复合一对一补齐唯一约束；原生 select 可访问名称显式化；加载图标不再污染按钮名称；通过 AntD ConfigProvider 关闭动效，不用 CSS 强行取消离场动画导致弹窗遮挡；Node 浏览器编排脚本区分浏览器 globals。保留提示：Web 首包体积、Node 小程序模块类型提示，以及业务关系查询期间出现的 pg8 并行 client.query 弃用提示；未升级 pg9 或关闭提示。远程 CI、生产身份/存储、安全独立评审和微信未验收。

## 第二段 API 操作

第二段按已确认规则实现，不再把逾期与交接列为未决项。新增迁移 `202609080003_material_execution`，不修改前两次迁移；对既有已发布任务回填 EDITING 执行状态/空草稿，不改原要求或作者。

| 方法/路径 | 操作 |
| --- | --- |
| GET material-tasks/:id/execution | 当前状态、执行 revision、generation、有效截止 |
| GET / PATCH material-tasks/:id/draft | 读取/保存当前草稿；保存携带草稿 expectedRevision 和 entries（materialId/text/fileIds） |
| GET material-tasks/:id/draft-history | 不可变编辑快照；审核员不能读取草稿及其历史 |
| POST material-tasks/:id/uploads | 创建 30 分钟上传意图：materialId/extension/expectedBytes/sha256 |
| POST uploads/:id/content | 原始 application/octet-stream 上传，不使用 JSON/base64；独占写入、超时/字节上限 |
| POST uploads/:id/confirm | 重读文件验证实际大小/hash/格式特征；成功才 CONFIRMED |
| GET uploads/:id/content | 当前草稿/历史提交绑定文件的授权代理下载；审核员只读提交附件 |
| POST / GET material-tasks/:id/submissions | 提交/列出不可变版本；提交体 expectedDraftRevision 与 UUID idempotencyKey |
| POST material-tasks/:id/reviews | submissionId、整包 PASS/RETURN、issues；RETURN 必须列 materialId/reason/instruction，PASS 的 issues 为空 |
| POST / GET material-tasks/:id/extensions | 延期/历史；POST 为执行 expectedRevision、newDeadline、reason；总部本赛事管理员专用 |
| POST material-tasks/:id/handover | 执行 expectedRevision、handlerMemberId；总部同机构交接 |
| POST material-tasks/:id/close | 执行 expectedRevision、reason；关闭旧任务，保留历史，禁止继续编辑/提交/审核 |

推荐顺序：读取要求和 execution/draft → 创建意图 → 二进制上传 → 确认 → 把文件 ID 写入草稿 → 提交。前端统一使用 `@caau/api-client` 的生成 operationId；二进制请求/响应为 ArrayBuffer，Fetch 适配器不 JSON 编码文件。Taro 适配器已传递 arraybuffer 类型，但微信平台上传/下载未验证。

- 三种 revision 不可混用：总部配置 revision、承办草稿 revision、执行 revision。409 时读取当前状态并比较；不要自动覆盖草稿。同一次提交重试保留原 idempotencyKey 和 expectedDraftRevision；不同参数使用同键为 409，已撤权者不能凭旧键重取结果。
- 服务器数据库时钟检查任务及必交/已填材料截止。延期的新截止必须晚于全部旧截止且晚于服务器时间，整体更新任务/材料有效截止，并留人、时间、原因和完整新旧映射。退回不自动延期。
- RETURN 复制提交内容形成新草稿修订；改后提交产生 V2 等新版本，不修改 V1 或旧审核。并发审核仅一条结论，另一条 409；PASS 后不再接受材料变更。
- 同机构交接保留已绑定文件与编辑/提交历史，旧人后续访问立即拒绝。旧 generation 未完成上传不可接续，重新创建意图上传；不允许跨机构绑定、下载或直接转交历史。
- 私有根目录默认忽略的 `.local/files`，可用服务端 `CAAU_PRIVATE_FILE_ROOT` 指定独立目录。没有静态映射或公开/裸签名 URL；响应 attachment/octet-stream/no-store/nosniff。不得把该目录映射到 Web 根目录，也不提交或截图真实材料。
- 本地支持 txt/pdf/png/jpg/jpeg，且必须满足总部配置；传输上限 10 MiB，10 秒上传超时，最多每项 10 附件/4000 字文本、50 项草稿。这是技术限制，不是正式业务文件政策。校验 UTF-8、大小、SHA-256 和文件特征，**不是病毒扫描或完整文件语义解析**；Office/压缩包明确拒绝。
- 失败流清理本次部分文件；完整写入但确认/审计失败的私有对象不算提交。确认可重试；hash 错误应新建意图重传。未做自动 GC，不可手工删除历史绑定文件或数据库/存储卷；部署前还须私有云桶、扫描隔离、配额/速率限制、备份恢复与独立安全评审。

第二段真实测试见 `scripts/workflow.integration.mjs`：真实字节上传/下载、失败确认、跨机构/撤权、草稿 CAS、逾期/延期、提交重试、退回再提交、并发审核、交接继承、审计故障回滚及 API 重启。测试用独立私有目录，仅清理自身临时文件和临时库；不覆盖第一段浏览器验收。**第三段已实现上述页面及本地客户端流程；微信 AppID/正式登录/开发者工具/真机、远程 CI 和生产存储均未验收。**

## 第三段页面验收与边界

- 真实浏览器通过两条完整业务链：发布→上传/保存/提交→通过；发布→提交→退回→修改→V2→通过。总部与承办方均在真实 Web 页面点击操作，不是用 API 操作代替页面成功；服务连接隔离测试 PostgreSQL 和私有文件目录。
- 失败反例：伪 PDF 实际进入后端确认校验并失败，页面不加入附件且阻止提交，须重新上传或明确移除失败项；另一个窗口通过实际 API 保存引起 409，本窗口输入保留并展示最新草稿，明确核对后才采用最新 revision；真实提交响应被测试脚本丢弃，页面以同一个 key/revision 重试且仅一版。
- 已验证逾期可保存提示/提交禁用、总部延期、同机构交接后旧人拒绝且表单禁用、新人接管原草稿，以及关闭后只读。客户端时钟提示仅辅助，最终以服务器为准；权限变化通过刷新/后续请求反馈，不承诺推送瞬时刷新。
- `check`、三端 `build`、30 项包/应用/HTTP、原 Chromium 3 项、扩展后的 `db:test` 27 项均通过。共享客户端 SHA-256 与 Node 摘要在填充边界及 10 MiB 比对一致；草稿冲突、上传失败、提交命令重试另有单测。
- 截图在忽略的 `.local/evidence/caau-005-phase3/`：`review-approved.png`、`review-return-dialog.png`、`draft-conflict-mobile.png`、`organizer-history-mobile.png`。均为合成数据的 Web 截图，375px 为承办 Web 联调页面，**不是小程序工具或真机截图**。
- 本轮沿用浅色 AntD/中文系统字体，手机使用 Taro 原生控件和单列卡片、安全区留白；参考 ui-ux-pro-max 的简洁布局、标签、状态与触控准则。深色主题、原生屏幕阅读器/系统最大字体、平台文件选择/随机数/离开提醒与真机最大文件性能未验收。
- 当前附件下载以通用 `.bin` 文件名保留原始字节，友好原文件名/预览仍待完善；模板只有版本标识，**真实模板管理与授权下载是首版待办**，没有虚假下载按钮。未保存输入与未知提交命令只在内存，不具备离线跨重启恢复；离开提示不能替代主动保存，重新进入可查服务器草稿/版本确认状态。
