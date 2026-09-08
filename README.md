# CAAU 正式工程

本仓库用于建设 CAAU 微信小程序、Web 管理后台和后端 API。

当前阶段：CAAU-005 第一段已完成本地验收：真实赛事/材料任务创建、承办机构/经办/审核指派、要求配置、不可变 V1 发布及范围查询，提供总部 Web 工作台。沿用 CAAU-004 身份/权限/审计；真实 PostgreSQL 与浏览器闭环通过。第二段已加入本地私有文件、草稿 CAS、不可变幂等提交、整包审核/退回重交、延期和同机构交接后端；第二段业务页面未实现，无部署或真实微信登录。小程序编译与请求逻辑测试通过不等于微信开发者工具或真机验收通过。原始架构建议见 [agent.md](agent.md)，其中的示例模型、业务规则和实施顺序不等于已确认需求。

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

Web `/workspace` 提供赛事与材料任务工作台，需先按任务操作文档迁移并导入本地会话。原首页点击“检查后端连接”；新增“检查数据库就绪”是独立检查，无数据库配置时正确显示 503。小程序需在微信开发者工具中导入 `apps/miniapp`，测试身份、域名及真机步骤见本地工程文档，当前未完成平台验收。API 开发命令先编译再启动，不自动热重载。

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
