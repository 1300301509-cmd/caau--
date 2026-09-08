# @caau/admin

React 19 + Vite 8 + Ant Design 6 管理后台工程。当前仅有健康接口连接页，没有业务菜单、登录或演示数据。

从仓库根目录运行 `corepack pnpm dev:admin`，打开 `http://127.0.0.1:5173`，并在另一终端运行 `corepack pnpm dev:api`。点击“检查后端连接”验证真实 HTTP 请求。页面不会将未请求或请求失败显示为成功。

API 默认来源为 `http://127.0.0.1:3000`。可复制本目录 `.env.example` 为 `.env.local` 修改 `VITE_API_BASE_URL`；修改后重启开发服务/重新构建。`VITE_*` 是公开编译变量，不能放凭据。

```sh
corepack pnpm --filter @caau/admin build
corepack pnpm --filter @caau/admin preview
```

preview 在 `http://127.0.0.1:4173` 服务生产构建；默认 API CORS 已允许该地址。预览服务器仅供本地验收，不是生产部署。

完整检查、浏览器测试与环境约束见 [本地工程文档](../../docs/runbooks/local-tooling.md)。
