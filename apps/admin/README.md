# @caau/admin

React 19 + Vite 8 + Ant Design 6 管理后台工程。当前产品导航只呈现“资料审核”，采用紧凑的 Tabler 风格壳层；`/` 与 `/materials` 进入同一套单份材料办理、共享审核和历史页面。身份仍使用明确标识的本地测试会话，业务数据和权限只通过 `@caau/api-client` 访问后端，不依赖服务端源码或 ORM。

从仓库根目录运行 `corepack pnpm dev:admin`，打开 `http://127.0.0.1:5173/materials`，并在另一终端以本地身份模式运行 API。工程连接辅助页保留在 `/system/health`，不属于产品导航；无数据库配置时就绪检查应显示 HTTP 503，不影响健康连接检查。`/workspace` 仅为既有自动化回归暂留隐藏兼容入口，不作为当前产品模块。

API 默认来源为 `http://127.0.0.1:3000`。可复制本目录 `.env.example` 为 `.env.local` 修改 `VITE_API_BASE_URL`；修改后重启开发服务/重新构建。`VITE_*` 是公开编译变量，不能放凭据。

```sh
corepack pnpm --filter @caau/admin... build
corepack pnpm --filter @caau/admin preview
```

preview 在 `http://127.0.0.1:4173` 服务生产构建；默认 API CORS 已允许该地址。预览服务器仅供本地验收，不是生产部署。

完整检查、浏览器测试与环境约束见 [本地工程文档](../../docs/runbooks/local-tooling.md)。
