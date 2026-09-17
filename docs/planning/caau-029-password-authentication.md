# CAAU-029 总部 Web 正式账号密码认证计划

状态：A/B/C/D已完成本地交付；生产部署与安全环境验收不在本次完成声明内。

## 1. 目标

在不复制`InternalUser`、角色、业务授权和opaque Session的前提下，为总部React Web和NestJS API增加正式账号密码认证。正常模式使用HttpOnly Cookie；本地测试和小程序Bearer保持兼容。详细安全决策见[ADR-0011](../adr/0011-password-cookie-authentication.md)。

## 2. 范围

首版包含：

- 管理员创建/启停账号、设置现有组织成员角色与业务授权、重置临时密码；
- 账号密码登录、退出、刷新恢复、绝对过期、主动/首次强制修改密码；
- HttpOnly Cookie、CSRF、精确CORS、共享数据库限流、统一登录错误；
- 全局Web认证门、权限导航和原路径返回；
- 受控首个超级管理员初始化；
- local identity端点继续严格隔离，正常模式不可见不可用；
- 既有业务数据、角色/grant、历史、迁移和小程序Bearer流程回归。

不包含公众注册、忘记密码自助找回、短信/邮件验证码、扫码登录、MFA、SSO、正式微信登录、生产部署或安全认证。

## 3. 分阶段实施

### A：设计与基线（独立提交）

范围：

- 现场核验现有InternalUser、Session、Guard、CORS、Web身份选择和超级管理员脚本；
- 固定数据追加、scrypt、Cookie/CSRF、限流、撤销、初始化及兼容方案；
- 建立验收矩阵和文档关系，不修改运行时代码/schema。

验收：文档链接、格式/差异检查通过；设计提交可独立说明，明确未实现项。

### B：后端、迁移与生成契约（独立提交）

范围：

- 追加凭据、Session创建时间和持久限流模型/迁移，保留全部旧行；CSRF由独立服务端密钥按Session稳定派生；
- 拆分数据库可用与local identity开关；
- 密码哈希/校验、Cookie签发清理、Origin+CSRF、登录/恢复/退出/改密；
- 账号列表/创建/启停/重置及角色/现有业务授权服务端能力；
- 受控初始化CLI；先改DTO/控制器，再生成OpenAPI客户端。

验收：

- 单元覆盖scrypt编码、随机salt、恒定比较路径、输入边界、Cookie属性及配置拒绝；
- 真实隔离PostgreSQL/API覆盖正确/错误/不存在账号统一响应，账号/IP限流，未登录，Cookie/CSRF，过期、退出、改密轮换、重置/停用全撤销、越权、最后超级管理员保护；
- 正常模式local identity GET/POST均不可用；Bearer业务及小程序客户端测试不回退；
- migration deploy重复、status/diff、shadow、旧用户/Session/角色/grant/历史保留。

### B阶段实际证据（2026-09-17）

- 追加第8个迁移：既有用户保持无凭据不可密码登录，Session追加创建时间，新建共享登录限流表；deploy重复、status/diff、shadow/replay及旧身份、角色、grant、业务历史和私有字节保留通过。dev只执行前向deploy，未reset或删卷。
- 后端实现版本化scrypt、统一登录错误、账号/客户端HMAC限流、Cookie Session、稳定HMAC CSRF、Origin/CORS、登录恢复/退出/改密、账号列表/创建/重置/停用撤销、最后超级管理员保护，以及受控stdin/隐藏TTY初始化脚本。正常模式与授权数据库解耦，local签发保持三重限制。
- OpenAPI和生成客户端已更新；fetch在Cookie请求使用`credentials=include`和CSRF，在Bearer请求强制`credentials=omit`；Taro适配器未改变。
- 完整隔离`db:test` **47/47、0失败、0跳过**，其中新增3项真实认证集成子测试；初跑暴露旧测试错误假设“账号恢复后旧会话复活”，按新需求改为必须签发新会话后全套通过。密码/API/client单测通过。
- B提交时尚未实现全局Web登录门、登录/改密/账号管理页面或正常模式页面收敛；这些内容已在后续C/D阶段完成。

### C：Web登录与账号管理（独立提交）

范围：

- 全局AuthProvider/AuthGate和Cookie fetch；
- `/login`、首次/主动修改密码、退出、过期提示和安全returnTo；
- `/accounts`账号创建、启停、重置、角色/业务授权管理；
- 导航按API权限显示；正常模式移除各业务页测试身份选择；local模式集中到明确开发入口。

验收：

- 375/768/1440px、键盘焦点、标签/错误提示、粘贴/密码管理器友好；
- 浏览器验证深链→登录→原页、刷新恢复、强制改密、退出、401过期、403越权、重置/停用后另一标签失效；
- 正常模式页面和网络均不出现local identity签发入口；
- 既有承办申请、办赛材料和赛事详情真实接口流程不回退。

### C阶段实际证据（2026-09-17）

- 全局`AuthProvider/AuthGate`覆盖受保护深链：正常模式恢复Cookie会话，未登录显示正式登录；首次临时密码只能进入强制改密；401清空受保护状态，403不伪造权限。工程`/system/health`保持公开且不承载业务数据。
- `/accounts`仅在后端`canManageAccounts`为真时进入导航；支持创建、启停、重置，以及既有组织角色、赛事范围、承办申请办理/审核grant管理。按钮可见性不是安全边界，接口继续逐请求鉴权。
- 承办申请旧控制器已从“自行解析Authorization头”收敛为消费Guard解析的Session token，Cookie和Bearer执行同一服务/策略；OpenAPI为保护接口同时声明Cookie或Bearer。
- 正常模式不渲染本地身份选择；local模式仍恢复原标签页Bearer流程。`IndividualWorkspace`增加平台无关Cookie凭据状态，不把Cookie/token暴露给React。
- Web E2E **9/9**；隔离真实Chromium覆盖错误登录、首次强制改密、原`/accounts`目标返回、刷新恢复、权限页、Cookie承办申请读取、退出和375px无溢出。

