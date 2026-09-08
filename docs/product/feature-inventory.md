# 原型功能清点（CAAU-008）

状态：只读静态核查完成；不是运行验收，也不是业务规则确认。12 个板块名称来自 [requirements.md](requirements.md) R-003；本轮用户要求清点原型、不编写业务代码、不修改或迁入原型数据。

## 1. 方法、来源与证据等级

原型根目录：`/Users/xx_mac/Desktop/CAAU智能体/`。以下 `P:` 路径均相对此目录，行号按本轮快照；函数名用于后续定位。正式仓库原型源码未复制。

| 标记 | 含义 |
| --- | --- |
| 实现-S | 找到页面调用和服务端处理/持久化代码；只确认实现路径存在，未验证运行成功、安全完整或数据真实 |
| 实现-L | 找到浏览器计算、下载或 localStorage 写入；不代表跨账号、跨设备协同 |
| 模拟-M | 固定展示、提示框、跳转或固定规则回答，未形成对应业务处理 |
| 数据-D | 硬编码样例/预设；自称附件快照的值另标“来源待核验”，不当作真实业务事实 |
| 待确认-Q | 业务规则、外部依赖或本次证据不足；没有证据不等于外部系统一定不存在 |
| 建议 | 开发执行者提出的正式工程方案，待业务采纳；不等于已实现 |

核查了 `P:index.html` 的 12 个 `data-page` 容器与脚本顺序、`P:app.js` 的页面和交互函数、`P:platform.js` 的 API 增强层、`P:server.py` 的路由/授权/写入路径，以及 `P:permissions_matrix.json`、`P:product_blueprint.md`、`P:workflow_catalog.json`、原型 README 边界段。列出 `templates/` 的 11 个 Markdown 文件和 `tests/smoke.py`，仅核对测试断言位置，不运行测试。

未读取 `.env.local`、数据库记录、上传文件、工作资料或浏览器存储；未复制账号、密码、联系人和名单。未启动服务、安装依赖、调用模型或外部服务。原型启动可能初始化数据库并启动外部教务进程，因此不适合作为本轮只读检查手段（`P:server.py:init_db/start_club_service/main`）。

## 2. 总体发现

- **实际存在 12 个单页视图，而非 12 个独立业务系统。** `P:index.html:74–111`；`app.js:pageLabels` 先列 11 项，`platform.js:configureIdentity` 增加数据管理。
- **两套数据路径并存。** `index.html:149–150` 先加载 app，再加载 platform；`platform.js:installRenderHooks/loading/refreshLiveModules` 保留旧页面并插入数据库区块。经营总览未见对应实时刷新接管；财务、任务、运营等旧演示区不能因旁边出现“数据库数据”就整体标成真实实现。
- **有服务端底座但不是正式权限体系。** `server.py:current_user/require_user/allowed_event_ids` 有会话与赛事过滤；模块权限不等于操作权限，详见 [权限矩阵](role-permissions.md)。
- **文档与代码存在历史差异。** `product_blueprint.md` 前段描述 SQLite，末段仍称未接数据库/模型；`permissions_matrix.json` 的教务、报名审核、合同范围比实际路由丰富。以代码说明实现，以用户确认说明需求，不以版本号、文案“已核验”作验收证据。

## 3. 按 12 个板块清点

### F-01 经营总览（`#overview`）

| 子功能/流程 | 判断与边界 | 来源 |
| --- | --- | --- |
| 角色指标、赛事生命周期、动态、增长漏斗 | 模拟-M/数据-D：固定数组与角色卡片；切换角色修改展示，不查询对应业务事实 | `P:app.js:renderMetrics/renderLifecycle/renderActivities/renderFunnel` |
| 每日报名/累计趋势、月度办赛进度、赛事经营表、人数倒挂与取消退费提示 | 实现-L 渲染图表；数值硬编码，自称附件/日更快照的来源待核验；不是订单级实时分析或自动异常检测 | `P:app.js:dailyRegistration/eventSnapshot/renderBusinessOverview` |
| 切换赛事、赛季、多选 | 实现-S：bootstrap 按赛事授权返回列表；前端选择后刷新部分模块，不能认定所有总览指标跟随选择 | `P:platform.js:configureEventPicker/refreshLiveModules`；`P:server.py:/api/bootstrap` |

