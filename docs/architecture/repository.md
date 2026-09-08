# 仓库与代码组织

状态：仓库组织基线；应用内部目录为后续初始化目标，当前尚无源码。

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

使用 pnpm workspace 单仓库；未来包命名 `@caau/miniapp`、`@caau/admin`、`@caau/api`、`@caau/api-client`。若 database 提供运行时入口，作为仅服务端使用的 `@caau/database` 包加入工作区。依赖与包定义在 CAAU-002 核验后建立。

## 依赖方向

```text
miniapp ─┐
         ├── api-client ── HTTP ── api ── database ── PostgreSQL
admin ───┘
```

- 应用之间不能通过相对路径导入源码；前端不能依赖 api 或 database。
- api-client 来自后端 OpenAPI 契约，生成文件不手工修改。生成工具、输出路径和可复现命令在 CAAU-003 固定。
- 初期不创建通用 UI、utils 或多个配置包。出现两个明确使用方且语义一致时再提取共享包；两端不强制统一 React 版本。
- 依赖边界目前由评审执行；工程可运行后在 CAAU-002 中增加相应静态检查。

## 后端模块

后端采用模块化单体，业务模块位于 `apps/api/src/modules/<domain>/`。模块按实际功能建立，避免预先生成全部空模块。

建议内部职责：controller 接收请求；DTO 校验输入并描述契约；service 执行业务用例、授权范围和事务编排；repository 承担模块数据访问。简单模块不必为每个类增加一层目录。

基础域：auth 管理身份与会话；organizations 管理组织和成员关系；permissions 管理操作及数据范围；events 管理赛事；tasks 管理交付与审核；files 管理附件授权。报名、财务、AI 等在对应需求确认后加入。

跨模块通过明确导出的服务或接口调用，不直接使用其他模块的 repository 或修改其所属记录。需要跨域事务时，在实现前明确事务用例的负责模块和参与服务，不把事务拆成不能回滚的独立写入。

## 前端与测试

前端按 `src/features/<domain>/` 放置业务功能；应用入口与路由放 `src/app/`，真正的通用组件放 `src/components/`。miniapp 保留 Taro 所需页面和配置目录，以实际脚手架约定为准。

单元测试靠近被测源码；各应用集成测试放其 `test/`，端到端测试放其 `e2e/`。使用合成 fixture，不把原型账号或真实名单作为测试数据提交。具体测试框架在工程初始化时核验。
