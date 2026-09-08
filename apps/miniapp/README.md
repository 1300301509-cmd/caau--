# @caau/miniapp

Taro 4.2.1 + React 18 微信小程序工程。只有技术连接页，通过 @caau/api-client 生成契约及注入 `Taro.request` 的适配器请求 `/api/v1/health`、`/api/v1/ready`，没有业务导航、账号或业务数据。就绪请求与存活请求独立，无数据库配置时就绪应显示 503；不引入 Prisma、Nest 或 Node/fetch 传输运行库。

```sh
# 在仓库根目录；另一个终端先启动 corepack pnpm dev:api
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

当前通过的是微信编译、构建产物检查、请求逻辑测试，以及替换为 Node 传输适配器的真实 HTTP 联调；**未进行微信开发者工具或真机运行验证**。详见 [本地工程文档](../../docs/runbooks/local-tooling.md)。
