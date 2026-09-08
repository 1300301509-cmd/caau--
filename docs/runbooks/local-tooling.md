# 本地启动、检查与工程版本（CAAU-002 / CAAU-003）

状态：三个应用、健康/就绪接口、生成契约客户端及数据库入口已实现；隔离 dev/test PostgreSQL 的真实连接、恢复、迁移和 shadow 流程已在本机验证，见 [数据库操作文档](database-contract.md)。首版业务已确认，CAAU-004 权限底座已落地；本地身份、迁移与后续边界见 [权限文档](authorization.md)。本文件区分本地已执行检查、模拟传输联调、微信平台验收与远程 CI，不把构建当成真机通过。

## 1. 环境与安装

- 官方 Node.js **24.20.0**（Krypton LTS），版本文件 `.node-version`；package.json 限制 24.20.x。
- pnpm **10.32.1**，由 packageManager 固定，通过 Corepack 调用。不要混用 npm/yarn 生成锁文件。
- 首次安装需要访问公开 npm registry 及 Prisma 固定版本引擎下载站；浏览器测试另需下载 Playwright Chromium。
- 不需要运行 Docker/PostgreSQL、微信账号或真实密钥即可运行 API/Web、编译小程序和执行 check/build/test/test:e2e；数据库就绪接口会在缺 DB 配置时正确返回 503。真实数据库套件单独使用 db:test，不属于无需容器的 test。

```sh
cd '/Users/xx_mac/Desktop/caau开发'
node --version                         # 应为 v24.20.0
corepack pnpm --version                # 应为 10.32.1
corepack pnpm install --frozen-lockfile
```

新机器先安装指定官方 Node，并确认 `node` 和 `corepack` 位于 PATH。若是本轮同一台 Mac，已校验的官方 Node 位于仓库忽略目录，可在**各终端**进入仓库后使用：

```sh
export PATH="$PWD/.local/toolchain/node-v24.20.0-darwin-arm64/bin:$PATH"
```

`.local/` 不提交，不随仓库分发，其他机器不能假定它存在。本机原有 Node 来自 ChatGPT 应用，其签名策略拒绝加载 SWC 原生模块；本轮没有修改签名或系统安全设置，而是下载官方 Node 并验证官方 SHA-256。下载文件 `node-v24.20.0-darwin-arm64.tar.gz` 的 SHA-256 为 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`；来源 `https://nodejs.org/dist/v24.20.0/SHASUMS256.txt`。这是校验和核对，不声称独立签名审计。

## 2. 启动三个应用

以下命令均从仓库根目录运行，需要三个终端。默认无需复制 .env 或填入真实凭据。

### 终端 A：后端 API

```sh
corepack pnpm dev:api
# 另一个终端可检查：
curl -i http://127.0.0.1:3000/api/v1/health
```

预期 HTTP 200：`{"status":"ok","service":"caau-api"}`。这是公开的进程存活接口，不含版本、凭据、数据库连接信息，不宣称数据库就绪。`dev:api` 先构建 database（Prisma generate + tsc）及 API 再启动，**当前不自动热重载**；修改 API 后 Ctrl+C 并重启。保留 TypeScript 装饰器 metadata 的正式编译，不用转译模式冒充 Nest 构建。

可选配置见 `apps/api/.env.example`；需要调整时复制为同目录 `.env`。`HOST` 默认 `127.0.0.1`、`PORT` 默认 `3000`；只有明确需要外部测试时才调整监听地址和防火墙。`CORS_ORIGINS` 为精确 HTTP(S) 来源的逗号分隔列表，不接受 `*`；CORS 不是鉴权。

### 终端 B：Web 管理后台

```sh
corepack pnpm dev:admin
```

打开 **http://127.0.0.1:5173**，点击“检查后端连接”。“检查数据库就绪”为独立动作，缺配置时返回 503；有数据库后的启动与检查按数据库文档执行。两端开发命令会先构建共享 api-client。成功应显示“已连接 caau-api，服务状态正常”；请求中、HTTP 错误、无效响应和网络失败不显示伪成功。

`apps/admin/.env.example` 展示 `VITE_API_BASE_URL`，默认 `http://127.0.0.1:3000`；如需修改，复制到 `.env.local`，修改后重启/重新构建。Vite 编译变量公开可见，不能放密钥。

### 终端 C：微信小程序编译

```sh
corepack pnpm dev:miniapp
```

命令进入 watch 编译；产物在 `apps/miniapp/dist/`。微信开发者工具导入 **apps/miniapp**，而不是仓库根目录；project.config.json 的 miniprogramRoot 已指向 dist。

