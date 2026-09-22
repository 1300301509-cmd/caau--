# CAAU 正式工程

CAAU-057 为 Web 本地测试模式增加固定“总部超级管理员”身份和左下角全局账号权限切换。`CAAU_IDENTITY_MODE=local` 时首次进入自动使用超级管理员，可切换赛事管理员、审核员和承办方经办人；正常模式继续使用正式账号登录，绝不显示或开放测试签发入口。操作与安全边界见[本地身份手册](docs/runbooks/authorization.md)。

CAAU-053 已重设计承办方小程序“我的比赛”工作台与五个业务子模块的移动界面，包含赛事切换、真实概览、每日赛程筛选及统一交互。见[设计与技能选型](docs/product/miniapp-competition-design.md)；正式微信及完整平台写入验收仍以 roadmap 为准。

CAAU-052 已接入承办方小程序【我的比赛】下的球队管理、赛程编排、物料管理、赛事情况，并保留人员管理。源码/本地检查与微信平台验收分别记录，操作见[小程序比赛模块](docs/runbooks/miniapp-competition.md)，当前验证状态见 roadmap。

CAAU-050 新增【比赛管理中心 → 人员管理】：总部及本赛事承办方维护裁判等工作人员，支持多岗位、编辑、停用/恢复和变更历史；单场人员接口可关联名单并保存当时资料，赛程页选人界面待后续接入。见[人员管理操作与接口](docs/runbooks/event-staff.md)，实际验收状态见 roadmap。

CAAU-043 已完成【比赛管理中心 → 物料管理】后端本地交付：承办方按赛事维护名称、数量、照片和准备进度，总部只读追踪；当前不含小程序页面或总部审核动作。见 [赛事执行物料规则](docs/product/event-supplies.md)和[接口手册](docs/runbooks/event-supplies.md)。

CAAU-044 已完成总部 Web【物料管理】只读追踪页本地交付：接入真实物料接口，提供状态概览、筛选、照片与更新历史，不增加总部写入或审核动作。

CAAU-042 新增【比赛管理中心 → 赛程编排】：单循环与单败淘汰候选赛程、时间/场地/休息约束、人工调整、冲突校验和版本化发布；未来智能体复用同一接口。见 [赛程编排操作](docs/runbooks/event-scheduling.md)，实际验证状态见 roadmap。

CAAU-041 新增【比赛管理中心 → 球队管理】：手工录入球队档案与本赛事独立资料，任何一侧修改不自动同步；账号关系基础已预留，邀请认领及小程序球队页面后续实现。见 [球队管理操作](docs/runbooks/team-management.md)，实际验证状态见 roadmap。

CAAU-034已完成本地交付：小程序首页→我要办赛→申请比赛/材料提交/办赛进度；新申请简表、材料获批门槛、线下合同确认及最终批准办赛，见[流程规格](docs/product/hosting-journey.md)。数据库51/51、Web E2E9/9通过，微信工具页面已核对，正式平台与真机仍待验收。

本仓库用于建设 CAAU 微信小程序、Web 管理后台和后端 API。

CAAU-029“总部Web正式账号密码认证”A/B/C/D已完成本地交付：复用既有`InternalUser`、角色/grant和opaque `Session`，实现scrypt、HttpOnly Cookie、CSRF、持久限流、会话撤销、受控超级管理员初始化、全局AuthGate、首次/主动改密及账号/角色/业务授权管理；正常模式不暴露测试身份，小程序Bearer保持兼容。隔离`db:test` 48/48、Web E2E 9/9通过；本地正式登录入口和忽略凭据文件已准备，生产HTTPS/代理/密钥/多实例及远程CI未验收。见[认证运行手册](docs/runbooks/password-authentication.md)、[技术设计](docs/adr/0011-password-cookie-authentication.md)和[分阶段计划](docs/planning/caau-029-password-authentication.md)。

CAAU-028总部“赛事审核中心”设计已作为总部Web统一界面：默认进入承办申请审核，办赛材料审核作为同模块次级入口；旧版壳层不再作为产品方向。视觉与信息结构见[审核中心设计](docs/product/review-center-design.md)，业务接口、权限和历史规则继续沿用CAAU-027。

