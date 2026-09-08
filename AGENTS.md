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
3. 不跨应用直接引用源码，不把数据库客户端或服务端密钥引入前端；跨模块依赖遵守代码组织文档。前端只消费 @caau/api-client；Prisma 入口仅在 @caau/database，生成的 DTO 类型不是数据库实体。
4. 依赖初始化时核验官方版本和兼容性，再固定 Node.js、pnpm 及依赖版本并提交锁文件。三个应用已有工程骨架与健康接口，已验证命令见 docs/runbooks/local-tooling.md；不编造微信工具、真机或远程 CI 验收结果。
5. 执行与改动相关的检查，记录已通过、失败和未运行项。文档变更检查链接、路径、差异即可。
6. 不提交真实凭据、用户上传、数据库副本、生产数据或本机配置；不覆盖用户工作、不强推共享分支。
7. 外部发布、账号资源和业务决策按用户授权范围处理；缺少远程归属时继续本地工作。
8. 完成报告说明实际改动、验证、限制和下一步，及时更新任务状态。阶段完成或遇到阻塞时主动简短通报，分别列实际通过与待环境验证项。
9. 变更接口先改 Nest DTO/控制器，再 contract:generate；不手改契约生成文件。未确认业务模型前保持 Prisma schema 无业务 model，不为测试添加正式占位表。
10. 数据库凭据仅在忽略的 .local/db，禁止打印/提交；db:test 只能操作隔离 test 服务及自身临时库。不得未经确认删除数据卷、接受迁移 reset 或操作远程 Docker。完整步骤见 docs/runbooks/database-contract.md。

## 当前可用检查

```sh
git status --short --branch
git diff --check
git diff
corepack pnpm install --frozen-lockfile
corepack pnpm contract:check
corepack pnpm check
corepack pnpm build
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

真实数据库验证另运行 `corepack pnpm db:test`，必须先按数据库文档准备本地 Docker；缺环境时不可跳过后称通过。CAAU-003 已完成本机真实数据库验收，证据见 roadmap；后续数据库改动仍需重跑，不把本机验收当远程 CI/生产通过。

使用官方 Node.js 24.20.0 和指定 pnpm。构建必须先于应用/API 测试；test:e2e 使用 3000/4173 端口且不复用既有服务。完整启动步骤、检查范围和已知提示见 docs/runbooks/local-tooling.md。构建与 Node 适配器联调不代表微信平台、真机或生产验证。
