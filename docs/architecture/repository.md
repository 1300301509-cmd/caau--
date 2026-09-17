# 仓库与代码组织

状态：CAAU-002 三应用基线已保留；CAAU-003 已加入数据库入口、独立就绪接口与生成客户端，独立检查及本机真实数据库连接/恢复/迁移/shadow 验证通过，决策见 [ADR-0002](../adr/0002-database-contract.md)。CAAU-004 已落地 authorization 模块及身份/权限锚点模型，见 [ADR-0003](../adr/0003-authorization.md)；CAAU-005 第一段已落地 `materials` 业务模块与总部工作台，全段关系和事务边界见 [ADR-0004](../adr/0004-material-workflow.md)。

用户提供的 12 个实际导航板块及其前后端分层见 [业务模块映射](module-map.md)。模块边界提前规划，源码目录随对应功能实现落地。

## 目录责任

| 路径 | 唯一职责 | 不应放入 |
| --- | --- | --- |
| apps/miniapp | 小程序页面、终端交互和平台适配 | 管理后台 UI、数据库访问 |
| apps/admin | Web 后台页面、表单、路由 | 服务端授权实现 |
| apps/api | API、业务规则、授权、外部集成 | 两端 UI |
| packages/api-client | 契约生成客户端与接口类型 | Prisma 实体、密钥、手工业务规则 |
| database | Prisma 模型、迁移、合成测试数据、服务端数据库入口 | 真实导出数据、前端共享类型 |
| deploy | 容器、环境部署配置与相关脚本 | 真实凭据、业务代码 |
| docs/product | 需求、流程、验收标准 | 未标注的演示假设 |
| docs/adr | 有理由和影响的架构决策 | 日常任务流水 |
| docs/runbooks | 可验证的运行维护步骤 | 未验证的成功声明 |

使用 pnpm workspace 单仓库；应用为 `@caau/miniapp`、`@caau/admin`、`@caau/api`；`@caau/api-client` 提供真实契约、请求门面与平台适配；`@caau/database` 提供仅服务端使用的 Prisma/pg 入口。后两个包已随 CAAU-003 实际实现而加入，不是占位空包；正式 Prisma schema 当前包含身份/授权、赛事/任务、要求/模板快照、私有文件、旧整包草稿/提交/审核，以及 CAAU-012 单份材料执行模型；新旧模型分开，旧提交不拆成假逐份结果。

## 依赖方向

```text
miniapp ─┐
         ├── api-client ── HTTP ── api ── database ── PostgreSQL
admin ───┘
```

- 应用之间不能通过相对路径导入源码；前端不能依赖 api 或 database。
- api-client 的类型、路径/方法和响应枚举来自 Nest OpenAPI，生成文件不手工修改。`contract:generate` / `contract:check` 固定生成与漂移检查；手写门面消费生成元数据，fetch 与 Taro 适配器分开。客户端无运行时依赖，不引用 API 源码或数据库实体；当前生成器范围与扩展限制见 [数据库与契约文档](../runbooks/database-contract.md)。
- 初期不创建通用 UI、utils 或多个配置包。出现两个明确使用方且语义一致时再提取共享包；两端不强制统一 React 版本。
- AST 导入与依赖清单检查覆盖三个应用、api-client 和 database，禁止跨应用源码、前端及 api-client 引入数据库/服务端依赖；当前无路径别名，新增别名或计算型导入须先扩展规则。检查实现与反例测试见 scripts/check-boundaries.mjs 及其测试；完整打包/供应链安全检查不能由该规则替代。

## 后端模块

后端采用模块化单体，业务模块位于 `apps/api/src/modules/<domain>/`。模块按实际功能建立，避免预先生成全部空模块。

建议内部职责：controller 接收请求；DTO 校验输入并描述契约；service 执行业务用例、授权范围和事务编排；repository 承担模块数据访问。简单模块不必为每个类增加一层目录。

当前 `authorization` 统一承担身份/组织/权限锚点管理、策略与授权事务审计；控制器/DTO、全局 Guard、service 及 policy 分离，Prisma 构造入口仍仅在 database。后续新增业务域复用策略并保持授权、业务写入、审计同事务。

CAAU-005 `materials` 负责赛事/任务业务用例与发布事务，通过授权模块公开的 `run`、锚点创建/指派及策略服务参与同事务；不另建会话或绕过审计。业务对象与权限锚点共享 UUID。Web `features/materials` 仅消费生成客户端，按身份提供登记/赛事/任务操作；第一段时无小程序业务页，第三段实现范围见下述说明。第二段 `workflow` 模块负责私有文件、执行状态/草稿/提交/审核、延期与交接，复用同一个 authorization.run 事务/审计；materials 发布通过公开 initializeExecution helper 同事务初始化执行状态。Prisma 仍仅从 @caau/database 引入，私有磁盘仅在 API 侧访问；第三段增加 Web 审核/管理和承办联调组件、Taro 任务列表/详情/本地身份页；共用 api-client 内无 React/平台依赖的材料命令状态与字节摘要助手，UI 与 Taro 文件选择仍各自归属应用。小程序运行时单独验收。