- `touristappid` 是游客占位，不是实际用户身份，也不保证有完整运行/预览资格；真实测试 AppID/权限由微信资源决定，尚未配置和验收。
- 默认地址与 Web 相同：`http://127.0.0.1:3000/api/v1/health`。本地 HTTP 调试需使用者在开发者工具中仅对本地调试关闭合法域名检查；仓库保持 `urlCheck: true`，不将绕过检查作为发布方案。
- 手机的 127.0.0.1 指向手机自身，不是电脑。真机必须使用可达的测试 API、合法 HTTPS 域名及平台权限配置；本轮均未验证。
- 地址在编译时写入，建议显式设置环境变量，不依赖隐式 .env 加载：

```sh
# YOUR_TEST_API_HOST 是占位值，需替换为届时已配置的测试 API。
TARO_APP_API_BASE_URL=https://YOUR_TEST_API_HOST corepack pnpm dev:miniapp
```

所有服务 Ctrl+C 停止。端口占用时应先确认占用进程，不自动结束其他用户进程。API/Web 默认均只监听回环地址。

## 3. 构建与验证命令

```sh
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

顺序不能省略：API 测试使用 dist 编译产物，浏览器测试使用 Web 生产构建，必须先 build。测试开始前停止正在占用 **3000、4173** 的本项目服务；Playwright 不复用已有服务，以免验证到错误应用。

| 命令 | 实际行为 |
| --- | --- |
| `check:docs` | 内联 Markdown 相对链接目标存在性；不验证锚点、引用式链接或外部 URL |
| `check:format` | 根/应用/客户端/数据库配置与手写源码、测试、工具和 CI 格式；不重排历史产品文档和 agent.md |
| `lint` | ESLint recommended + TypeScript recommended，零 lint 警告；另检查应用/包边界。生成代码不手工 lint 修复，仍做生成漂移和类型检查 |
| `typecheck` | 三个应用、两个包、Prisma 配置与 E2E 严格 TS 检查；skipLibCheck 仅跳声明库。独立执行前先 build:packages，check 已编排依赖 |
| `test:tooling` | 12 个：链接/AST/依赖边界反例、Compose 静态声明/shell 语法、配置隔离/权限/远程 Docker 拒绝、Prisma 离线迁移 SQL |
| `contract:check` | 构建当前 API/database 后重新生成 Nest OpenAPI、类型与操作元数据，逐字节对比现有文件，有漂移即失败，不连接 DB |
| `build` | 按依赖顺序构建 database/api-client、API tsc、Web tsc + Vite、Taro weapp；检查 app.json/JS/WXML/WXSS |
| `test` | CAAU-004 后为 22 个包/应用测试 + 1 个两端健康/就绪真实 HTTP 联调，共 23 个；DB 仅缺配置/TCP 失败测试和 API probe 替身，不是 PostgreSQL 连接成功验证 |
| `test:e2e` | Chromium 3 个：生产 Web 连真实 API、HTTP 失败重试、DB 缺配置时就绪失败而健康正常；不运行微信，明确清空测试 API 的 DATABASE_URL |

单独构建应用及其 workspace 依赖：`corepack pnpm --filter @caau/api... build`、`corepack pnpm --filter @caau/admin... build`、`corepack pnpm --filter @caau/miniapp... build`。生产构建的本地预览：先 `corepack pnpm --filter @caau/api start`，再 `corepack pnpm --filter @caau/admin preview`，访问 `http://127.0.0.1:4173`；preview 不是生产部署方案。

边界检查覆盖三个应用及 api-client/database 的静态 import/export、字符串 require/import()、类型 import、应用依赖清单；禁止跨应用包/相对源码引用和前端引用 Prisma/Nest/数据库；前端及 api-client src 禁 Node 内置模块，客户端清单禁止运行时依赖，Node 测试与构建配置允许使用。当前不使用路径别名，新增 tsconfig paths/baseUrl 会使检查失败，须先扩展规则；计算型 import 需显式评审。仓库级联调脚本可以编排两端和 API，但不成为任何应用的运行时依赖。它不是完整供应链/打包产物安全扫描。

## 4. 固定版本与选择证据

本轮再次使用 Context7 官方文档与 npm 精确版本元数据核对 engines、peerDependencies、optional peers、deprecated；通过实际安装/类型/构建验证组合。所有直接依赖使用精确版本，传递依赖由 pnpm-lock.yaml 锁定，不使用浮动 latest 脚手架。

