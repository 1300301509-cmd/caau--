# CAAU-005 第一段：赛事、指派与任务发布

状态：本地第一段完成；全段技术设计见 [ADR-0004](../adr/0004-material-workflow.md)，实际验收见 [roadmap](../planning/roadmap.md)。不是上传/提交/审核或微信验收。

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
5. **承办方**：导入经办会话，选择可见赛事、查看任务要求。此 Web 只用于本地验证查询；小程序业务页面尚未实现。上传/提交/审核按钮不存在。

第一段支持发布前重指派并留历史。发布后重指派、更新要求、撤回发布、删除历史均未开放，API 返回 409，不代表这些后续业务规则已被确认。历史指派引用的授权不能通过旧授权删除接口删除（409）；可停用成员/用户立即冻结访问。截止时间只保存/展示，不据此承诺逾期可提交或不可提交。

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

共同规则：未经授权 403、失效会话 401、非法字段 400、revision/发布保护/约束冲突 409、数据库/审计失败脱敏 503。前端按钮隐藏不是鉴权；所有业务读写最终由后端决定。模板版本目前为明确的版本标识，不是模板文件下载；模板文件与附件通道留第二段。

内部技术输入上限为每任务 1～50 个材料、每项最多 20 种格式、字节上限不超过 PostgreSQL Int 范围；这些是当前实现边界，不是总部已确认的正式文件大小政策。列表当前面向本地小规模试点，尚未做服务端分页和大数据量负载验收。

## 迁移与验收

新增 `202609080002_material_tasks`，不改 004 migration：Event/MaterialTask 与旧锚点共享 UUID，任务/赛事复合外键防错绑，RequirementVersion 和 AssignmentHistory 追加历史。数据库触发器禁止修改/删除要求快照与指派历史，禁止修改已发布配置/指派；延迟约束要求发布状态和匹配快照同事务提交。旧权限 reviewer 写入口不能修改真实业务任务。

```sh
corepack pnpm contract:check
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm db:test
```

`db:test` 现在也构建 Web 并运行真实业务 Chromium 测试，必须安装 Chromium，**3000/4173 端口必须空闲**，不复用已有服务。仅在 test 服务内自身临时库执行；先部署原 004 迁移并写合成身份/审计，再升级 005，验证原数据及迁移 checksum 保留、重复 deploy/status/diff。随后真实业务 API 与真实生产 Web 构建运行在 app 账号上，无 route mock、权限探测替代或缺环境静默跳过。测试结束只关闭自身 API/Web、清理本次临时库，保留 dev 与卷。

本地通过：17 项数据库套件（含旧恢复/shadow 与新增业务/浏览器）、全套静态检查与三端构建、25 项应用/HTTP 测试、原 Chromium3项。业务浏览器覆盖账号/组织/角色登记、建赛事、选择指派、五项要求、发布、API 重启后读取、承办方可见范围、系统管理员业务页面拒绝及 375px 无横向溢出；截图在忽略的 `.local/evidence/caau-005/workspace-mobile.png`，不是微信真机。

已修复并重跑：Prisma 复合一对一补齐唯一约束；原生 select 可访问名称显式化；加载图标不再污染按钮名称；通过 AntD ConfigProvider 关闭动效，不用 CSS 强行取消离场动画导致弹窗遮挡；Node 浏览器编排脚本区分浏览器 globals。保留提示：Web 首包体积、Node 小程序模块类型提示，以及业务关系查询期间出现的 pg8 并行 client.query 弃用提示；未升级 pg9 或关闭提示。远程 CI、生产身份/存储、安全独立评审和微信未验收。

## 第二段开始前

先由业务确认：**截止后提交采用禁止、标逾期允许，还是须总部延期？换经办人后旧草稿如何处理，同机构与跨机构是否不同？** 在这些规则确认前不实现相关放行或自动移交。

随后按 ADR-0004 实现私有文件上传/确认/绑定/下载、材料草稿 revision、幂等不可变提交版本、整包审核唯一结论、退回生成新草稿和历史查询，并补真实文件/提交/审核越权及弱网/并发测试。微信完整链路另需 AppID、测试账号、合法 HTTPS 域名及真机资源；当前只完成 CAAU-005 第一段。
