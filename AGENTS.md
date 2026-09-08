# 开发工作入口

适用于本仓库内的开发工作。先阅读 README.md、CONTRIBUTING.md 和 docs/planning/roadmap.md。

## 文档关系

- 用户当前明确指令优先。`agent.md` 是原始架构建议与参考资料，保留原文；其中关于历史核验、系统实现和业务数据的描述必须现场验证。
- 当前目录和依赖边界以 `docs/architecture/repository.md` 为准；架构决策与变更记入 `docs/adr/`。
- 业务规则和验收标准记入 `docs/product/requirements.md`，不得把演示值或建议流程改写为用户已确认规则。
- 任务及实际状态集中维护于 `docs/planning/roadmap.md`，交付时更新验证证据。

## 工作要求

1. 修改前检查 Git 状态，保留已有工作；仅修改本仓库内授权范围。
2. 任务使用明确编号、目标、范围与验收标准，按 CONTRIBUTING.md 管理分支与提交。
3. 不跨应用直接引用源码，不把数据库客户端或服务端密钥引入前端；跨模块依赖遵守代码组织文档。
4. 依赖初始化时核验官方版本和兼容性，再固定 Node.js、pnpm 及依赖版本并提交锁文件。根工作区工具已可运行，三个应用尚未初始化；不编造应用命令或检查结果。
5. 执行与改动相关的检查，记录已通过、失败和未运行项。文档变更检查链接、路径、差异即可。
6. 不提交真实凭据、用户上传、数据库副本、生产数据或本机配置；不覆盖用户工作、不强推共享分支。
7. 外部发布、账号资源和业务决策按用户授权范围处理；缺少远程归属时继续本地工作。
8. 完成报告说明实际改动、验证、限制和下一步，及时更新任务状态。

## 当前可用检查

```sh
git status --short --branch
git diff --check
git diff
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

根工具与检查范围见 docs/runbooks/local-tooling.md。应用命令在工程初始化并验证后补充；当前检查不代表构建、真机验收或生产验证。