### F-02 财务中心（`#finance`）

| 子功能/流程 | 判断与边界 | 来源 |
| --- | --- | --- |
| 四类赛事预设、参数调整、损益/盈亏平衡、情景比较、恢复预设 | 实现-L：浏览器公式计算；预设、税率、通道费、分成均不是已确认核算规则 | `P:app.js:financePresets/calcFinance/renderFinance/updateFinance` |
| 预算与决算对比、收支台账展示 | 数据-D/来源待核验：硬编码且自称附件基准；未核对源附件和银行/订单记录 | `P:app.js:financeLedgerTable/renderFinance` |
| 多站财务汇总、退款/成本/返款/利润、结算状态、来源标记 | 实现-S：GET finance 聚合 SQLite；数据管理可 PATCH 人工金额。不是支付、对账或财务审核 | `P:platform.js:renderFinanceLive/renderAdminLive`；`P:server.py:finance_payload`、finance PATCH |
| 锁预算版本→滚动预测→实际→复核→审批结算 | 待确认-Q：蓝图流程；无对应版本锁定或独立审批动作。浏览器公式与服务端汇总口径不同，迁移前需分别定义预算、实际与税务语义 | `P:product_blueprint.md §六`；`P:server.py:finance_payload/update_record` |

### F-03 运营中心（`#operations`）

| 子功能/流程 | 判断与边界 | 来源 |
| --- | --- | --- |
| 8 个 SOP 门勾选、进度展示 | 实现-L + 数据-D：旧区 localStorage；新数据库区独立，旧勾选不是总部验收 | `P:app.js:renderOperations/bindDynamic` |
| 节点状态、负责人、截止日、合同进度、新签/续约、付款回单、备注 | 实现-S：GET/PATCH operation_gates；合同和付款仅字段记录，无电子签约、银行验证或付款执行 | `P:platform.js:renderOperationsLive`；`P:server.py` operations GET/PATCH |
| 上传运营证据 | 实现-S：文件扩展名/大小校验、写本地 uploads、存 evidence/审计；先保存节点再上传，不原子。未找到证据列表/受控下载/审核闭环，未校验 gate 与 event 的归属一致 | `P:platform.js:renderOperationsLive`；`P:server.py:upload_evidence` |
| 单循环、分组淘汰、单败淘汰、容量检查、时间/场地安排、CSV、比赛日负荷 | 实现-L：生成内存草案和下载；规则正确性未测试，无服务端赛程版本、审核发布、技统同步。复杂回避、直播与裁判联排待确认 | `P:app.js:roundRobin/knockoutRounds/buildMatches/generateSchedule/exportSchedule/matchdayPanel`；`P:README.md` 原型边界 |

### F-04 协同中心（`#collaboration`）

| 子功能/流程 | 判断与边界 | 来源 |
| --- | --- | --- |
| 任务卡、过滤按钮、跨部门阻塞/测算/发起确认 | 模拟-M/数据-D；通用 data-action 仅提示框，过滤按钮未发现对应业务筛选处理 | `P:app.js:renderCollaboration/bindDynamic` |
| 旧任务完成勾选 | 实现-L：仅 localStorage，却提示“同步给协作成员” | `P:app.js:bindDynamic` data-task-id |
| 父子任务树、负责人、截止日、交付物、子任务进度和状态保存 | 实现-S：GET tasks 与 PATCH；没有按任务受理人区分写权限，也没有独立审核状态机 | `P:platform.js:renderCollaborationLive`；`P:server.py` tasks GET/PATCH |
| 新建任务、评论、退回原因、审核历史、通知 | “新建任务”仅转助手；未找到任务创建路由、评论和审核记录实现；audit_log 是通用更新记录，不等于审核历史 | `P:app.js:bindDynamic` data-new-task；`P:server.py:handle_api_mutation/audit`；蓝图 §二 |

### F-05 承办方门户（`#organizer`）

