# @caau/api

NestJS 11 + TypeScript 严格模式 API。`GET /api/v1/health` 返回 `{"status":"ok","service":"caau-api"}`，仅证明进程存活。独立 `GET /api/v1/ready` 用 Prisma SELECT 1 检查数据库；缺配置或连接失败时返回通用 503，最长探测等待 1500ms。`GET /api/openapi.json` 提供由控制器/DTO 生成的真实契约，不需要数据库连通。

从仓库根目录执行：

```sh
corepack pnpm dev:api
# 或先构建后启动
corepack pnpm --filter @caau/api... build
corepack pnpm --filter @caau/api start
```

默认监听 `127.0.0.1:3000`。`dev:api` 会先编译再启动，**当前不热重载**，修改后 Ctrl+C 并重新运行。可将本目录 `.env.example` 复制为 `.env` 后调整 HOST、PORT、CORS_ORIGINS；现有环境变量优先于文件，未设置也能启动。CORS 使用明确来源白名单，不是业务鉴权。

测试读取编译后代码：先 build，再运行 `corepack pnpm --filter @caau/api test`。测试监听随机回环端口，并在结束后关闭。

使用本地 PostgreSQL 时按 [数据库文档](../../docs/runbooks/database-contract.md) 先 db:setup、db:up，再 db:api；后者只注入 app 连接，不把迁移 owner 凭据传给 API。本机真实 PostgreSQL 连接、断连失败与同进程恢复已通过独立 db:test 验证；探测替身测试仍不代表真实数据库验证。

完整步骤与限制见 [本地工程文档](../../docs/runbooks/local-tooling.md)。不建立未确认的业务模块或业务表。
