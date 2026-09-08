# ADR-0002：隔离数据库底座与生成契约客户端

- 状态：接受（CAAU-003 本地范围）
- 日期：2026-09-08
- 前置：[ADR-0001](0001-monorepo.md)

## 背景

业务模型仍待确认，但本地 PostgreSQL、迁移、就绪检查与跨端契约可以独立完成。不能提前创建业务表，也不能把数据库实体和凭据带入前端。

## 决策

- Prisma/pg 唯一入口为仅服务端使用的 `@caau/database`；正式 schema 无业务 model。运行 app 账号与迁移 owner 分离，shadow 独立数据库。
- 固定 PostgreSQL17.11 镜像 digest，Compose dev/test 独立账号、网络和持久卷，仅绑定回环 15432/15433；本机 5432 已被其他 PostgreSQL 占用，不停止或连接该服务。
- 凭据仅在忽略的 `.local/db`，保留已有密码。只读挂载的初始化脚本在容器内复制为 0644，由官方入口 source，避免 macOS 挂载执行权限差异；不放宽宿主凭据权限或系统安全策略。
- health 仅代表进程存活；ready 通过有界 Prisma SELECT 1 返回 200/通用503，不返回连接详情，也不宣称业务 schema 或其他依赖已就绪。
- Nest DTO/控制器是 OpenAPI 来源；生成类型和操作元数据由无运行时依赖的 `@caau/api-client` 消费，Web fetch 与 miniapp Taro 适配器独立，不跨应用引用源码，不手改生成文件。
- 真实迁移回归只在 test 服务内本次创建的临时库/临时模型执行，覆盖 deploy、dev、独立 shadow、重复执行、无漂移与数据保留。清理仅针对本次精确库名，不 reset 或删除数据卷。

## 结果与限制

本机 macOS/arm64 的初始化、权限、连接/停启恢复、迁移及全套工程检查通过，证据见 [roadmap](../planning/roadmap.md)。正式 dev/test 只有基础设施及迁移元数据，没有业务表。初始化脚本非通用幂等修复工具，已有卷初始化失败须调查后定点修复，不能盲目重放或删卷。

本决策不覆盖生产部署/权限、远程 Linux CI、微信平台验收或未确认业务模型。完整操作见 [数据库运行手册](../runbooks/database-contract.md)。
