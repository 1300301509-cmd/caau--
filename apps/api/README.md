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

CAAU-004 新增 `/api/v1/authorization/*`：内部用户、组织/成员、赛事/任务权限锚点、审核员指派、本地会话鉴权和审计。默认关闭身份模式，开启必须回环且非 production；使用方法、权限矩阵、dev 迁移和离线会话见 [权限操作文档](../../docs/runbooks/authorization.md)。仅权限底座，不实现材料或真实微信登录。

CAAU-005 第一段提供 `/api/v1/events`、`material-tasks`、`workspace` 真实业务接口；创建、指派、配置、发布和审计同事务，发布前后可见性分离，已发布要求 V1 受数据库保护。操作和限制见 [任务文档](../../docs/runbooks/material-tasks.md)。

完整步骤与限制见 [本地工程文档](../../docs/runbooks/local-tooling.md)。不建立未确认的业务模块或业务表。

第二段 workflow 模块提供私有文件上传/确认/下载、草稿 CAS、不可变幂等提交、整包审核/退回、延期与同机构交接。默认私有目录 `.local/files`，服务端可设 `CAAU_PRIVATE_FILE_ROOT`；无静态文件服务，完整规则/限制见上述任务文档。所有接口仍依赖受限本地身份模式，非生产身份方案。
