# 赛事承办申请后端操作

状态：CAAU-027 B 阶段后端、追加迁移和生成契约已实现；总部 Web 与承办方小程序尚未实现。

## 1. 边界

- 申请在获批前不创建赛事；提交版本、附件关系、审核动作、来源和初始赛事资料版本不可变。
- 申请经办权限、申请审核权限、赛事基本信息查看权、`EventGrant` 和任务指派相互独立。
- 获批事务创建内部“筹备中”赛事、来源、初始资料、承办机构关系及当时有效经办人的基本信息查看权；不创建材料任务，也不公开赛事。
- `SYSTEM_ADMIN` 没有隐式赛事、任务或承办申请业务权限。`HEADQUARTERS_SUPER_ADMIN` 可管理账号、机构、权限、赛事、任务和申请，但仍受禁止自审、不可变历史、revision/CAS 和状态机约束。
- 本轮没有正式登录、前端页面或生产部署。

## 2. 迁移与契约

从仓库根目录使用固定 Node.js 24.20.0 和 pnpm 10.32.1：

```sh
corepack pnpm db:migrate:deploy
corepack pnpm contract:check
```

追加迁移为 `database/prisma/migrations/202609170001_event_hosting_applications/migration.sql`。不得修改既有迁移、reset 数据库或删除数据卷。运行账号仅取得新业务表所需 DML；提交版本、提交附件、动作、命令、赛事来源、初始资料版本和承办关系禁止 UPDATE/DELETE/TRUNCATE。

## 3. 首个本地超级管理员

HTTP 成员创建接口不能由普通 `SYSTEM_ADMIN` 创建超级管理员。首个超级管理员只能在本地 `caau_dev` 中显式初始化：

```sh
export CAAU_ALLOW_LOCAL_SUPER_ADMIN_INIT=1
export CAAU_SUPER_ADMIN_ORGANIZATION_ID='<已有有效总部机构 UUID>'
export CAAU_SUPER_ADMIN_DISPLAY_NAME='<本地显示名>'
corepack pnpm admin:init-local-super
```

脚本拒绝非回环地址、非 `caau_dev`、缺少显式开关、无效机构及已有有效超级管理员；不打印数据库凭据或会话令牌。它会输出新建 user/member UUID。随后可用既有本地离线工具为该 user UUID 签发临时会话：

```sh
corepack pnpm auth:local '<输出的 user UUID>'
```

会话只写入被忽略的 `.local/db/session-*.json`。后续超级管理员可通过受保护成员接口明确创建其他超级管理员；该角色不会出现在固定五个测试身份中。

## 4. 接口组

生成契约包含以下后端能力：

- `admin/hosting-application-handler-grants`：经办授权及启停；
- `admin/hosting-application-review-grants`：独立审核授权及启停；
- `hosting-applications`：创建、列表、详情、草稿 CAS、提交；
- `hosting-applications/:id/{start-review,request-supplement,reject,approve}`：显式共享审核命令；
- `hosting-applications/:id/uploads` 与 `hosting-uploads/:id/*`：私有文件意向、二进制上传、确认、移除和授权下载。

所有受保护接口使用现有 `Authorization: Bearer <opaque session>`。写命令由服务端重新加载 actor；审核/提交命令携带 expected revision、明确 submissionId 和 UUID 幂等键。重复同键同输入返回原结果，同键异输入或陈旧 revision 返回 409。

## 5. 已验证与环境限制

真实隔离 PostgreSQL/API 已覆盖：追加迁移与 shadow/replay、旧行/checksum/文件保留、跨机构隔离、普通系统管理员边界、禁止自审、同机构协作、V1→补充→V2、服务端差异、并发批准仅一个成功、无有效经办人拒绝、原子赛事创建、无材料任务、人员停用/恢复及经办授权新增/撤销联动、不可变历史和私有附件下载。

本轮全套 `db:test` 中上述后端用例和其他非浏览器数据库用例通过；两个既有浏览器子项因本机已有 API 占用 `127.0.0.1:3000` 未运行成功。不得把该端口冲突写成浏览器验收通过，也不要为测试复用或强制结束未知服务。释放端口后应重跑 `corepack pnpm db:test` 和按计划执行的浏览器检查。
