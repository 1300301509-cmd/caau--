# @caau/database

仅服务端使用的 Prisma 7.10.0 / pg 8.23.0 数据库入口。正式 `prisma/schema.prisma` 已包含 CAAU-004 内部身份、组织成员、范围授权锚点、会话及审计；CAAU-005 第一段追加 Event、MaterialTask、RequirementVersion、AssignmentHistory，尚无承办方材料草稿/文件/提交/审核模型，无原型数据。

- `src/index.ts`：受限连接/查询超时、共享在途探测、SELECT 1、关闭资源；不把 Prisma 实体导出给前端。
- `src/generated/prisma/`：Prisma 生成代码，忽略并随构建重新生成。
- `prisma.config.ts`：迁移 owner URL 与独立 shadow URL；API 仅使用 app URL。
- `prisma/migrations/`：首版 authorization 正式迁移、复合外键、明确 app 表权限和审计不可改触发器。
- `init/01-access.sh`：本地容器的基础设施账号与 schema 权限，不是业务权限模型。
- `test/`：无需 PostgreSQL 的缺配置、TCP 拒绝/无握手、超时与关闭测试。

从仓库根目录：

```sh
corepack pnpm --filter @caau/database build
corepack pnpm --filter @caau/database test
corepack pnpm db:setup
# Docker 就绪后再执行：
corepack pnpm db:up
corepack pnpm db:api
corepack pnpm db:test
```

CAAU-005 追加第二条正式 migration，不修改已执行的 004；dev 实际升级保留旧用户/会话/审计数量及 checksum，test 临时库还验证发布快照、并发/回滚与真实业务浏览器。`db:test` 现在需要 Chromium 及空闲 3000/4173 端口，见 [任务文档](../docs/runbooks/material-tasks.md)。

真实集成测试由根目录 `scripts/database.integration.mjs` 编排 API 和隔离 test 容器，临时测试模型不进入正式 schema。禁止用前端包引用本包，禁止提交 `.local/db`、真实数据库/上传/凭据，禁止为测试重置开发卷。

**已验证**：空 schema generate/validate、离线 SQL、TCP 失败超时，以及本机 Compose dev/test 运行、真实连接/断连恢复、受限账号、隔离迁移 deploy/dev/shadow 与数据保留。**未验证**：远程 Linux CI、生产数据库。CAAU-004 正式迁移、约束/事务、两赛事两承办方 API 权限、审计及 dev 引导亦已验证，见 [权限操作文档](../docs/runbooks/authorization.md)。安装、隔离、迁移命令与清理限制见 [数据库操作文档](../docs/runbooks/database-contract.md)。