| 层 | 实际锁定 | 选择与验证 |
| --- | --- | --- |
| 运行时/包管理器 | 官方 Node 24.20.0 / pnpm 10.32.1 | 在既有 24.19.0 基础上升受支持 LTS 补丁，解决本机受限应用运行时问题；不用全局覆盖 |
| 语言 | TypeScript 5.9.3 | 与 typescript-eslint 8.57.0 的 `<6` 范围一致；不跟随 latest 7 |
| API | Nest common/core/platform-express 11.1.16，reflect-metadata 0.2.2，rxjs 7.8.2 | 核心包同版本；Node ≥20；不需要 Nest CLI，不引入 CLI 12 的另一套 TS6；ESM/NodeNext |
| Web | React/DOM 19.2.8，Ant Design 6.6.3，Vite 8.2.2，plugin-react 6.1.1 | Vite 与插件匹配；AntD6 原生支持 React19，不加 v5 补丁 |
| 小程序 | Taro 全系列 4.2.1，React 18.3.1，官方 webpack5 runner，Webpack 5.91.0 | Taro React peer 为 ^18，runner 要求精确 webpack；与 Web React/Vite 分开解析，不强制统一 |
| 小程序编译补充 | Babel core/preset-react 7.28.5，babel-preset-taro 4.2.1，PostCSS 8.5.6，Less 4.2.2 | 首次解析出 Less3，与 runner peer 不符，增加明确 Less4 依赖后严格安装通过，没有关闭严格 peer 检查 |
| 规范与测试 | ESLint 10.5.0、@eslint/js 10.0.1、typescript-eslint 8.57.0、Prettier 3.6.2、tsx 4.21.0、Playwright 1.58.2 | 发现 ESLint9 已标弃用，采用兼容 ESLint10；测试环境使用 Node 原生测试和 Chromium |
| 数据库与契约（CAAU-003） | Prisma CLI/client/adapter-pg 7.10.0、pg 8.23.0、@types/pg 8.23.1、@nestjs/swagger 11.4.7、openapi-typescript 7.13.0、yaml 2.8.3 | 已安装/构建/生成/独立测试；PostgreSQL 17.11-bookworm 镜像固定 digest，本机实际数据库验证通过；无业务表或正式迁移 SQL |

安装脚本按需允许：esbuild 平台二进制验证，以及经审查的 @prisma/engines 按锁定引擎版本下载 schema engine（离线 SQL 生成实际使用）。Prisma preinstall 版本提示由根 engines 约束替代，Swagger 引入的 Scarf 安装统计显式忽略。SWC/Taro/Parcel 使用锁文件中的平台预编译包，不额外下载未锁定 fallback 或从源编译；core-js/Nest 安装提示不执行。特别检查发现 Taro CLI postinstall 会尝试配置**全局浮动性能上报插件**，故显式忽略，不能直接 approve 全部脚本。pnpm 在本机已有依赖缓存上仍可能提示这些脚本被忽略，这是有意限制，不是通过跳过业务测试掩盖失败。

公开来源：
- Node 发布：https://nodejs.org/dist/index.json
- 精确包元数据：`https://registry.npmjs.org/<公开包名>/<精确版本>`
- Taro React18 / 编译：https://docs.taro.zone/docs/react-18 、https://docs.taro.zone/docs/config-detail
- Nest CORS：https://docs.nestjs.com/security/cors
- Vite：https://vite.dev/guide/ 、https://vite.dev/guide/env-and-mode
- Ant Design v6：https://ant.design/docs/react/migration-v6
- ESLint：https://eslint.org/docs/latest/use/configure/configuration-files
- pnpm：https://pnpm.io/cli/install
- Playwright CI：https://playwright.dev/docs/ci

## 5. CI 与交付边界

`.github/workflows/ci.yml` 对 PR、main/codex 分支 push 执行：指定 Node → frozen install → check → 三应用 build → test → 安装 Chromium → Web E2E → 跟踪文件无生成漂移。运行于 Ubuntu 24.04、只读 contents 权限、有限超时，不提交密钥、不部署、不上传微信。另设 database 作业，在临时 runner 生成独立凭据并运行 Compose 配置校验及真实 PostgreSQL 连接/停启恢复/隔离迁移套件，不缺环境就静默跳过。checkout/setup-node 固定提交 SHA。

**实际执行结果与限制见 [开发计划中的 CAAU-002 / CAAU-003](../planning/roadmap.md)。** 本地 CLI、构建与浏览器通过不等于 GitHub Actions 已运行；本轮不连接/推送 Git 远程，所以远程 CI、Linux runner、分支保护均未验收。微信开发者工具/真机、HTTPS 合法域名、生产部署与生产数据库仍未验收；本地数据库验收不代表生产可用。

已知非阻塞提示：Taro 工具链有 15 个弃用传递依赖提示（包括其内部 ESLint8，区别于根 ESLint10）；Web 首个 AntD 页面主 JS 超过 Vite 默认 500KB 提示，暂不为技术演示页引入业务拆包；Node 直接加载 miniapp TS 的联调测试有模块类型推断提示。上述未隐藏，也不构成完整依赖安全审计。后续发布前需评估工具链升级、安全与体积预算。
