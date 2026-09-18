# 承办方 Web 与小程序统一身份运行手册

设计见 [ADR-0012](../adr/0012-cross-client-identity.md)。本手册不包含任何真实 AppSecret、OpenID、令牌或绑定凭证。

## 服务端配置

微信登录默认关闭。API运行环境必须由密钥管理设施同时提供：

```text
CAAU_WECHAT_MINIAPP_APP_ID
CAAU_WECHAT_MINIAPP_APP_SECRET
```

只配置其中一个、AppID格式错误或Secret明显无效时API拒绝启动。AppSecret只能进入API进程，禁止放入 `apps/miniapp`、Vite/Taro公开环境变量、日志或Git。

`GET /api/v1/authentication/mode` 的 `wechatMiniappEnabled` 仅表示服务端配置存在，不表示微信平台域名、项目成员或真机已经验收。

## 首次绑定

1. 总部管理员创建承办方正式账号、机构成员关系及必要grant。
2. 承办方在Web使用临时密码登录并完成强制改密。
3. 承办方进入账号安全页，生成10分钟有效的一次性绑定凭证。
4. 用户在小程序同意协议后选择微信快捷登录；未绑定时填写该凭证。
5. 小程序重新调用 `wx.login`，API服务端调用微信 `code2Session`，同时校验一次性凭证及其原Web会话。
6. 成功后创建 `WechatIdentity` 和 `WECHAT_MINIAPP` Session；小程序再通过统一工作区身份接口读取同一个 `InternalUser` 的角色和权限。

生成新凭证会使旧凭证失效。凭证成功使用、超时、原Web会话撤销、账号停用或角色失效后均不能使用。

## 日常登录与同步

已绑定用户只需微信快捷登录。Web与小程序会话彼此独立，但所有业务请求进入同一API和数据库：

- Web保存草稿后，小程序刷新读取同一revision；反向相同。
- 两端并发编辑时，旧revision写入返回409；客户端必须保留输入并显式核对。
- 改密、管理员重置或账号停用会撤销该用户全部Web和小程序会话。
- 成员或业务grant撤销后，即使Session尚未到期，后续请求也会被拒绝。

## 本地验证与正式验收

本地隔离测试使用注入式微信交换器，只验证code交换后的服务端流程，不访问微信、不构造生产身份。正式上线前仍需：

1. 组织小程序AppID及受控AppSecret。
2. 微信项目成员/体验成员和测试微信号。
3. 已备案、可达且配置到微信后台的HTTPS request域名。
4. 在开发者工具正式项目及真机验证登录、首次绑定、重登、退出、过期、改密撤销和角色撤销。
5. 生产密钥轮换、监控告警、限流容量、多实例及独立安全评审。
