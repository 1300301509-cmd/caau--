# 本地工程工具与初始化核验（CAAU-002 / 第一步）

状态：工作区工具已可运行；三个应用、数据库和 CI 尚未初始化。本轮用户表示业务闭环需后续对接负责人，先推进现阶段能做的工作；因此只实施与业务无关的技术底座，不创建业务模型或角色授权代码。

## 1. 当前可运行命令

本轮使用 Node.js `24.19.0`、Corepack 调用 pnpm `10.32.1`，未安装全局 pnpm。项目的 `.node-version`、package.json engines/packageManager 固定当前验证基线；`.node-version` 供已有运行时管理工具读取，不会自动替换本机 Node。

```sh
# 在正式仓库根目录执行；仅安装公开工程依赖，不连接 Git 远程。
corepack pnpm install --frozen-lockfile
corepack pnpm check

# 可以单独运行：
corepack pnpm check:docs
corepack pnpm check:format
corepack pnpm test:tooling
```

需要本机具备 Node 和 Corepack；本轮没有对系统全局工具做安装/升级。已存在独立 pnpm 且版本匹配的机器可使用 `pnpm` 代替 `corepack pnpm`。

当前仅有根工作区 package.json 和 Prettier `3.6.2` 开发依赖；锁文件为实际安装生成。apps、packages、database 仅声明工作区匹配目录，没有通过虚假 package.json 把职责目录算成可运行应用。`onlyBuiltDependencies: []` 表示当前没有获准的依赖构建脚本，后续引入真实应用依赖时逐项评估，不无条件允许安装脚本。

### 检查的实际范围

- `check:docs`：扫描本仓库 Markdown 的内联相对链接，检查文件/目录目标存在；跳过依赖、构建、本地数据、上传、符号链接以及三反引号围栏示例，不请求外部 URL。当前不校验锚点、引用式链接、带标题/尖括号等完整 Markdown 语法，也不核实业务来源真实性。
- `check:format`：仅检查根 package.json、workspace YAML、Prettier 配置和本轮工具脚本。**不重排 agent.md、原有产品文档或用户修改。**后续有应用源码再扩大范围。
- `test:tooling`：Node 原生测试覆盖正确文件/目录链接、缺失链接反例、外部 URL 跳过、依赖目录/围栏排除；测试仅在自建临时目录创建合成文件并清理。
- 尚无业务测试、应用类型/构建检查、静态依赖边界检查和运行中的 CI；不能以这些工具检查代替 CAAU-002 的最终验收。

## 2. 本机环境事实

| 项目 | 本轮检查结果 | 影响 |
| --- | --- | --- |
| Node | 24.19.0，来自本机已有应用附带运行时；arm64 | 本轮工具可运行；后续独立开发环境应安装受控官方运行时，不依赖该应用路径 |
| npm | 11.17.0 | 可用，但本仓库安装依赖统一用指定 pnpm，不混用 npm lockfile |
| pnpm | 起初无独立命令；`corepack pnpm --version` 返回 10.32.1 | 无需全局安装；根脚本不能假定 PATH 上有 pnpm 命令 |
| Docker | PATH 中未找到 docker 命令 | 不阻塞根工具/三个应用骨架；数据库容器与 PostgreSQL 集成测试尚不能承诺运行 |
| Git | 008 三份产品文档和 roadmap 修改仍在 | 保留当前分支与未提交工作，未强行切 main、合并、提交或重置 |

Node 官方发布索引确认 24.19.0 为 Krypton LTS；本轮检索到 24.x 的更新补丁为 24.20.0。当前固定已实际验证的本机版本，不把“符合最低要求”当作最新安全补丁证明；独立环境/发布前升级受支持补丁并重新验证。

## 3. 官方文档与包元数据核验

来源：本轮 Context7 查询官方文档仓库，并直接读取 npm registry 的 version/engines/peerDependencies；Node 查询官方发布索引。只传公开产品名，不发送项目代码、配置或个人数据。检索结果是当次快照，**版本存在、未标 deprecated、满足 engines 均不等于组合构建通过或安全审计通过**。

