# CAAU 正式工程

本仓库用于建设 CAAU 微信小程序、Web 管理后台和后端 API。

当前阶段：本地仓库管理、产品梳理和根工作区工具已建立；应用尚未初始化，不能启动或部署。业务闭环选择暂缓，工程底座可独立推进。原始架构建议见 [agent.md](agent.md)，其中的示例模型、业务规则和实施顺序不等于已确认需求。

## 从这里开始

- [开发入口](AGENTS.md)：开发者与代理的工作规则。
- [代码组织](docs/architecture/repository.md)：目录职责、依赖方向与模块边界。
- [业务模块映射](docs/architecture/module-map.md)：12 个导航板块对应的前端功能与后端职责。
- [协作规范](CONTRIBUTING.md)：任务、分支、提交、评审与验收。
- [开发计划与状态](docs/planning/roadmap.md)：当前成果和后续任务。
- [需求登记](docs/product/requirements.md)：区分已确认内容与待验证假设。
- [架构决策](docs/adr/0001-monorepo.md)：单仓库与模块化单体方案。
- [本地工具与版本核验](docs/runbooks/local-tooling.md)：已验证命令、检查边界、环境缺口及候选版本。

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

目前各应用目录仅包含职责说明。根工作区已有 package.json、pnpm 锁文件与文档/格式/工具测试；三个应用、业务测试和 CI 尚未建立。

在 Node.js 24.19.0 与 Corepack 环境中，以下命令已验证：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

检查通过不代表应用构建、权限、数据库或真机验收通过；具体范围见本地工具文档。

## 本地 Git

默认集成分支为 `main`，开发使用短期 `codex/<任务号>-<简述>` 分支。远程仓库尚未配置；组织、可见性与访问权限确定后再接入。具体操作见 [CONTRIBUTING.md](CONTRIBUTING.md)。
