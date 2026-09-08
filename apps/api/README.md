# @caau/api

NestJS 11 + TypeScript 严格模式 API。当前只有 `GET /api/v1/health`，返回 `{"status":"ok","service":"caau-api"}`；它仅证明 API 进程存活，不检查数据库或外部服务。

从仓库根目录执行：

```sh
corepack pnpm dev:api
# 或先构建后启动
corepack pnpm --filter @caau/api build
corepack pnpm --filter @caau/api start
```

默认监听 `127.0.0.1:3000`。`dev:api` 会先编译再启动，**当前不热重载**，修改后 Ctrl+C 并重新运行。可将本目录 `.env.example` 复制为 `.env` 后调整 HOST、PORT、CORS_ORIGINS；现有环境变量优先于文件，未设置也能启动。CORS 使用明确来源白名单，不是业务鉴权。

测试读取编译后代码：先 build，再运行 `corepack pnpm --filter @caau/api test`。测试监听随机回环端口，并在结束后关闭。

完整步骤与限制见 [本地工程文档](../../docs/runbooks/local-tooling.md)。不建立未确认的业务模块或业务表。
