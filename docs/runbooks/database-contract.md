# 本地数据库、迁移与接口契约（CAAU-003）

**状态：CAAU-003 本地工程验收完成（2026-09-08）；真实 dev/test PostgreSQL、连接/断连恢复、迁移与 shadow 流程均已验证。** 三应用启动和 Node 工具链见 [本地工程文档](local-tooling.md)，逐项证据见 [任务状态](../planning/roadmap.md)。CAAU-004 已在此基础上新增身份/权限锚点、会话与审计正式迁移，操作及验证见 [权限文档](authorization.md)。下文 CAAU-003 的“空模型/无正式迁移”描述保留为当时证据，不代表当前 schema；无原型数据迁移。

## 1. 当前 Mac 与 Docker Desktop

本机为 Apple silicon（arm64）、macOS 26.6。已从官方安装 Docker Desktop 4.90.0；实际验证 Docker Engine/CLI 29.7.2、Compose v5.5.1（支持本项目 Compose 命令），context 为 `desktop-linux`、本机 Unix socket，无远程环境覆盖。CLI 链接在用户 `~/.local/bin`；其他机器按下述官方步骤安装。

- 官方安装说明：https://docs.docker.com/desktop/setup/install/mac-install/
- Apple silicon 官方 DMG：https://desktop.docker.com/mac/main/arm64/Docker.dmg
- 官方要求受支持的 macOS（当前及前两个主版本）与至少 4GB RAM。阅读并按组织情况遵守 Docker Desktop 许可；本工程使用原生 arm64 镜像，不要求安装 Rosetta。

操作：打开 DMG → 拖入 Applications → 启动 Docker.app → 按官方向导设置并等待引擎运行。不需要 Kubernetes。由用户处理正常安装/目录授权，不关闭 Gatekeeper、SIP 或更改签名等系统安全设置。若组织策略阻止安装，保留报错并联系管理员，不绕过策略。

新终端验证：

```sh
docker version                 # 同时有 Client 和 Server
docker compose version         # 支持 compose 子命令（本机 v5.5.1）
docker info --format '{{.ServerVersion}} {{.OSType}} {{.Architecture}}'
docker context inspect --format '{{.Endpoints.docker.Host}}'
```

最后一项应为本地 `unix:///...` 套接字；数据库管理脚本拒绝 TCP/SSH 远程 Docker context 及远程 DOCKER_HOST，避免意外在其他机器操作。脚本不会自动切换 context。命令找不到时检查 Docker Desktop 的 CLI 安装位置；采用用户目录安装时按官方指引将 `$HOME/.docker/bin` 加入当前终端 PATH。引擎连接失败时先启动 Docker.app，勿删除卷或结束未知进程。若挂载被拒绝，只按 Docker/macOS 提示授权本工程目录访问，不放宽全局安全设置。

## 2. 固定版本与职责

| 内容 | 固定版本 / 路径 |
| --- | --- |
| PostgreSQL | `17.11-bookworm`，镜像 digest 见 `deploy/compose.database.yml`；已核对 linux/arm64 与 amd64 清单，本机 arm64 已拉取并启动 |
| Prisma CLI/client/adapter-pg | `7.10.0`；`database/` 为仅服务端使用的 `@caau/database` |
| PostgreSQL 驱动 | `pg 8.23.0`，类型 `@types/pg 8.23.1` |
| Nest OpenAPI | `@nestjs/swagger 11.4.7`，匹配 Nest11；不误用要求 Nest12 的新版 |
| 类型生成 | `openapi-typescript 7.13.0`；根脚本额外生成当前 GET 操作的传输/枚举元数据 |
| 静态 Compose 检查 | `yaml 2.8.3` 解析声明与隔离约束；不等于 Docker Compose 实际配置验证 |

使用已固定的官方 Node24.20.0 / pnpm10.32.1。Prisma 7 使用 `prisma.config.ts` 提供迁移连接配置、`prisma-client` 生成器及 `PrismaPg` 驱动适配器；正式 schema 只含 datasource/generator，**空模型也能生成可执行 SELECT 1 的客户端**，不为迁移演示添加占位业务表。Prisma 引擎按锁定版本下载，校验失败不关闭校验；包安装脚本允许列表见 [本地工程文档](local-tooling.md)。

## 3. 开发/测试隔离与凭据

| 环境 | 回环端口 | 数据库 / shadow | 基础设施账号 | 卷 / 网络 |
| --- | --- | --- | --- | --- |
| dev | 127.0.0.1:15432 | caau_dev / caau_dev_shadow | caau_dev_owner / caau_dev_app | dev-data / dev |
| test | 127.0.0.1:15433 | caau_test / caau_test_shadow | caau_test_owner / caau_test_app | test-data / test |