| 项目 | 查到的约束/候选 | 工程判断 |
| --- | --- | --- |
| pnpm | 10.32.1 包 engines ≥18.12；latest 为 12.3.4 | 根工具先固定实际验证的 10.32.1，不自动跨大版本升级 |
| Taro | CLI/react/runner 4.2.1；`@tarojs/react` peer React `^18` | 小程序候选 React/ReactDOM 18.3.1；Taro 相关包版本对齐，不随根目录升 React 19 |
| Taro 编译器 | vite-runner 4.2.1 peer Vite `^4`；webpack5-runner peer Webpack `5.91.0` | 不把 Web 的 Vite 8 强行注入 Taro；后续先在小程序隔离依赖下验证官方 runner，构建后才锁定选项 |
| Web | Vite 8.2.2 要求 Node `^20.19.0 || >=22.12.0`；plugin-react 6.1.1 peer Vite `^8` | 当前 Node 满足最低约束；Web 独立依赖，无需强求两端同一构建器 |
| React / Ant Design | React latest 19.2.8；Ant Design 6.6.3 peer React/DOM ≥18，文档说明原生支持 React 19 | Web 可单独选 React 19；不需要旧 v5 React 19 补丁；组合待实构建 |
| NestJS | core latest 12.0.1；CLI 12.0.0 内部依赖 TypeScript `~6.0.2`；11.1.16 包亦存在且 engines ≥20 | 不直接执行浮动 CLI 生成工程；在应用初始化时确定同大版本核心包及匹配 TS，避免根 TypeScript 隐式漂移 |
| TypeScript | latest 7.0.2；候选 5.9.3 包已核验 | 不把 latest 当兼容性证明；仅在实际应用需要时安装，允许工具内部编译器和应用分别锁定 |
| Prisma | latest 当时为 `8.0.0-rc.13`；7.10.0 的 CLI/client/adapter-pg 包均存在 | 不选 RC；后续候选 7.10.0 + PostgreSQL adapter，按 v7 的 ESM/初始化规则实施，不沿用旧示例 |
| Prisma v7 运行时 | 7.10.0 engines `^20.19 || ^22.12 || >=24.0`，TypeScript ≥5.4 | 本机 Node 符合；尚未安装 Prisma、生成模型、连接数据库或运行迁移 |

本轮**仅锁定根工具依赖**，表内应用候选不是已安装清单。不预填云服务/微信账号、数据库密码或未知 AppID，不创建会连接生产的配置。

可复查来源：
- Node 发布索引：https://nodejs.org/dist/index.json
- npm 包元数据：`https://registry.npmjs.org/<公开包名>/<版本或标签>`
- pnpm 安装：https://pnpm.io/installation
- Taro React 18：https://docs.taro.zone/docs/react-18
- Taro 编译配置：https://docs.taro.zone/docs/config-detail
- Nest 迁移：https://docs.nestjs.com/migration-guide
- Vite Node 要求：https://vite.dev/guide/
- Ant Design v6：https://ant.design/docs/react/migration-v6
- Prisma v7：https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7

## 4. 本轮验证与限制

实际执行：Corepack 指定 pnpm、首次安装生成锁文件、同一工作区 `install --frozen-lockfile`、格式检查、文档链接检查和 3 个工具测试均通过。首次根 check 使用嵌套 pnpm 命令，因本机无全局 pnpm 而失败；已改为直接调用 Node/Prettier，重跑通过，不要求用户改 PATH。

没有执行：独立干净机器重装、依赖漏洞审计、三个应用构建、数据库/迁移测试、微信开发者工具/真机、CI 远程运行或部署。未安装 Docker，未改原型、读取凭据文件、复制个人数据或连接 Git 远程。

## 5. 不依赖业务确认的后续工作

1. 固定各应用实际可兼容依赖，初始化最小 Nest API 健康接口、Web 技术连接页、小程序技术连接页；不放业务菜单、假业绩、演示角色或业务表。
2. 建立应用格式/类型/构建与依赖边界检查；本地执行有效后才接入真实 CI 配置，远程接入仍按原授权边界。
3. 建立仅健康检查的 OpenAPI 契约和客户端生成链路，再准备隔离 PostgreSQL 开发环境；数据库连接与迁移验收不依赖选择具体业务闭环，但业务建模必须等待确认。
4. 业务闭环、业务权限、材料清单和历史迁移继续挂起；不重复追问用户，等其与负责人对接后恢复。
