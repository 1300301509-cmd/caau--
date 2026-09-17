# 总部 Web 正式账号认证运行手册

适用 CAAU-029。本手册区分本地体验与生产部署；本地通过不代表生产安全验收。

## 1. 运行模式

正常模式不设置 `CAAU_IDENTITY_MODE`（或显式设为 `disabled`）。API仍使用数据库鉴权，但不会列出或签发本地测试身份：

```sh
corepack pnpm db:up
corepack pnpm db:migrate:deploy
corepack pnpm db:api
corepack pnpm dev:admin
```

Web启动后访问 `http://127.0.0.1:5175/login`。未登录访问受保护深链时显示登录页；成功、首次改密或刷新恢复后仍返回原URL。`/system/health`是工程诊断入口，不承载业务数据，保持公开。

仅自动化/本地业务回归可显式设置 `CAAU_IDENTITY_MODE=local`，且必须是非production、loopback监听。该模式由全局AuthGate识别后显示既有测试身份入口；正常模式不会渲染该入口。

## 2. 首个超级管理员

初始化前必须已有明确的总部机构UUID。命令要求显式开关、账号名和显示名；密码只能通过TTY隐藏输入两次，或从受限stdin提供两行，不接受命令行参数、环境变量或默认值：

```sh
export CAAU_ALLOW_SUPER_ADMIN_INIT=1
export CAAU_SUPER_ADMIN_ORGANIZATION_ID='<总部机构 UUID>'
export CAAU_SUPER_ADMIN_LOGIN_NAME='<正式账号名>'
export CAAU_SUPER_ADMIN_DISPLAY_NAME='<显示名称>'
corepack pnpm admin:init-super
```

脚本在Serializable事务和advisory lock内执行，并写安全审计。若库内没有active超级管理员则创建首个账号；若恰有一名同机构、active且尚无任何凭据的历史超级管理员，则只为该既有身份补齐凭据，不复制身份/角色。已有已初始化超级管理员、多个active超级管理员、机构不符或账号冲突都会拒绝。成功信息不包含用户ID、账号名或密码。

本仓库当前本地体验凭据位于忽略文件 `.local/auth/caau-029-dev-login.txt`（权限0600）；不要提交、复制到文档/聊天或用于其他环境。首次登录必须立即自设新密码，届时文件中的临时密码失效，可删除该文件。

## 3. 账号与权限管理

只有API返回 `canManageAccounts=true` 时才显示 `/accounts`：

- 创建账号时明确选择机构与初始角色，临时密码不会回显；
- 启停账号，停用会立即撤销全部会话，恢复不会恢复旧会话；
- 管理既有组织角色、赛事范围及承办申请办理/审核授权；
- 管理员重置他人临时密码会撤销目标全部会话，并要求目标首次改密；
- 禁止重置或停用自己，普通系统管理员不能管理超级管理员，最后一名active超级管理员受保护。

导航可见性只用于体验；所有接口仍逐请求读取账号、成员关系和业务grant并以后端拒绝为安全边界。

## 4. Cookie、CSRF、CORS和代理

- Web Cookie为opaque Session，数据库只存SHA-256；Cookie使用 `HttpOnly`、`Path=/`、`SameSite=Lax`，production自动要求 `Secure`。
- Cookie写请求同时要求精确允许的 `Origin` 和会话级HMAC `X-CSRF-Token`；Bearer调用不发送Cookie或CSRF。
- `CORS_ORIGINS`必须列出精确origin，production只能使用HTTPS；禁止通配符。
- production必须注入至少32字节的 `CAAU_CSRF_SECRET` 和 `CAAU_LOGIN_THROTTLE_SECRET`。
- 仅在受控反向代理拓扑下设置 `CAAU_TRUST_PROXY_HOPS=1`或`2`；错误配置会影响客户端地址限流边界。
- 登录按账号和客户端地址双维度使用数据库共享限流；多实例仍应做容量、竞争和代理来源专项验证。

## 5. 会话与故障处理

- 修改密码会撤销该用户全部旧会话，并为当前浏览器轮换新Cookie；重置、停用和退出同样撤销会话。
- 401会清除Web受保护状态并回到登录页；403保留登录，仅显示无权结果。
- 不存在、错误、停用、无凭据及格式不合法账号统一返回登录失败，不提示账号是否存在。
- 受控初始化和账号管理审计不记录密码、Cookie、CSRF、opaque token、原始账号输入或IP。

## 6. 验证与生产前缺口

本地门禁：

```sh
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm db:test
```

production上线前仍必须单独完成TLS终止、代理可信链、生产密钥注入与轮换、数据库角色授权审查、多实例限流压测、安全响应头、备份恢复、监控告警和安全评审。当前本地Chromium结果不是生产HTTPS或远程CI验收。