这些是数据库基础设施账号，不是已确认的业务角色。owner 用于本地容器初始化与迁移；app 仅具备连接、schema 使用及当前 SELECT 1 所需能力，不拥有 superuser、建库、建角色和 schema DDL 能力；不默认授予所有新表 DML，避免连迁移元数据也可被运行账号修改。未来业务表访问授权需在业务模型确认后显式设计。此设置是本地底座，**不是生产账号/权限设计或安全审计**。

```sh
# 仓库根目录；同一 Mac 的每个终端先切换官方 Node：
export PATH="$PWD/.local/toolchain/node-v24.20.0-darwin-arm64/bin:$PATH"
corepack pnpm install --frozen-lockfile
corepack pnpm db:setup
```

`db:setup` 不依赖 Docker，已实际执行且重复执行验证通过。生成 `.local/db/{dev,test}.env` 与四份独立随机密码文件；目录 0700、新文件 0600，已被 Git 忽略。不会打印密码、覆盖已有文件或自动轮换密码；发现已有配置/密码不一致会失败。不要把这些文件贴到工单、日志或前端，也不要 `source` 整份含迁移凭据的文件到公共终端环境。`database/.env.example` 仅为结构说明，不是可以直接连接的默认账号。

Compose 使用 secret 文件，入口包装器以 root 读取仅 owner 可读的 app secret，再调用官方 PostgreSQL 入口；初始化脚本消费继承变量并清除该 app 密码变量。只读挂载脚本先在容器内复制为 0644，由官方入口 source，避免 macOS 挂载执行权限差异。宿主机端口仅绑定回环；实际初始化、secret 读取、账号受限权限和跨环境凭据拒绝均已验证。

本机既有 PostgreSQL 占用 5432，因此 CAAU 固定使用 15432/15433，不停止既有进程。续跑时仅将忽略目录中原 dev/test URL 的端口从 5432/5433 改为新端口，密码与卷均保留；`db:setup` 不会自动覆盖旧配置，旧工作区升级须先核对只属于本工程，再仅调整对应 URL 端口，切勿重新生成密码。

从根目录执行（本机 dev/test 当前均为 healthy）：

```sh
corepack pnpm db:up             # 只启动 dev，等待健康检查
corepack pnpm db:status
corepack pnpm db:api            # 只向 API 注入 app DATABASE_URL，先编译再启动
# 在另一终端：
curl -i http://127.0.0.1:3000/api/v1/health
curl -i http://127.0.0.1:3000/api/v1/ready
```

`db:api` 不传迁移/shadow 凭据；不要再同时运行另一个占用 3000 的 API。无 DB 时仍可 `dev:api`，health=200、ready=503。Web 和小程序分别有“检查后端连接”和“检查数据库就绪”动作。

停止不会删除数据：`corepack pnpm db:stop`；测试环境用 `corepack pnpm db:stop --test`。脚本没有自动 reset/down -v 功能。不要删除 `.local/db` 来“修复”已初始化卷：官方 init 仅在空数据目录运行，新密码不会自动更新已有数据库。端口冲突、密码丢失、权限异常或需要重建时先确认环境与数据保留要求，再制定显式修复步骤。

## 4. 存活和就绪的不同含义

| 端点 | 响应 / 含义 |
| --- | --- |
| GET /api/v1/health | 200 `{status: 'ok', service: 'caau-api'}`，仅 API 进程存活，不连接数据库 |
| GET /api/v1/ready | 200 `{status: 'ready', service: 'caau-api'}`，当前 Prisma SELECT 1 成功 |
| ready 失败 | 503 `{status: 'not_ready', service: 'caau-api', code: 'DATABASE_UNAVAILABLE'}`，不暴露 URL、账号、原始驱动异常 |
| GET /api/openapi.json | Nest DTO/控制器生成的 OpenAPI JSON，无交互 Swagger UI；文档不依赖 DB 连通 |

就绪响应禁止缓存，连接等待 500ms、查询/statement 超时 750ms、HTTP 探测 deadline 1500ms；并发探测共享一个在途数据库检查。缺 URL、连接拒绝、握手无响应、探测异常与卡住的探测替身均已验证正确失败。已实际停止 test 容器验证 ready=503、health=200，重启后同一 API 进程/连接池恢复 ready=200。

ready **只证明当前数据库可查询**，不检查业务表、迁移版本或其他外部依赖；不能据此宣称可承载尚未实现的业务。

## 5. 迁移规则与实际验证

CAAU-004 首版模型已确认并提供正式迁移 `202609080001_authorization`，dev 已 deploy/status，test 专属临时库已重复 deploy/diff 验证；不导入原型数据。迁移命令包装器只接受本机固定环境、账号、库名、端口和无额外查询参数的 URL；shadow 必须不同库，拒绝 URL 参数覆盖 host 的绕过。正式模型经确认后，在开发终端按需使用：

```sh
corepack pnpm db:migrate:dev --name descriptive_change_name
corepack pnpm db:migrate:status
corepack pnpm db:migrate:deploy --test
corepack pnpm db:migrate:status --test
```

