# ADR-0027：平台治理、逐调用用量与独立遥测

状态：采用；服务器试运行另验。

## 决策

- 总部 Web `/governance` 复用现有身份、角色、CSRF 和数据库事务，首版仅总部超级管理员。原 `/accounts` 保留，治理入口不改变原账号管理授权。
- `governance` 服务提供审计、会话、账号全景、对话审查、成本和额度；数据库入口仍只在 `@caau/database`。前端只消费生成客户端。
- 每个 HTTP 请求生成新的可信 requestId，忽略客户端伪造编号。业务审计、模型调用和 OpenTelemetry span 通过此编号关联；模型/业务 span 不采集输入输出原文、SQL、请求头或内部思维。
- 业务关键写入及成功审计同事务；技术采集故障不回滚业务。有界日志队列最多1000项，文件每16MiB轮转、最多4个旧文件；丢弃计数可告警。采集文件只含允许字段。
- 用量按每次实际模型调用独立记账。路由、聊天、意图、查询规划、排程需求理解、连接测试分别记录；模拟模式独立。现有 HTTP Agent 适配器通过统一包装接入；直接实例化适配器的手工脚本不冒充平台账本。
- 额度使用 Serializable 事务、持久周期桶及调用预占；北京时间日/月独立。预占估算不是精确分词或供应商费用封顶。未知用量保留预占，人工核对必须说明原因。历史价格与归属在调用开始时冻结。
- 价格使用整数微货币单位，每百万Token计价；输入缓存是输入的子集，已知缓存价格时从普通输入中扣除，防止双计。账单差额只展示，不自动分摊。
- 对话审查先提交审查访问审计，再返回现存有序正文；全文只从 AgentTurn 读取。禁缓存、凭据模式遮蔽，无正文批量导出。
- 独立 Docker 监控栈仅网关/OTLP绑定本机；Grafana代理每请求回到CAAU鉴权，不发长期Grafana登录凭据，自动账户为Viewer。独立通知进程持久保存发送状态，业务API停机不阻止向已配置飞书群发送。
- 清理函数为固定范围 SECURITY DEFINER，禁止业务运行账号执行；维护脚本只验证本地数据库，恢复只新建隔离临时库，不原地恢复开发库。

## 版本依据

使用官方 OpenTelemetry Node SDK 与 OTLP HTTP；SDK0.222.0/API1.9.0。监控镜像固定版本及摘要，见 compose 文件。Tempo3采用 backend_scheduler（不能沿用2.x compactor配置）；Alloy启用 file_match 后才可采集文件通配符。

- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [Tempo3迁移](https://grafana.com/docs/tempo/latest/set-up-for-tracing/setup-tempo/migrate-to-3/)
- [Alloy文件采集](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.file/)
- [OWASP会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

现有LangGraph API要求node-server2.x，而node-ws声明旧1.x peer；仅对这一对peer作定向声明，不全局放松依赖。`@types/pg`统一8.23.1，避免checkpoint数据库Pool重复类型。Studio官方页面人工操作仍独立验收。

## 限制

单监控主机故障仍存在告警盲区。90天指标同时有20GiB容量上限，容量耗尽时可能提前裁剪，服务器须按真实采集量评估。Prometheus/Grafana不代替业务审计证据。财务、增长、赞助未实现，治理总览不得生成对应运营数字。
