# 本地身份、范围授权与审计（CAAU-004）

依据 [首版规格](../product/mvp-material-review-spec.md) 与 [ADR-0003](../adr/0003-authorization.md)。本文保留早期Bearer/local权限底座操作；总部Web正式账号、Cookie/CSRF、受控初始化与账号页面见[正式认证手册](password-authentication.md)。正式微信身份仍不在当前实现内。

## 启动与引导

使用 [固定 Node/pnpm](local-tooling.md)；按 [数据库规程](database-contract.md) 保留既有卷和凭据。

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:up
corepack pnpm db:migrate:deploy
corepack pnpm db:migrate:status
corepack pnpm auth:local bootstrap
CAAU_IDENTITY_MODE=local corepack pnpm db:api
```

`auth:local bootstrap` 是可信开发终端上的离线工具，只连接 dev app 账号。幂等建立固定 UUID 的合成用户/总部组织/系统管理员成员；每次生成独立 8 小时会话（不覆盖文件，不重新激活已停用身份）。会话随机 256 位，数据库只保存 SHA-256，明文仅写 `.local/db/session-<随机ID>.json`，0600，禁止打印、提交或复制到前端构建变量。引导账号没有赛事业务权限。

`corepack pnpm auth:local prepare` 幂等准备六个固定测试身份及三个组织：总部超级管理员、总部赛事管理员、总部审核员甲/乙、承办方 A/B 经办人。固定记录只在不存在时创建，已有记录不更新、不重新启用；命令不创建赛事、授权、任务或材料。页面进入时后端也执行同一幂等准备，因此通常无需手工运行。

Web 在 **http://127.0.0.1:5175/hosting-applications** 首次进入时默认签发总部超级管理员身份。鼠标移到左侧栏并展开后，可在左下角“LOCAL · 测试身份”选择总部超级管理员、赛事管理员、审核员甲/乙或承办方 A/B 经办人；选择后页面以新权限重新加载。服务端创建真实 8 小时 opaque 会话，再由受保护身份接口验证。token 仅保存在当前标签页 `sessionStorage`：标签页互不覆盖，刷新重新验证并恢复；仍兼容开发脚本预先写入的其他有效本地会话。会话过期时业务页面继续负责清理及输入保护，用户可使用全局入口重新选择。所有业务接口继续后端逐请求鉴权。详细决策见 [ADR-0009](../adr/0009-local-test-identity-switching.md)。

该下拉框不是正式账号的权限编辑器，也不会修改数据库中的角色。正常模式下 Web 只显示正式登录，左下角切换器不渲染，`GET/POST /api/v1/local-test-identities` 返回 503。不得为了演示在公网、production 或非回环地址开启 `CAAU_IDENTITY_MODE=local`。

离线兼容仍可运行 `corepack pnpm auth:local <内部用户UUID>` 为已存在、未停用的合成用户生成会话文件；它不再是当前 Web 的操作入口。不要把令牌写进 shell 历史、浏览器 URL、日志或聊天。`POST /api/v1/authorization/logout` 撤销当前会话。

默认身份模式关闭；开启 local 必须非 production 且 HOST 为回环地址。本地身份选择/签发 HTTP 端点也受此开关限制，不能接受任意 UUID 或角色，禁用时返回 503。生产微信/内部身份提供方、TLS、正式会话发放与回收、限流、防暴力攻击及独立安全评审均未完成；不可直接对外开放本地模式。微信 AppID 缺失，不提供微信 code 换身份接口。

## API 与矩阵

除表中明确写出的本地身份路径外，其余路径以 `/api/v1/authorization` 为前缀；成功统一 200。具体 DTO 和 operationId 以生成的 OpenAPI 为准。

| 接口 | 权限与约束 |
| --- | --- |
| `GET /api/v1/local-test-identities` / `POST /api/v1/local-test-identities/sessions` | 仅显式本地测试模式；列固定身份并签发后端 opaque 会话，禁用时 503 |
| GET me / POST logout | 有效内部会话；用户停用/过期/注销后拒绝 |
| POST users / organizations / members | 系统管理员；成员只能使用四种角色，用户/组织/角色组合唯一 |
| PATCH users/:id / members/:id | 系统管理员，仅接受 active 布尔值；每次请求重读当前状态 |
| POST event-scopes | 总部赛事管理员，创建空权限锚点并自动给创建者赛事授权；不是创建完整赛事 |
| GET event-scopes/:id | 当前有效非系统管理角色的显式赛事授权 |
| POST event-grants / DELETE event-grants/:id | 系统管理员显式授权/撤权，不能给 SYSTEM_ADMIN 角色建立业务授权 |
| POST task-scopes | 本赛事管理员；经办人必须有同赛事 ORGANIZER 授权；不是发布材料任务 |
| PATCH task-scopes/:id/reviewer | 本赛事管理员；指派同赛事 REVIEWER 授权或 null 解除；禁止经办人本人、经办机构成员、有经办角色的用户 |
| GET task-scopes/:id | 本任务指派经办人、指派审核员或本赛事管理员；系统管理员无隐式通路 |
| POST task-scopes/:id/access | 仅策略探测：task.read / content.write / review / file.download；返回锚点 ID，不读写材料、不下载文件 |
| GET audit | 系统管理员；最多最近 100 条安全日志，无材料正文；当前无分页管理 UI |

经办方不仅要有同组织/赛事关系，还必须是本任务经办人；同机构其他未指派人员也拒绝。审核员必须被指派到当前任务。冲突角色采用拒绝优先：经办人身份不能利用附加管理/审核角色读取其他经办方；审核员不借其他角色直接修改提交内容。任务、提交或文件未来必须从数据库解析真实归属，不能信任 URL 外另传的组织/赛事 ID。

CAAU-005 真实业务操作见 [任务文档](material-tasks.md)。已关联真实任务的旧 reviewer 写入口返回 409，必须走业务用例；指派历史引用的授权删除也返回 409，避免历史无法追溯。

已被任务引用的赛事授权删除返回 409（外键保护）；撤销审核授权先解除任务指派，临时/立即冻结访问可停用成员。CAAU-005 第一段已实现发布前重指派，发布后及已有材料草稿时的重指派/精细撤权留后续，不能删任务锚点绕过历史保护。

## 后端与审计边界

全局 Guard 默认拒绝没有显式策略的控制器方法；只有 health/ready 标记公开（OpenAPI 是公开工程文档）。每个受保护用例在 Serializable 事务内重新加载会话/角色/范围，成功读写和审计一起提交；唯一、外键、并发冲突返回 409。参数额外字段/非法类型拒绝 400；未知及不可见 UUID 统一 403，减少资源枚举。服务/审计失败返回脱敏 503，不输出驱动错误。

审计记录 actorId、动作、资源 UUID、时间、requestId、ALLOWED/DENIED，以及允许列表中的相关 UUID/角色/布尔值/策略动作 context。不记录姓名、任意请求体、令牌、正文。失败独立记审计；若审计写入失败，成功业务修改回滚。运行账号无审计 UPDATE/DELETE/TRUNCATE 权限，另有不可变触发器。数据库 owner 仍可改 DDL，故不宣称具备外部防篡改或不可抵赖能力。

前端仅消费 `@caau/api-client`。新增通用 `client.request(operationId, { token, path, body })`，参数/响应类型、路径/方法及响应形状来自生成契约；fetch 和 Taro 适配器分别传递 header/data，不增加运行时依赖。当前支持 GET/POST/PATCH/DELETE、路径参数、JSON 对象/数组/可空值，不支持文件流、multipart、分页游标或任意 OpenAPI 组合类型。无授权业务页面。

## 验证与后续

- `corepack pnpm db:test` 在 test 服务内新建自身 `caau_auth_*` 临时库，部署正式迁移两次、status/diff、通过 app 账号运行 API；覆盖两赛事两承办方、跨组织和同组织未指派反例、指派权限、自审/跨角色冲突、撤权/注销/过期、重启持久性、并发重复授权、审计脱敏/不可改/失败回滚。结束只清理本次临时库。
- 原停启恢复、受限 app 及独立迁移/shadow 套件保留。不存在缺 Docker 静默跳过。实际证据见 [roadmap](../planning/roadmap.md)。
- dev 正式迁移、离线引导与 HTTP me=200 / 创建赛事=403 / logout=200 / 注销后=401 已实测；验收会话已注销，合成管理员保留。

CAAU-005 开始条件：以本任务已提交且检查通过的分支成果为基线，保留数据库迁移；先确定赛事/任务详情与权限锚点的一对一关系、经办方重指派/撤权事务，再新增 DTO/模型。材料格式、大小上限、模板版本、截止时间由总部配置，测试使用合成值；文件方案须选择非公开存储并设计上传/绑定/下载的当前权限检查。实现草稿、不可变版本、整包审核前分别列出幂等键、并发冲突和审计验收用例。缺真实 AppID 不阻塞本地开发，但微信登录和 CAAU-010 完整验收须等待 AppID/测试账号、合法 HTTPS API/文件域名、开发者工具及真机资源；不能将本轮策略探测当作真实材料或文件越权验收。
