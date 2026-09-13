# CAAU-010 小程序验收准备与资源核查

日期：2026-09-09。基线 `bd57a06`，分支 `codex/caau-010-readiness`。本轮只核查本机、构建产物和平台前置资源；不重做 CAAU-005、不购买/发布资源、不访问 Keychain/微信用户数据、不读取或提交会话与生产数据。

## 实际核查结果

| 项目 | 操作与证据 | 结果 |
| --- | --- | --- |
| Git | `git status --short --branch`、`git log -1` | 基线正确，开始时工作区干净。 |
| 微信开发者工具 | 检查 `/Applications`、用户 Applications、Spotlight、LaunchServices 三个常见名称、Homebrew cask、pkgutil、运行进程及常见 CLI 路径 | **未安装/未发现**。普通 `/Applications/WeChat.app` 存在，只是桌面微信，不能证明开发者工具、登录态或小程序权限。 |
| 小程序工程 | 读取 `apps/miniapp/project.config.json`；执行 `corepack pnpm --filter @caau/miniapp... build` | 构建通过。导入目录应为 `apps/miniapp`，`miniprogramRoot=dist/`；产物有 5 页及“待办、赛事、我的”三项 tab。因工具缺失，**导入和运行未验证**。 |
| AppID | 只读跟踪配置、检查私有配置/相关环境变量是否存在，不读取用户账号区或 Keychain | 跟踪配置是 `touristappid`；未发现 `project.private.config.json` 或 AppID 环境变量。真实 AppID 是否存在、当前微信是否为项目成员均**无法确认**。 |
| 测试微信号 | 不读取桌面微信账号、联系人或本机用户数据 | 是否已有两个承办方测试微信号、是否加入项目/体验成员均**未验证**。 |
| API 可达性 | 检查监听地址、编译变量、证书/隧道配置与常见 tunnel CLI | 当前 API 为 `http://127.0.0.1:3000` 且仅监听回环；无已配置 HTTPS origin、证书/隧道文件或 cloudflared/ngrok/frp 等工具。电脑模拟器可使用本机地址（需仅本地关闭域名校验），手机不可达。 |
| 合法域名 | 仓库 `urlCheck=true`；无真实 AppID/工具登录，不能查看微信公众平台配置 | `request` / `downloadFile` 域名均**未验证**。当前上传和模板下载都由 `Taro.request` 走 API（下载为 ArrayBuffer 后写入并 `openDocument`），并未调用 `wx.downloadFile`；当前实现至少要求 API origin 在 **request 合法域名**。若以后改用 `downloadFile`，同源也应加入对应域名。 |
| 平台文件能力 | 静态核对源码/构建产物含 `chooseMessageFile`、`readFile`、二进制 `request`、上传确认、`writeFile`、`openDocument`、离开提醒；构建日志在忽略目录 `.local/evidence/caau-010/` | 编译存在不等于平台运行。文件选择、上传、确认、模板下载在开发者工具中均**未验证**；聊天文件来源、大小、权限、临时路径、打开文档与错误恢复也未验证。 |
| 真机 | 无可达 HTTPS API、AppID/成员证明或工具 | 所有真机项目**未验证**。 |

没有发现资源不代表用户或组织账号下必然不存在；只表示当前机器和仓库没有可安全确认的证据。本轮没有尝试登录微信公众平台、安装软件、关闭系统安全、开放防火墙、购买域名、部署或发布体验版。

## 目标流程验收矩阵

目标数据：两个承办方、两个赛事、脱敏/合成材料。总部继续用 Web；承办方用小程序。开发者工具与真机分别留证，不互相替代。

| 场景 | 本地 API/Web/Chromium 既有证据 | 开发者工具 | 真机 |
| --- | --- | --- | --- |
| 两承办方、两赛事列表隔离 | CAAU-005 隔离 PostgreSQL/API 已通过 | 未验证 | 未验证 |
| 待办 → 草稿 | Web 联调及客户端状态测试已通过 | 未验证 | 未验证 |
| 选择文件 → 上传 → 确认 | Web/真实文件 API 已通过；Taro 仅编译 | 未验证 | 未验证 |
| V1 提交 → 总部退回 | Web/API 已通过 | 未验证 | 未验证 |
| V2 重交 → 总部通过 → 历史 | Web/API 已通过 | 未验证 | 未验证 |
| 跨机构任务/附件拒绝 | API/Chromium 已通过 | 未验证 | 未验证 |
| 私有模板名称与下载 | API/Web 已通过；Taro 仅编译 | 未验证 | 未验证 |
| 弱网、取消选择、上传中断、重复点击 | 客户端/API 部分自动化已通过 | 未验证 | 未验证 |
| 退出/重登、平台离开提醒 | 本地会话客户端测试已通过 | 未验证 | 未验证 |
| 正式微信登录与微信身份映射 | 未实现；当前仍是明确标注的本地 token | 未验证 | 未验证 |

