# ADR-0011：总部 Web 账号密码与 Cookie 会话认证

状态：CAAU-029 设计基线，待分阶段实现。

## 1. 背景与现状核验

总部 Web 当前依赖 CAAU-015 本地测试身份选择。现场源码核验结果如下：

- `InternalUser` 只有 `id`、`displayName`、`active`；角色位于 `OrganizationMember.role`，赛事、任务、承办申请办理/审核继续由独立 grant 和 scope 控制。前端不能自行选择角色。
- `Session` 已保存 `userId`、唯一 `tokenHash`、`expiresAt` 和 `revokedAt`。签发值是 `randomBytes(32)` 生成的256位opaque token，数据库只保存SHA-256；鉴权时重读账号active、成员角色和业务授权。
- 全局Guard默认拒绝没有显式策略的端点。现有Bearer会话同时被Web、本地脚本和小程序使用。
- 本地身份端点已受显式`CAAU_IDENTITY_MODE=local`、非production和回环HOST三重约束，但Web各业务页分别保存Bearer token并各自渲染身份选择。
- 当前`AuthorizationService.db()`错误地把授权数据库可用性与`localIdentity`开关绑定；正常模式关闭测试身份后，正式会话也无法工作。该耦合必须拆除。
- 当前CORS只允许精确origin但`credentials=false`；fetch transport不发送Cookie。首个超级管理员脚本只创建身份/角色，不创建账号密码。

结论：不建立第二套用户、角色或业务授权模型。账号密码只作为既有`InternalUser`的一种正式认证凭据；成功认证仍签发既有`Session`，所有业务策略继续以后端当前数据为准。

## 2. 数据模型

对现有表做追加迁移，不改写历史迁移，不删除或替换旧数据：

### 2.1 `InternalUser`

新增：

- `loginName String? @unique @db.VarChar(64)`：正式账号名，写入前按ASCII小写规范化；允许null以保留既有无密码的本地合成身份。
- `passwordHash String? @db.VarChar(255)`：只保存版本化密码哈希字符串。
- `mustChangePassword Boolean @default(false)`：管理员创建或重置后为true。
- `passwordChangedAt DateTime?`：最近一次凭据建立/变更的服务器时间。

首版账号名采用`^[a-z0-9][a-z0-9._-]{2,63}$`，不与显示名混用。迁移不为既有用户生成账号名、默认密码或可登录凭据。

### 2.2 `Session`

保留原opaque会话，仅追加`createdAt DateTime @default(now())`用于会话与安全审计。服务端内部仍通过opaque token定位Session，不向正式Web JavaScript返回该token。

CSRF token不以明文或可逆值入库，也不在每次刷新时轮换而破坏多标签页。API使用独立服务端`CAAU_CSRF_SECRET`对`Session.id + createdAt`做HMAC派生稳定的会话级CSRF token；登录和`GET /authentication/session`可返回同一派生值，Session轮换/撤销后自然失效。生产CSRF密钥至少32随机字节，独立于登录限流HMAC密钥。

### 2.3 登录限流记录

新增`AuthenticationThrottle`，保存HMAC后的限流subject、失败次数、窗口开始、阻塞截止和更新时间。subject分别覆盖规范化账号和客户端地址，不保存原始账号/IP；HMAC密钥来自服务端配置，禁止提交或下发前端。

首版固定基线：同账号15分钟内5次失败后阻塞15分钟，同客户端地址15分钟内20次失败后阻塞15分钟。成功登录清理对应账号失败计数；限流响应和账号/密码错误对外都使用统一提示，不暴露账号是否存在、是否停用、是否无密码或具体限流维度。多实例共享数据库记录，不使用仅进程内计数冒充生产限流。

## 3. 密码安全

