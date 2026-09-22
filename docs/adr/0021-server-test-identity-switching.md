# ADR-0021：测试服务器身份切换

## 背景

本地 `CAAU_IDENTITY_MODE=local` 依靠非 production 与回环监听隔离，接口无需正式登录。该机制不能直接部署到可联网服务器。产品测试仍需要总部超级管理员在 Web 左下角切换固定角色，验证不同账号的数据和操作范围。

## 决策

- 新增 `CAAU_IDENTITY_MODE=server-test`，仅允许 `NODE_ENV=production` 且 `CAAU_DEPLOYMENT_STAGE=test`。`CAAU_DEPLOYMENT_STAGE=production` 强制拒绝任何测试身份模式。
- Web 先走正式账号密码登录。只有有效的 `HEADQUARTERS_SUPER_ADMIN` Cookie 会话可以读取固定测试身份或签发测试 Bearer 会话；Bearer、未登录、普通管理员、审核员和承办方均不得调用签发接口。
- 写请求继续校验精确 HTTPS Origin 与 CSRF。固定测试身份仍采用允许列表，不接受任意用户、组织或角色。
- 首次正式登录成功后，测试服务器自动签发固定“总部超级管理员”测试会话；切换只影响当前标签页，不修改正式账号、成员关系或业务授权。
- 每次签发以正式超级管理员为审计 actor，以目标固定用户为 resource。目标会话仍由后端逐请求鉴权。
- 本地模式继续使用原公开端点，但仍受非 production、回环 HOST 约束；测试服务器使用独立受保护端点，两个模式不能同时开启。

## 接口

- `GET /api/v1/server-test-identities`
- `POST /api/v1/server-test-identities/sessions`

两个接口仅用于测试服务器，不属于生产产品能力。正式生产必须配置 `CAAU_DEPLOYMENT_STAGE=production` 与 `CAAU_IDENTITY_MODE=disabled`。

## 限制

代码与自动化通过不等于已部署。真正启用还需要测试域名、HTTPS、独立测试数据库、密钥管理、防火墙和正式超级管理员账号；仓库当前没有云服务器或发布流水线。