因此 MVP-02 中的“微信小程序登录”及 MVP-09 仍未通过；CAAU-010 保持进行中且受资源阻塞。

## 用户需办理的具体事项

均由组织资源负责人操作；不要在聊天中发送 AppSecret、会话 token、生产数据库、生产材料或私人微信数据。

1. **安装并登录开发者工具**
   - 办理位置：微信官方小程序开发者工具下载页 `https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html`，选择 macOS Apple silicon 版本；按正常系统安装流程安装，不关闭 Gatekeeper/SIP。
   - 完成标准：工具能启动并由有权限的微信扫码登录。只需告知“已安装、已登录”，无需发送扫码信息或登录数据。
2. **确认小程序主体、AppID 与成员权限**
   - 办理位置：微信公众平台 `https://mp.weixin.qq.com/`；通常在“开发 → 开发管理 → 开发设置”查看 AppID，在“管理 → 成员管理”添加项目成员/开发者和体验成员。平台菜单名称如有更新，以当前后台为准。
   - 完成标准：开发者工具中本地导入 `apps/miniapp` 后选择有权 AppID；AppID 放在工具生成且 Git 已忽略的 `project.private.config.json`，不要改/提交仓库的 `touristappid`。只需告知已配置成功及当前账号角色，不需在聊天中粘贴 AppID；AppSecret 绝不发送。
3. **准备测试微信身份**
   - 至少准备两个经批准的测试微信号，对应两个承办组织；加入项目成员或体验成员，具体取决于开发/预览方式。总部管理员与审核员仍可使用 Web 合成身份。
   - 当前小程序只有本地测试 token，不是正式微信登录。若 CAAU-010 要验收正式登录，还需另行授权实现 `wx.login` code 交换与服务端组织成员映射；AppSecret 只写入受控服务端秘密管理/环境，不进前端、聊天或 Git。
4. **提供手机可达的 HTTPS 测试 API**
   - 办理位置：组织已有测试云环境/网关；本轮不购买。要求公开受信 TLS 证书、稳定 HTTPS origin、部署当前 API 与隔离测试数据库/私有文件存储，不使用 `127.0.0.1`、局域网 HTTP 或生产数据。
   - 微信公众平台位置通常为“开发 → 开发管理 → 开发设置 → 服务器域名”。把 API origin 加入 request 合法域名；如计划使用 `wx.downloadFile`，也加入 downloadFile 合法域名。当前模板下载走 request，不能只配置 downloadFile。
   - 同时以该公开 origin 编译 `TARO_APP_API_BASE_URL`。只需提供公开测试 API base URL、`/api/v1/ready` 可达确认及两类域名已配置的状态；服务端密钥、数据库 URL、证书私钥不要发送。
5. **准备脱敏样本与设备**
   - 在本机忽略目录准备五项小体积 txt/pdf/png/jpg/jpeg 合成材料和至少一个模板；不经聊天发送真实材料。准备至少一台可调试手机，记录系统/微信版本即可，不采集设备标识。

## 恢复测试所需最小信息

用户只需回复以下非秘密状态：

- 开发者工具“已安装并登录”，当前账号“已是开发者/项目成员”；
- 有权 AppID 已在本机私有项目配置中选择成功；
- 两个测试微信号已加入所需成员范围；
- 公开测试 API base URL（可公开的 hostname）及 request/downloadFile 域名配置状态；
- 可用真机数量、平台（iOS/Android）和是否允许本轮创建/发布**体验版**。未得到发布授权前只做本地开发者工具调试，不上传体验版。

收到这些状态后，先在开发者工具分别记录导入、编译、Network、文件操作与完整 V1/V2 流程；再用独立合成任务做真机流程和跨机构反例。不会复用或破坏已通过的 CAAU-005 演示历史。