- 使用Node.js内置异步`scrypt`，首版参数`N=131072, r=8, p=1`、随机16字节salt、64字节输出，并设置满足该参数的显式`maxmem`。编码格式包含算法、版本、参数、salt和hash，以便未来登录成功后升级参数。
- 每个密码使用独立CSPRNG salt；禁止明文、可逆加密、无salt摘要、日志、审计、URL、命令行参数或前端持久化。
- 密码长度12～128个Unicode字符，同时限制UTF-8字节长度以约束资源消耗；不强制容易预测的字符类别组合，允许粘贴和密码管理器。
- 查询不到账号时仍对固定dummy hash执行同参数scrypt，再返回与错误密码完全相同的状态、消息和近似时序。
- 密码比较使用恒定时间比较。DTO严格拒绝额外字段；错误响应不回显输入。
- 登录哈希工作使用异步worker pool；限流检查先于昂贵哈希。生产容量和拒绝服务阈值仍需部署压测，不能由本地功能测试替代。

## 4. 会话、Cookie、CORS与CSRF

### 4.1 Cookie

正式Web登录成功后签发新的既有opaque Session：

- production名称：`__Host-caau_session`；本地HTTP开发名称：`caau_session`；
- `HttpOnly`、`Path=/`、不设置`Domain`、`SameSite=Lax`；
- production强制`Secure`；开发仅允许回环HTTP使用非Secure Cookie；
- 首版绝对有效期8小时，不做无限滑动续期。数据库过期时间和Cookie Max-Age一致。

生产Web与API必须部署在同站点语义下并通过HTTPS访问；TLS可在受控反向代理终止，API与数据库内网链路另按部署环境保护。production启动时拒绝HTTP Web origin、通配origin、local identity模式或缺少独立CSRF/限流HMAC密钥。Cookie不使用localStorage/sessionStorage。

### 4.2 CORS

- 继续使用精确`CORS_ORIGINS`白名单，禁止`*`；开启`credentials=true`。
- 允许`Content-Type`、`Authorization`和`X-CSRF-Token`；响应不向任意origin开放。
- fetch transport对Web使用`credentials: 'include'`；Taro transport保持Bearer，不依赖浏览器Cookie。
- 反向代理只有在显式配置可信跳数/地址时才提供客户端IP，禁止无条件信任`X-Forwarded-For`。

### 4.3 CSRF

仅依赖SameSite不足以覆盖未来部署变化，因此Cookie认证的`POST/PUT/PATCH/DELETE`同时执行：

1. 请求`Origin`必须精确命中允许列表；
2. 请求头`X-CSRF-Token`必须存在，并与服务端从当前Session派生的期望值恒定时间比较。

登录成功和安全的`GET /authentication/session`返回稳定的会话级CSRF token，SPA只保存在内存；刷新或新标签页通过HttpOnly Cookie重新获取，不会使其他标签页现有token失效。跨站页面无法读取精确CORS响应。登录端点本身没有既有CSRF token，因此强制校验Origin。Bearer认证请求不自动携带Cookie，不要求CSRF头，保持现有小程序/脚本兼容；若同一请求同时携带Cookie和Bearer则拒绝，避免混淆身份。

## 5. 接口与权限

### 5.1 认证接口

- `POST /api/v1/authentication/login`：账号+密码；统一失败消息；成功设置Cookie并返回当前账号最小身份、`mustChangePassword`、过期时间和CSRF token，不返回session token。
- `GET /api/v1/authentication/session`：以Cookie恢复登录并轮换/返回CSRF token；过期、撤销、停用统一401。
- `POST /api/v1/authentication/logout`：CSRF保护，撤销当前Session并清Cookie；重复退出保持安全、前端最终回到登录页。
- `POST /api/v1/authentication/change-password`：当前密码+新密码；成功在一个事务中更新哈希、清除`mustChangePassword`、撤销该用户全部旧Session并签发新Cookie Session，使其他设备立即失效而当前流程可继续。

当`mustChangePassword=true`时，全局授权层只允许读取当前认证状态、修改密码和退出；任何业务接口都返回403，不靠前端隐藏。

### 5.2 账号管理接口

具有现有账号管理权限的`SYSTEM_ADMIN`或`HEADQUARTERS_SUPER_ADMIN`可访问账号管理；后端仍是唯一安全边界：

