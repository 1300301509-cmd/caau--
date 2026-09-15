# @caau/miniapp

Taro 4.2.1 + React 18 微信小程序工程。保留“待办、赛事、我的”三项底部导航。新版单份任务支持自由新增、名称/类别/说明、私有附件上传/确认/绑定、草稿/冲突核对、独立提交/同键重试、退回修改重交、五态/实际操作人时间、不可变版本/动作快照和受控下载；旧任务继续进入原整包详情。通过 @caau/api-client 的生成契约、MaterialEditor 客户端命令状态和 Taro.request 适配器访问真实 API；不跨应用引用源码。技术连接页保留在“我的”中。就绪请求与存活请求独立，无数据库配置时就绪应显示 503；不引入 Prisma、Nest 或 Node/fetch 传输运行库。

```sh
# 在仓库根目录；先按任务手册迁移，再在另一终端运行：
# CAAU_IDENTITY_MODE=local corepack pnpm db:api
corepack pnpm dev:miniapp
# 单次生产构建
corepack pnpm --filter @caau/miniapp... build
```

构建输出到本目录 `dist/`。微信开发者工具应导入 **apps/miniapp**，项目配置的 miniprogramRoot 为 `dist/`。`touristappid` 仅是明确标记的游客占位值，不是用户微信 AppID；不保证游客模式具备完整运行/预览权限。实际测试身份以用户的平台资源为准，请在工具中选择有权限的测试 AppID；工具生成的 project.private.config.json 已忽略，若工具修改了受追踪的项目配置，提交前必须审查并保留仓库占位值，不混入本机平台配置。

默认 API 是 `http://127.0.0.1:3000`，仅供电脑本地模拟器。要覆盖地址，在启动/构建前显式设置：

```sh
TARO_APP_API_BASE_URL=https://YOUR_TEST_API_HOST corepack pnpm dev:miniapp
```

上面域名是占位值，不可直接联网使用。`TARO_APP_API_BASE_URL` 为公开编译变量，修改后需重启/重新编译；本目录 `.env.example` 只展示变量结构，不要求依赖 Taro 自动加载它。

仓库保持 `urlCheck: true`。本地 HTTP 调试需要使用者在开发者工具里**仅对本地调试**关闭合法域名检查；此设置不证明生产 HTTPS/域名配置通过。手机上的 127.0.0.1 指向手机自身，不能请求电脑 API；真机需可达测试服务、合法 HTTPS 域名、平台权限及相应配置，不能直接使用本机默认地址。

“我的”提供明确标注的本地测试身份入口：从本机忽略的 auth:local 会话文件复制合成 token 到密码框，验证承办身份后清空输入，仅内存保存。不通过微信聊天发送会话文件、不保存到 Storage、不截令牌、不冒充正式微信登录。材料使用 chooseMessageFile/readFile，幂等键使用 getRandomValues；这些平台 API 的权限、文件来源、最大文件耗时和离开提醒仍待微信实测。

CAAU-012 D 当前通过源码静态检查、正式weapp构建、Taro ArrayBuffer传输/文件约束测试及完整PostgreSQL/Web回归。开发者工具实际启动被关闭的IDE服务端口阻挡；同时仍缺组织AppID、HTTPS合法域名和测试微信。新版业务页与真机流程均未通过平台验收，不能把构建当作微信运行。详见 [Taro操作与平台验收](../../docs/runbooks/individual-material-miniapp.md)。