### D：完整回归、体验准备与交付（独立提交）

范围：

- 完整`check`、三端`build`、`test`、普通Web E2E和隔离`db:test`；
- 在dev库只通过受控CLI/API准备明确的本地体验账号，不直接写业务表；
- 更新README、roadmap、架构、认证和部署运行手册；恢复服务并核验入口。

验收报告分别列出：本地构建/API/数据库/浏览器结果、未运行的生产HTTPS/代理/多实例压测/远程CI/正式微信/真机项。不得把本地通过描述为生产安全配置或部署验收。

### D阶段实际证据（2026-09-17）

- 隔离`db:test`最终 **48/48、0失败、0跳过**：追加迁移deploy/status/diff/shadow/replay、旧数据保留、受控初始化、密码/Cookie/CSRF、统一错误、限流、撤销、正常模式关闭local、Bearer业务回归及真实正式登录浏览器均通过。
- `test:e2e` **9/9**；`check`、三端`build`和普通`test`按最终代码重跑，结果见roadmap。初轮失败分别定位为旧会话测试假设、测试Cookie属性误写、local测试模式配置及Ant中文按钮定位器，均修复后从头通过。
- dev库只执行第8个前向迁移。既有唯一无凭据超级管理员由受控CLI补齐凭据并写审计；随机临时密码仅保存在忽略且0600的`.local/auth/caau-029-dev-login.txt`，未输出、未提交。正常模式API/Web已恢复，ready/HTTP及local签发503已核验。
- 本地登录页在1440/375px无横向溢出、`pageerror=0`；证据位于忽略目录`.local/evidence/caau-029-auth/`。
- 未运行：生产TLS/代理/密钥注入与轮换、多实例限流压测、生产数据库授权审查、备份恢复、监控告警、安全评审、远程CI；本任务没有新增正式微信身份或真机结论。操作见[认证运行手册](../runbooks/password-authentication.md)。

## 4. 验收矩阵

| 场景 | 后端期望 | Web期望 |
| --- | --- | --- |
| 正确账号密码 | 新建Cookie Session；不返回opaque token | 进入原目标页 |
| 错误/不存在/停用/无凭据账号 | 相同状态、消息和哈希路径；审计不含输入 | 单一错误，不提示账号存在性 |
| 连续失败 | 账号和客户端两个维度持久限流 | 统一失败，不显示内部计数 |
| 未登录访问 | 每个受保护API 401 | 跳登录并保存安全相对returnTo |
| 越权 | 当前身份有效但策略拒绝403 | 隐藏入口；深链显示无权而非伪造数据 |
| 刷新 | Cookie恢复并轮换CSRF | 原页恢复，无token存储 |
| 退出 | 当前Session revoked、Cookie清除 | 返回登录；浏览器后退不能恢复数据 |
| 绝对过期 | 401，不延长旧Session | 提示过期并重新登录 |
| 首次临时密码 | 仅session/改密/退出可用 | 强制改密，完成后返回原页 |
| 主动改密 | 全部旧Session撤销、当前会话轮换 | 当前继续，其他标签/设备401 |
| 管理员重置 | 新hash+mustChange；全部Session撤销 | 旧密码/旧会话失效，新临时密码强制改密 |
| 停用/恢复 | 停用立即全撤销；恢复不恢复旧Session | 已登录端收到401；恢复后须重登 |
| CSRF | Cookie unsafe请求缺/错Origin或token拒绝 | 正常请求自动带内存token |
| 正常模式local入口 | GET/POST均503且前端不请求不渲染 | 无测试身份选择 |
| 小程序Bearer | 不要求Cookie/CSRF，沿用同一Session/策略 | 现有Taro流程不回退 |
| 数据升级 | 旧用户凭据null，旧Session/角色/grant/历史保留 | 无隐式账号或默认密码 |

## 5. 数据与发布保护

- 只新增迁移，不reset、不删卷、不修改历史迁移。
- 密码、Cookie、CSRF、opaque token和限流HMAC密钥禁止进入Git、日志、截图、聊天或测试快照。
- 测试只操作隔离test服务及自身临时库；dev初始化必须显式授权。
- 发布回退先停止新登录写入并回退应用；追加列/表暂时保留，不能通过删除迁移回滚破坏账号和Session证据。
- production启用前必须另验HTTPS、精确origin、代理信任、密钥注入、多实例限流、监控告警和备份恢复。

## 6. A阶段现场结论

可以最小改造，且应复用：

1. 保留`InternalUser`为唯一人员身份；正式凭据用nullable追加字段关联现有行。
2. 保留`Session`和SHA-256 token索引；Web只改变凭据传输方式，业务服务仍接收服务端解析后的opaque token。
3. 保留`OrganizationMember.role`和全部grant/scope；账号管理只是受权管理这些既有关系。
4. 修复authorization数据库被local模式开关误绑；local开关只控制固定身份准备/列出/签发。
5. Web集中认证状态，删除业务页重复身份入口；API client增加Cookie credentials/CSRF能力，不把数据库或密钥引入前端。