| 子功能/流程 | 判断与边界 | 来源 |
| --- | --- | --- |
| 阶段路线、总部对接、紧急提交、模板领取 | 模拟-M/数据-D，模板有静态下载链接；联系/立即提交等通用按钮仅提示 | `P:app.js:renderOrganizer/bindDynamic`；`P:templates/` |
| 球队新增、按资料/缴费状态筛选、提交总部审核、修改缴费状态、名单 CSV | 实现-L：localStorage 数据；“总部审核队列”没有服务端写入。缴费为手工状态，不是支付结果；CSV 直接含联系电话，不能照搬正式导出 | `P:app.js:readOrganizerTeams/saveOrganizerTeam/updateOrganizerPayment/submitOrganizerTeam/exportOrganizerTeams/bindOrganizerTools` |
| 物料数量/规格/负责人/状态、冠亚季军与联系人录入 | 实现-S：portal GET、deliverables/results PATCH；填完整后前端置“已提交”，无总部复核动作/不可变提交版本；旧报名区仅对一个固定赛事显示 | `P:platform.js:renderOrganizerLive`；`P:server.py` portal/deliverables/results 路由 |
| 门户专属助手、问题快捷入口 | 旧实现为规则回复/本地历史；platform 挂钩后调用 assistant API。没有读取本地球队台账的服务端工具证明 | `P:app.js:organizerAssistantReply/askOrganizerAi`；`P:platform.js:installRenderHooks` |

### F-06 增长中心（`#growth`）

曝光/访问/线索/沟通/报名漏斗、渠道表现、内容排期表、A/B 假设卡均为**模拟-M/数据-D**；“导入新线索”只是提示，“生成内容计划”跳助手。未找到渠道采集、内容发布、CRM、审核、归因与报名关联 API。蓝图的“选题→制作→审核→发布→线索→报名→复盘”是**待确认-Q**流程，不是已完成闭环。来源：`P:app.js:renderGrowth/bindDynamic`；`P:server.py:handle_api_get/handle_api_mutation`；蓝图 §二。

### F-07 俱乐部球队（`#clubs`）

**实现-L（集成入口）/待确认-Q（业务）**：有 iframe、独立打开、连接探测/重试和非本地降级提示。`renderClubs` 使用固定俱乐部参数访问本机另一端口；`server.py:start_club_service` 依赖原型目录之外的独立项目。当前授权目录内未找到该系统源码/API 契约；未追查其他目录、未启动外部项目。球队报名、秩序册、赛事公约、对战图、成绩、申诉、学员/课程/教练/考勤课消/场地提醒仅见入口文案和蓝图，不能确认内部实现或组织隔离。来源：`P:index.html:#clubs`、`P:app.js:renderClubs`、`P:server.py:CLUB_PROJECT/start_club_service`、蓝图 §二。

缺少：独立教务仓库的明确授权路径、可脱敏接口/页面清单、身份与组织绑定方案。iframe 加载成功文案或 no-cors 探测不证明业务可用。

### F-08 赞助权益（`#sponsors`）

权益进度、合同状态、证据卡、沟通记录为**模拟-M/数据-D**；上传证据按钮仅提示。未发现赞助合同、权益任务、品牌确认、证据上传和结案报告服务端路由。方案→合同→权益→证据→品牌确认→结案为**待确认-Q**流程。来源：`P:app.js:renderSponsors/bindDynamic`；`P:workflow_catalog.json:platform_loops.sponsor_delivery`。

### F-09 裁判管理（`#referees`）

资质/排班/评分表、证件临期、争议列表、六道监督步骤为**模拟-M/数据-D**；执法登记表校验比赛场次后保存 localStorage，属于**实现-L**，未见读取保存记录并汇入权威台账的链路。新建争议仅提示。资质审核、回避、排班、录像、多方评价、申诉复核、纪律处理为**待确认-Q**，没有对应 API。来源：`P:app.js:renderReferees/bindDynamic`；蓝图 §二；workflow_catalog referee_governance。

### F-10 资料中心（`#materials`）