CAAU-012 新增 `individual-materials` 模块：独立五态、草稿/动作历史、版本/文件、幂等/CAS及分页快照。通过 authorization 的 `individualPolicy`/授权事务/经办历史 helper、materials 的公开任务创建与配置发布服务、workflow 的任务控制 helper 协作；不复制赛事、机构或有效截止。EventGrant.active 的撤权由 authorization 管理，旧策略同步检查，不将新共享审核权限用于读取旧整包。实现细化见 [ADR-0008](../adr/0008-individual-material-review.md)，操作见 [单份材料后端](../runbooks/individual-materials.md)。C阶段新增 `apps/admin/src/features/individuals` 与 `/materials`；仅消费 `@caau/api-client` 的生成请求和平台无关 `IndividualWorkspace`。协调器管理权威快照/独立编辑缓冲、分页、epoch、顺序轮询/退避、幂等重试和权限清理；React与浏览器生命周期/文件选择只在Web适配。每批先显示已鉴权快照，目录/身份并行、历史按版本补读，不让历史读取阻塞状态展示。真实多会话测试由 `scripts/individual-browser.integration.mjs` 编排，和旧浏览器回归分开；演示见 [Web手册](../runbooks/individual-material-web.md)。D阶段新增 `apps/miniapp/src/features/individuals` 并复用同一协调器；Taro层只负责页面生命周期、网络监听、安全随机数、文件选择/沙箱写入与预览。旧整包组件移至 `features/materials/LegacyTaskPage.tsx` 并按任务通道分流，底部三入口不变。构建/传输测试已通过，但当前开发者工具和真机受AppID/HTTPS/成员及工具服务端口阻塞，不将源码或Web结果冒充平台通过；见 [Taro手册](../runbooks/individual-material-miniapp.md)。

CAAU-027新增`event-hosting-applications`后端聚合及两端feature。总部Web与Taro小程序均只消费生成客户端；小程序`features/hosting`负责表单缓冲、前后台轮询、CAS冲突协调和平台文件适配，`pages/hosting`及`pages/event-info`分别承载申请办理和获批赛事基本信息只读页。身份契约显式返回当前actor具有active申请办理grant的机构，前端不通过赛事或历史申请推导机构。获批赛事基本查看权、宽泛EventGrant和TaskScope仍分离；小程序入口不改变服务端逐请求授权。

CAAU-015 的固定本地身份定义和幂等准备位于仅服务端可用的 `@caau/database`，API authorization 模块只在显式 local 模式列出固定身份并签发原 Session；生成契约由 Web 消费。Web 的 token 只进入标签页 sessionStorage，恢复后仍通过 API 重新鉴权；角色与业务数据不写入前端存储。该入口不新增数据库模型或生产认证模块，边界见 [ADR-0009](../adr/0009-local-test-identity-switching.md)。

CAAU-029在同一authorization模块和`InternalUser`/`Session`上追加正式密码凭据与Cookie认证，不建立平行用户或权限系统。B阶段已实现服务端scrypt、Cookie、CSRF、持久限流、初始化和会话撤销；fetch适配器支持Cookie/CSRF，小程序Taro适配器继续Bearer。Web统一AuthGate和账号页面留C阶段；边界见[ADR-0011](../adr/0011-password-cookie-authentication.md)。

基础域规划：auth 管理身份与会话；organizations 管理组织和成员关系；permissions 管理操作及数据范围；events 管理赛事；tasks 管理交付与审核；files 管理附件授权。报名、财务、AI 等在对应需求确认后加入。

跨模块通过明确导出的服务或接口调用，不直接使用其他模块的 repository 或修改其所属记录。需要跨域事务时，在实现前明确事务用例的负责模块和参与服务，不把事务拆成不能回滚的独立写入。

## 前端与测试

前端按 `src/features/<domain>/` 放置业务功能；应用入口与路由放 `src/app/`，真正的通用组件放 `src/components/`。miniapp 保留 Taro 所需页面和配置目录，以实际脚手架约定为准。

单元测试靠近被测源码；各应用集成测试放其 `test/`，端到端测试放其 `e2e/`。使用合成 fixture，不把原型账号或真实名单作为测试数据提交。CAAU-002 使用 Node 原生测试、tsx 请求逻辑测试与 Playwright Web E2E；真实 HTTP 联调编排放 scripts/clients-http.integration.mjs，仅测试用途，不被任何应用引用。微信工具与真机验证独立记录。数据库真实联调单独由 scripts/database.integration.mjs 编排 test 容器；临时迁移模型/库不进入正式 schema，不混入无需 Docker 的 test 命令，也不缺环境就静默跳过。真实数据库套件已在本机 macOS/arm64 执行通过，远程 Linux CI 未执行。