当前优先任务为 CAAU-027“赛事承办申请”：A规格、B后端、C总部Web及D承办方小程序源码均已完成本地验收，包含草稿/私有附件/不可变V1/V2、共享审核、原子获批、承办关系、人员基本信息查看权、总部五态审核，以及小程序独立入口、六态申请办理、补充重交、差异/历史和获批赛事只读页；完整`db:test` 44/44通过、0跳过。官方微信开发者工具已实际核验页面与只读流程，但文件选择自动化桥仍阻塞上传/下载闭环；真机未运行。操作和证据见[后端手册](docs/runbooks/event-hosting-applications.md)、[总部Web审核手册](docs/runbooks/event-hosting-application-web.md)及[承办方小程序手册](docs/runbooks/event-hosting-application-miniapp.md)。既有 CAAU-012 A/B/C/D 已完成本地交付：单份材料五态、赛事共享审核、不可变历史，以及 Web `/materials`、Taro承办页面和自动同步。42项数据库全套通过；15条浏览器同步样本 p50 1821ms、p95/max 2093ms。旧数据/附件/模板保留。官方游客模拟器加本地测试身份已完成一条新增/V1退回/V2通过主流程；真实文件选择返回后平台回调悬挂，附件闭环、正式微信身份/AppID/合法域名及真机仍未通过，现按用户指令暂缓。当前三方功能状态见 [产品功能清单](docs/product/current-function-matrix.md)，赛事创建、承办指定与信息变更问题见 [赛事管理缺口](docs/product/event-management-gap-analysis.md)；可操作演示及分层边界见 [Web手册](docs/runbooks/individual-material-web.md)、[后端手册](docs/runbooks/individual-materials.md) 和 [Taro手册](docs/runbooks/individual-material-miniapp.md)。

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
- [赛事承办申请产品规格](docs/product/event-hosting-application-spec.md)：正式赛事前置申请、审核动作、版本资料、两端入口与待确认规则。
- [赛事承办申请技术设计](docs/adr/0010-event-hosting-application.md)：原子获批、赛事来源、机构承办关系和授权分离设计及已实现技术决策。
- [CAAU-027 分阶段计划](docs/planning/caau-027-event-hosting-application.md)：A/B/C/D源码及本地验收状态、平台限制与阶段证据。
- [正式账号密码认证运行手册](docs/runbooks/password-authentication.md)：正常/local模式、受控初始化、账号权限管理、Cookie/CSRF及生产前缺口。
- [正式账号密码认证设计](docs/adr/0011-password-cookie-authentication.md)：凭据哈希、Cookie/CSRF、限流、会话撤销、初始化与小程序兼容决策。
- [CAAU-029 分阶段计划](docs/planning/caau-029-password-authentication.md)：后端、Web、测试和本地体验准备的阶段范围及验收矩阵。
- [赛事承办申请后端手册](docs/runbooks/event-hosting-applications.md)：迁移、首个本地超级管理员、接口、验证证据和环境限制。
- [总部 Web 承办申请审核](docs/runbooks/event-hosting-application-web.md)：访问入口、合成数据、测试身份、体验步骤及浏览器验收证据。
- [承办方小程序赛事承办申请](docs/runbooks/event-hosting-application-miniapp.md)：主页入口、申请办理、同步保护、完整体验步骤及开发者工具/真机证据边界。
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
corepack pnpm dev:admin     # http://127.0.0.1:5175
corepack pnpm dev:miniapp   # watch 编译，产物 apps/miniapp/dist
```

Web 当前提供 `/materials` 资料审核、`/events` 赛事管理、`/hosting-applications` 承办申请审核和受权可见的`/accounts`账号权限管理，使用同一套紧凑后台壳层；正常模式统一进入正式账号登录，不显示测试身份。原 `/workspace` 不进入导航，仅暂留自动化回归兼容。只有自动化/本地业务回归才以 `CAAU_IDENTITY_MODE=local corepack pnpm db:api` 显式开启五个固定测试身份；后端签发真实Bearer测试会话，当前标签页刷新恢复且标签页间互不覆盖。`corepack pnpm events:local` 幂等准备两个本地测试赛事及范围授权；`corepack pnpm tasks:local` 进一步准备两个空材料清单、可自由新增的体验任务，不代替用户新增、提交或审核。`corepack pnpm materials:demo` 才会追加带预置业务过程的合成演示任务。工程连接辅助页位于 `/system/health`。小程序需在微信开发者工具中导入`apps/miniapp`；材料流程见[材料Taro手册](docs/runbooks/individual-material-miniapp.md)，承办申请见[申请小程序手册](docs/runbooks/event-hosting-application-miniapp.md)。当前仍是`touristappid`和回环HTTP，承办申请页面已在官方模拟器运行，文件选择闭环、正式平台与真机仍未完成。API 开发命令先编译再启动，不自动热重载。

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
