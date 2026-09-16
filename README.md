# CAAU 正式工程

本仓库用于建设 CAAU 微信小程序、Web 管理后台和后端 API。

当前优先阶段：CAAU-012 A/B/C/D 已完成本地交付：单份材料五态、赛事共享审核、不可变历史，以及 Web `/materials`、Taro承办页面和自动同步。42项数据库全套通过；15条浏览器同步样本 p50 1821ms、p95/max 2093ms。旧数据/附件/模板保留。官方游客模拟器加本地测试身份已完成一条新增/V1退回/V2通过主流程；真实文件选择返回后平台回调悬挂，附件闭环、正式微信身份/AppID/合法域名及真机仍未通过，现按用户指令暂缓。当前三方功能状态见 [产品功能清单](docs/product/current-function-matrix.md)，赛事创建、承办指定与信息变更问题见 [赛事管理缺口](docs/product/event-management-gap-analysis.md)；可操作演示及分层边界见 [Web手册](docs/runbooks/individual-material-web.md)、[后端手册](docs/runbooks/individual-materials.md) 和 [Taro手册](docs/runbooks/individual-material-miniapp.md)。

既有成果：CAAU-005 第一段已完成本地验收：真实赛事/材料任务创建、承办机构/经办/审核指派、要求配置、不可变 V1 发布及范围查询，提供总部 Web 工作台。沿用 CAAU-004 身份/权限/审计；真实 PostgreSQL 与浏览器闭环通过。第二段已加入本地私有文件、草稿 CAS、不可变幂等提交、整包审核/退回重交、延期和同机构交接后端；第三段已实现总部审核/历史/管理操作、承办 Web 联调页面及 Taro“待办/赛事/我的”业务页面。真实浏览器闭环通过，小程序游客模拟器已有部分运行证据，平台文件闭环和真机仍待验证，无部署或真实微信登录。小程序编译与请求逻辑测试通过不等于微信开发者工具或真机验收通过。原始架构建议见 [agent.md](agent.md)，其中的示例模型、业务规则和实施顺序不等于已确认需求。

## 从这里开始

- [开发入口](AGENTS.md)：开发者与代理的工作规则。
- [代码组织](docs/architecture/repository.md)：目录职责、依赖方向与模块边界。
- [业务模块映射](docs/architecture/module-map.md)：12 个导航板块对应的前端功能与后端职责。
- [协作规范](CONTRIBUTING.md)：任务、分支、提交、评审与验收。
- [开发计划与状态](docs/planning/roadmap.md)：当前成果和后续任务。
- [需求登记](docs/product/requirements.md)：区分已确认内容与待验证假设。
- [架构决策](docs/adr/0001-monorepo.md)：单仓库与模块化单体方案。
- [本地工具与版本核验](docs/runbooks/local-tooling.md)：已验证命令、检查边界、环境缺口及固定版本。
- [赛事与材料任务工作台](docs/runbooks/material-tasks.md)：本地启动、真实业务 API、私有文件、截止/交接规则与验收边界。
- [本地身份与权限操作](docs/runbooks/authorization.md)：角色矩阵、合成会话、审计、验证边界和 CAAU-005 条件。
- [本地测试赛事与授权](docs/runbooks/local-test-events.md)：固定 A/B 赛事、五身份范围、幂等准备及无任务展示限制。
- [本地单份材料体验任务](docs/runbooks/local-test-tasks.md)：A/B 空清单任务、演示截止、访问范围和亲自体验步骤。
- [承办方小程序首页与导航](docs/product/miniapp-home-navigation.md)：身份优先、板块式主页、材料审批子模块及状态保护。
- [总部赛事管理 Web](docs/runbooks/event-management-web.md)：赛事列表、当前字段创建、详情及权限边界。
- [赛事级承办关系最小设计](docs/product/event-organizer-relationship-design.md)：机构、人员、访问授权和任务指派的区分及待确认问题，不代表已实施模型。
- [数据库与契约操作](docs/runbooks/database-contract.md)：Docker 官方安装、隔离开发/测试、迁移规则与待执行验证。

## 目录

```text
apps/miniapp/          微信小程序
apps/admin/            Web 管理后台
apps/api/              后端 API
packages/api-client/   OpenAPI 生成客户端
database/              数据模型、迁移、开发测试数据
docs/                  架构、需求、计划和运维文档
deploy/                部署工程
```

## 本地启动

使用官方 **Node.js 24.20.0** 和 Corepack，pnpm 固定为 **10.32.1**。若本机默认 Node 来自应用内置运行时，先按 [本地工程文档](docs/runbooks/local-tooling.md) 切换到已校验的官方运行时。

```sh
corepack pnpm install --frozen-lockfile
# 分别在三个终端中运行：
corepack pnpm dev:api       # http://127.0.0.1:3000/api/v1/health
corepack pnpm dev:admin     # http://127.0.0.1:5173
corepack pnpm dev:miniapp   # watch 编译，产物 apps/miniapp/dist
```

Web 当前提供 `/materials` 资料审核和 `/events` 赛事管理两个业务入口，使用同一套紧凑后台壳层；赛事管理仅支持有权赛事列表、名称/说明创建和详情，不包含赛事级承办指派。原 `/workspace` 不进入导航，仅暂留自动化回归兼容。需按操作文档准备数据库，以 `CAAU_IDENTITY_MODE=local corepack pnpm db:api` 开启本地身份；页面可直接选择五个固定测试身份，后端签发真实测试会话，当前标签页刷新恢复且标签页间互不覆盖。`corepack pnpm events:local` 幂等准备两个本地测试赛事及范围授权；`corepack pnpm tasks:local` 进一步准备两个空材料清单、可自由新增的体验任务，不代替用户新增、提交或审核。`corepack pnpm materials:demo` 才会追加带预置业务过程的合成演示任务。工程连接辅助页位于 `/system/health`。小程序需在微信开发者工具中导入 `apps/miniapp`，测试身份、域名及真机步骤见 [Taro手册](docs/runbooks/individual-material-miniapp.md)；当前仍是 `touristappid` 和回环HTTP，仅本地模拟器主流程部分通过，附件、正式平台和真机验收未完成。API 开发命令先编译再启动，不自动热重载。

## 检查与构建

```sh
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

本地已通过三应用构建、静态检查、工具/请求/API 测试和 Web 浏览器联调。`contract:generate` 从 Nest 生成真实 OpenAPI、类型与请求元数据，`contract:check` 检查漂移；Web/Taro 已消费无运行时依赖的客户端包。`db:setup` 可离线准备忽略目录下的独立凭据；`db:up`、`db:test` 已在本机 Docker 实际验证，数据库专属回环端口为 15432/15433，详见数据库操作文档。`.github/workflows/ci.yml` 已配置同等检查，未推送远程，故未声称 GitHub CI 执行通过。详情、实际限制和已知警告见 [本地工程文档](docs/runbooks/local-tooling.md)。

## 本地 Git

默认集成分支为 `main`，开发使用短期 `codex/<任务号>-<简述>` 分支。远程仓库尚未配置；组织、可见性与访问权限确定后再接入。具体操作见 [CONTRIBUTING.md](CONTRIBUTING.md)。