- 列出账号及其active、是否已配置密码、是否必须改密、成员角色和现有业务grant摘要；响应永不包含哈希或会话token。
- 创建账号：一次事务写入`InternalUser`正式凭据及明确选择的组织成员角色；临时密码符合相同策略，`mustChangePassword=true`。
- 启停账号：停用与撤销其全部Session同事务；恢复账号不恢复旧Session。
- 重置密码：管理员提交新的临时密码，更新哈希、设强制改密并撤销全部Session；服务端不生成、返回或记录默认密码。
- 配置现有成员角色和业务授权继续复用`OrganizationMember`、`EventGrant`、`HostingApplicationHandlerGrant`、`HostingApplicationReviewGrant`等既有模型和策略，不把角色写进Cookie，也不另建前端权限表。

普通`SYSTEM_ADMIN`不能建立、停用、重置或授予`HEADQUARTERS_SUPER_ADMIN`；只有超级管理员可管理该角色。禁止管理员通过重置接口重置自己，须走修改密码；禁止停用当前自己及最后一名active超级管理员。角色/grant变化无需依赖会话缓存，因为每个业务请求都会重读权威关系。

## 6. 首个超级管理员

提供受控一次性CLI，复用现有advisory lock和Serializable事务：

- 必须显式开启初始化开关、提供目标数据库及已确认总部组织；检测到active超级管理员后拒绝。
- 账号名、显示名显式输入；密码只允许隐藏TTY输入两次或从受限stdin读取，禁止命令行参数、默认值、环境变量、stdout、日志或聊天。
- CLI在本进程完成scrypt，只写哈希，原子创建`InternalUser`和`HEADQUARTERS_SUPER_ADMIN`成员；不签发会话。
- 成功输出仅说明初始化完成，不输出密码、哈希或session凭据。

本地准备方式与生产运行手册分开。生产执行需要受控数据库管理身份、变更审批和HTTPS配置；本地通过不等于生产初始化或安全验收。

## 7. Web 结构

- 在应用入口建立统一`AuthProvider/AuthGate`，启动时调用Cookie session接口；业务页面只从API取得当前身份、角色和能力。
- 新增`/login`、首次/主动修改密码页和仅有账号管理权限可见的`/accounts`。
- 未登录访问受保护深链时记录经校验的站内相对路径；登录/完成强制改密后返回原路径。拒绝绝对URL、`//`、反斜线和跨源跳转。
- 401清空前端受保护状态并显示“登录已过期，请重新登录”；403保留登录但显示无权限。刷新通过HttpOnly Cookie恢复。
- 导航入口按API能力展示；直接访问和每个API请求仍独立鉴权。
- 正常模式完全不请求或渲染本地测试身份。显式local模式可在登录页显示独立标记的开发入口，继续签发Bearer并存当前标签页；业务组件不再各自复制身份选择器。

## 8. 小程序兼容

全局Guard支持两种互斥凭据：

- Web：HttpOnly Cookie + unsafe请求CSRF；
- 小程序、现有本地脚本及未来微信换取会话：`Authorization: Bearer <opaque token>`。

二者都解析到同一`Session`和`InternalUser`，执行同一角色/业务授权策略。不会向小程序发送Cookie，也不会把Web密码交给小程序。CAAU-027 D现有Bearer调用和本地测试模式回归必须持续通过。

## 9. 会话撤销与审计

- 退出：撤销当前Session。
- 修改密码：撤销该用户全部旧Session，轮换当前Cookie Session。
- 管理员重置密码、停用账号：撤销该用户全部Session，不签发新会话。
- 过期：每次请求按数据库服务器权威记录拒绝；前端转登录页。
- 登录成功/失败/限流、退出、改密、重置、启停、账号/角色/grant管理写安全审计。审计只记录动作、结果、actor/target UUID和允许列表上下文，不记录账号名、IP原值、密码、Cookie、CSRF或token。

## 10. 取舍与非目标

首版不做公众注册、找回密码、短信/邮件验证码、微信扫码登录、MFA、SSO、跨站点Cookie部署或正式小程序登录。没有“选择角色登录”；一个账号的并存角色由后端拒绝优先策略处理。正式部署前仍需独立完成TLS/代理/密钥注入、容量压测、安全响应头、备份恢复、监控告警和安全评审。