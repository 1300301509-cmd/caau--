# ADR-0012：承办方 Web 与微信小程序统一身份

- 状态：已采纳，本地实现完成，真实微信环境待验收
- 日期：2026-09-19
- 关联任务：CAAU-032

## 背景

承办方后续可能同时使用 Web 和微信小程序。两端若各自创建用户、机构或业务副本，会产生账号重复、授权漂移和草稿覆盖。现有业务表已经以 `InternalUser`、`OrganizationMember`、赛事/申请 grant 为权限与审计主体，因此新增渠道只能作为认证凭据，不能成为第二套业务身份。

## 决策

1. `InternalUser.id` 是跨端唯一人员标识；组织成员、角色、grant、申请、材料、附件和历史继续只关联现有用户与机构，不按客户端复制。
2. Web 使用已有账号密码与 HttpOnly Cookie；小程序使用 `wx.login` 临时 code，由 NestJS 服务端调用微信 `code2Session`，AppSecret 和 `session_key` 永不下发客户端或写入日志/数据库。
3. `WechatIdentity` 只保存 AppID、OpenID、可选 UnionID 与同一 `InternalUser` 的绑定。一个用户在一个小程序 AppID 下最多绑定一个微信身份，一个 OpenID 也只能绑定一个用户。
4. 首次绑定必须由已经完成强制改密的 Web 密码会话生成随机 256 位一次性凭证。数据库仅保存 SHA-256，凭证有效10分钟、生成新凭证会作废旧凭证、成功后不可重放，并绑定到创建它的 Web Session。Web 改密、账号停用或会话撤销后，未使用凭证不能继续绑定。
5. `Session.clientType` 区分 `WEB_PASSWORD`、`WECHAT_MINIAPP`、`LOCAL_TEST` 与历史会话。两端令牌形态保持分离：Web Cookie，小程序 Bearer；授权服务仍在每次请求重新检查用户、成员和 grant。
6. 改密、管理员重置或账号停用继续撤销该用户全部终端会话。业务并发仍使用现有 revision/CAS 和不可变版本，不依赖客户端本地数据“互相同步”。
7. 微信登录和绑定按客户端IP的HMAC标识使用数据库持久限流；审计不记录 code、OpenID、绑定凭证、AppSecret 或 `session_key`。
8. 微信配置缺失时公开能力位返回禁用，登录接口失败关闭为503；不得回退到本地测试身份或伪造成功。

## 数据流

```text
承办方 Web --密码/Cookie---------┐
                                 ├─ NestJS API ─ InternalUser/OrganizationMember ─ 业务数据
微信小程序 --wx.login/Bearer-----┘
                    |
                    └─ 服务端 code2Session ─ WechatIdentity ─ InternalUser
```

首次绑定：Web账号安全页生成一次性凭证 → 小程序重新调用 `wx.login` → 服务端同时校验微信code、凭证、原Web会话和承办方角色 → 创建绑定及小程序Session。

## 安全与边界

- 不凭姓名、手机号、昵称或客户端提交的OpenID自动合并账号。
- 小程序不接收Web密码；Web不接收微信 `session_key`。
- 当前不实现公众注册、自助换绑、管理员解绑、多微信身份或跨AppID合并。上述能力需要独立审计和恢复规则。
- 本地可通过注入的微信交换器验证数据库和HTTP行为，但不能替代组织AppID、合法HTTPS域名、微信项目成员、体验账号和真机验收。

## 后果

未来承办方 Web 可直接复用现有密码认证和相同API，不需要数据同步任务。小程序与Web看到的是同一服务端草稿、提交版本和权限；同时编辑时仍由服务端 revision 返回409，避免最后写入覆盖。