| 子功能/流程 | 判断与边界 | 来源 |
| --- | --- | --- |
| 旧资料列表、类别按钮、下载、发布材料 | 列表为数据-D；静态文件链接存在；类别按钮未见筛选绑定；发布按钮只是提示 | `P:app.js:renderMaterials/bindDynamic` |
| 分类、赛季、版本、状态、负责人、待提供、API 下载 | 实现-S：数据库列表与源文件下载代码。downloadable 只看 source_path 非空，不证明文件存在；下载时才检查路径和文件 | `P:platform.js:renderMaterialsLive`；`P:server.py` materials GET/send_material |
| 按对象可见、版本发布、过期管控 | 待确认-Q/缺口：下载虽要登录，但未按 audience/角色/赛事过滤；部分模板仍可静态访问。没有发布、审核、版本变更接口 | `P:server.py:serve_static/handle_api_get/send_material` |
| 我奥操作资料 | 本地存在同名问题说明模板，但代码和文案标待官方确认；不是正式手册或接口已接入 | `P:templates/我奥系统操作与问题说明.md`（仅核对存在）；`P:platform.js:renderMaterialsLive`；`P:server.py:init_db` 资料状态更新 |

### F-11 智能助手（`#assistant` + 全局浮层）

**实现-S/L + 模拟-M**：有页内对话、全局助手、当前角色/页面/赛事上下文、localStorage 历史、assistant POST；未配置模型时按关键词返回知识表或固定答案，配置后有外部 chat/completions 调用路径。未检查真实配置和连通性。模型 system prompt 明说没有业务数据库和资料检索连接；未找到受控业务查询工具、任务创建、提醒调度、审批/付款/发布动作。回答标记“已核验”不是来源真实性证据。来源：`P:platform.js:globalAssistant/installRenderHooks`；`P:app.js:answerFor`；`P:server.py:call_ai_model/answer_assistant`。

**待确认-Q**：后续需要 AI 的具体业务价值、可检索资料、数据授权与人工确认范围；建议不阻塞首个非 AI 闭环。

### F-12 数据管理（`#admin`）

**实现-S**：查看数据源状态、账号/角色/赛事范围、最近审计；创建赛事；维护赛事和财务字段。来源：`P:platform.js:renderAdminLive`；`P:server.py:/api/admin/overview/create_event/update_record`。

限制：账号列表只读，无账号创建、组织成员管理或角色授权操作；填写 organizer_id 不会给承办方建立 event_scope。新赛事只伴随建立财务记录，未自动创建任务、节点和交付项；赛事和财务分两次 PATCH，非统一事务。未发现通用导入导出、数据字典编辑或备份恢复界面。数据源“已启用/已导入”是静态来源说明，不是同步任务健康检测。以上来源同上。

## 4. 流程结论与资料缺口

| 流程 | 已找到的片段 | 断点/待确认 |
| --- | --- | --- |
| 建赛事→授权→分配任务→材料→总部审核 | 建赛事、已有任务更新、运营证据上传、审计 | 没有授权配置、任务创建、提交版本、审核动作和受控证据取回；不能称完整闭环（F-03/04/12） |
| 球队报名→资料审核→缴费→参赛 | 本地新增/筛选/状态/导出 | 未入共享数据库，无总部审核和支付验真，教务系统未知（F-05/07） |
| 预算→实际→决算 | 前端测算、人工实际、服务端汇总 | 口径确认、预算版本、复核审批、支付对账缺失（F-02） |
| 排赛→审核发布→赛果交付 | 浏览器草案/CSV、独立赛后名次记录 | 无已发布赛程与赛果的关联/校验、技统集成（F-03/05） |
| 增长/赞助/裁判治理 | 展示、提示或局部本地记录 | 业务事实、参与职责、动作接口和验收规则未落实（F-06/08/09） |

原型内容足以支撑产品梳理，不足以确认历史数据可迁移、业务闭环优先级和正式规则。缺少可信业务字段样表、当季模板/审核口径、教务接口、我奥/支付/渠道接口及授权；这些按相关模块启动顺序处理，不一次索取全部资料。**本轮不导入任何历史数据，后续只用合成数据验证。**

两端分工、首闭环和分层调整建议见 [mvp-scope.md](mvp-scope.md)；权限与风险见 [role-permissions.md](role-permissions.md)。
