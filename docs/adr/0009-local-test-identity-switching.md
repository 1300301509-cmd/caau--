# ADR-0009：本地测试身份与标签页会话

状态：CAAU-015 采用；仅用于本地测试，不是正式登录。

## 决策

- 固定准备五个内部身份：总部赛事管理员、总部审核员甲、总部审核员乙、承办方 A 经办人、承办方 B 经办人。它们继续使用 `InternalUser`、`Organization`、`OrganizationMember` 和 `Session`，不增加平行账号或前端角色模拟。
- 用户、组织和成员使用保留 UUID 幂等准备。只在记录不存在时创建，已有记录 `update: {}`，不重新启用停用身份、不改名称、不创建赛事、授权、任务或材料。重复调用不得产生重复账号。
- `GET /api/v1/local-test-identities` 和 `POST /api/v1/local-test-identities/sessions` 仅在 `CAAU_IDENTITY_MODE=local`、非 production、回环 HOST 下可用；禁用时返回 503。签发端点按固定身份创建新的 256 位 opaque 会话，数据库只存 SHA-256 和 8 小时过期时间，并写 `session.local.issue` 审计。它不接受任意用户 UUID、角色或组织。
- Web 不再要求导入 JSON。选择固定身份后调用签发端点，再通过受保护的 `getWorkspaceIdentity` 验证会话；后续业务请求仍逐次执行原后端会话、成员和赛事范围鉴权。
- 明文 token 只放当前标签页的 `sessionStorage`，不放 localStorage、URL、构建配置或跨标签共享通道。刷新从当前标签页取出 token 后重新向后端验证；401 立即移除 token、清空受保护数据并显示重新进入入口。
- 身份切换先清除标签页存储并让 `IndividualWorkspace` 递增 session/request epoch、清空保护状态，再签发和验证新会话。迟到响应不能恢复上一身份的数据；退出会注销当前后端会话。

## 边界

本地 HTTP 签发入口是对 ADR-0003“仅离线工具签发”的有意补充，但仍受原有回环、非生产和显式模式三重限制。它不是密码登录、微信登录、生产身份提供方或账号中心；不应部署到对外环境。`sessionStorage` 提供标签页隔离和刷新恢复，不承诺浏览器崩溃恢复、跨设备同步或防御已取得同源脚本执行能力的攻击。
