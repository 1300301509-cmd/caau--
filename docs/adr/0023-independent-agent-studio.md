# ADR-0023：独立 LangSmith Studio 开发工作台

状态：采用；任务 CAAU-061。

## 决策

用户要求使用官方 LangGraph 可视化工作台，并明确不嵌入现有 CAAU Web。采用官方 LangSmith Studio 浏览器页面连接本机 Node Agent Server（127.0.0.1:2024），CLI 固定 `@langchain/langgraph-cli@1.5.0`，沿用 Node 24.20.0、LangGraph.js 1.4.17、core 1.2.12。

启动器属于仓库开发工具；图入口位于 `apps/api/src/studio`，不添加产品接口，不跨应用引用源码。使用现有 `AiService` 提供开发图，复用模型适配器、路由防护函数、权限校验、消息写入及全部单场预览业务节点。工作台把这些步骤显式展开；生产 `message` 仍使用原工作流和数据库 checkpoint。两者共享业务函数，不宣称 Studio 调试图与产品顶层编排完全相同。

Studio 使用 Zod 运行时状态和输入 schema，使官方 `/schemas` 端点直接返回结构；避免 CLI 对已编译 NestJS 图进行 TypeScript 静态推导失败。工作台使用 Graph 模式，未接 `MessagesState`，官方 Chat 模式不可用。

## 数据与运行范围

- 每次启动在专用本地 test PostgreSQL 创建 `caau_studio_<随机UUID>`，应用现有迁移并建立四队合成赛事和 V1 草稿。只在此库保存调试对话、任务及预览票据。
- 启动后模型使用已有服务端 Qwen 配置，真实调用会消耗供应商用量；不复制密钥到图状态、浏览器或配置文件。
- 测试身份 token 只存在服务端闭包。入口拒绝开发库、远程库、生产模式和云 tracing；启动器显式关闭 LangSmith/LangChain tracing。官方云端 Trace 面板未启用，使用本地状态检查。
- 工作台没有确认保存或发布节点。正式产品的票据确认、CAS 与幂等逻辑保持原状。
- Ctrl+C 清理本进程创建的精确临时库及 checkpoint 目录；强制杀进程的残留需要按确切库名调查，禁止批量删库或删除 Docker 卷。

## 限制

这是可交互的本地开发环境，不是生产监控平台；不能直接读取当前开发库赛事或历史会话。Studio 的重放/修改状态功能仅针对合成数据。LangSmith 登录由用户完成，账号或付费服务不是自动开通范围。

官方依据：[Studio](https://docs.langchain.com/langsmith/studio)、[本地接入](https://docs.langchain.com/langsmith/quick-start-studio)、[应用结构](https://docs.langchain.com/langsmith/application-structure)。