`migrate dev` 使用隔离 shadow 库，属于开发交互流程；不把它当生产迁移命令，不盲目接受 reset 提示。生产流程与权限另行设计。正式 schema 校验与 Prisma 客户端生成通过；正式 dev/test 包装命令 `migrate deploy` / `status` 已真实连库通过（无待执行迁移，不代表存在业务表）。新空库在首次 deploy 前运行 status 会返回未受 Prisma Migrate 管理、退出 1；空 deploy 初始化迁移元数据后 status 通过，不能把首次失败隐藏。

```sh
# 仅操作 test 服务及本次测试创建的临时数据库：
corepack pnpm db:test
```

此命令检查本地 Docker → 构建 API/database → 只启动 test → 执行 `scripts/database.integration.mjs`，无跳过即成功的 fallback：

1. 真实 Prisma 连接与 ready=200；停止 **postgres-test** 后 ready=503，health=200；重启容器后同一 API 进程恢复 ready=200。
2. 真实查询 app 账号属性，验证不能建表；负向 DDL 在事务中回滚，避免污染测试库。
3. 正式 schema 外的系统临时目录生成 MigrationProbe 模型与 SQL；仅在 test 容器内创建两个随机 `caau_probe_*` 临时数据库，执行 deploy/status/重复 deploy 与无 schema 漂移检查。再创建本次专属的第三个 shadow 临时库，为临时模型添加可空字段，实际执行 `migrate dev --name add_optional_note` 和无变更的第二次 dev；将新迁移部署到第二库，断言两库恰好两条已完成迁移、无漂移且合成记录保留。最终仅清理本次创建的三个临时库和目录；正式 schema 保持逐字节不变，未接受 reset。

默认仅触碰 test，不停止/清空 dev。测试结束保留 test 服务可继续检查；需要时显式 `db:stop --test`。进程被强制终止可能来不及清理，仅按测试创建的精确临时库名调查处理，不对通用库名批量删除。开发迁移与 shadow 流程已纳入上述自动套件，3 项真实集成测试全部通过；不把离线 SQL 生成计作数据库迁移。

### 本机首次启动问题与保留数据修复

- 5432 端口冲突：切换本工程专属端口，未停止或连接既有 PostgreSQL。
- macOS 直接执行挂载 init 脚本报 `bad interpreter: Permission denied`：采用容器内 0644 副本后，test 空卷初始化通过。dev 当时已有官方初始化的空库，但 app 角色/shadow 库尚未创建；只读确认两者及 public 表数均为 0 后，仅手动 source 本工程初始化脚本补齐。未删除卷、未重新生成凭据。此操作不是通用重跑命令；若其他环境已有角色/数据，须先调查，不盲目重放非幂等 init SQL。
- 本轮 frozen install、check（含 contract:check）、build、test、test:e2e 全通过。最终证据与限制以 [roadmap](../planning/roadmap.md) 为准。仅本机 macOS/arm64 验收，不代表 Linux CI 或生产验证。

## 6. 契约生成与客户端

```sh
corepack pnpm contract:generate  # 从当前 Nest 编译产物生成并更新文件
corepack pnpm contract:check     # 重新生成到内存，对比现有文件，有漂移即失败
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm test:e2e
```

确定性生成三个受追踪文件：`packages/api-client/openapi.json`、`src/generated/schema.ts`、`src/generated/operations.ts`。连续两次再生成已比对 SHA-256，全部字节一致。修改契约先改 Nest DTO/控制器，再生成并评审差异；不要手改 generated 文件或只改前端接口类型。

`@caau/api-client` 无运行时依赖；生成的类型及 method/path/响应枚举元数据由手写、无业务规则的请求门面消费。Web 用独立 fetch/AbortController 适配器；小程序用只接受 Taro.request 能力的结构化适配器，不加载 Nest、Prisma、pg、Node 模块或浏览器 fetch 适配器。CAAU-004 元数据生成器已扩展 GET/POST/PATCH/DELETE、路径参数、JSON 请求体、对象/数组及可空响应；请求门面及 fetch/Taro 传输已补测试。文件流/multipart 和任意组合类型仍不支持，不宣称完整通用 SDK；详见 [权限文档](authorization.md)。

CI 已配置独立工程检查与真实数据库作业：冻结安装、契约漂移检查、构建/测试/E2E，以及 Compose 配置、真实停启恢复/迁移检查。**未连接或推送远程，Linux runner 与远程 CI 均未执行。** 小程序仅编译和 Node 替身请求联调通过，微信开发者工具/真机仍未验收。

官方依据：
- Prisma v7：https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- Prisma migrate：https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
- PostgreSQL 镜像：https://hub.docker.com/_/postgres
- Nest OpenAPI：https://docs.nestjs.com/openapi/introduction
- openapi-typescript：https://openapi-ts.dev/introduction
