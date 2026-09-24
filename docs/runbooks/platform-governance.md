# 平台治理与监控运行手册

对应 [实施计划](../planning/caau-governance.md)、[架构决策](../adr/0027-platform-governance.md)。

## 入口和权限

总部Web `/governance`，仅总部超级管理员。账号管理原入口兼容。审计与用量列表默认50、最大100；CSV最多一万条并防表格公式注入。对话逐页100条，按持久序号展示，每页正文访问都记录原因；审查人撤权后不能再读取。有效登录会话不等于在线。

用量价格单位：输入/输出/缓存每百万Token对应的微货币整数；1元=1000000微元。价格新增版本不覆盖过去。账号费用归属由管理员明确指定现有机构，独立于业务成员关系；未指定时只归账号。未知用量不填0，必须取得依据后核对。

## 本地初始化

先按 [数据库手册](database-contract.md) 和 [本地工具](local-tooling.md) 使用项目指定Node24.20.0、pnpm10.32.1。

```sh
corepack pnpm monitoring setup
corepack pnpm monitoring validate
corepack pnpm monitoring up
corepack pnpm monitoring status
```

配置保存在忽略的 `.local/monitoring/`，不得提交或打印。`api.env` 是业务API启动时需额外加载的监控配置；不会自动覆盖既有 `apps/api/.env`。`runtime.env` 可配置 `CAAU_FEISHU_WEBHOOK` 与 `CAAU_FEISHU_SIGNING_SECRET`，仅飞书HTTPS官方域名。准备好后重建notifier/grafana容器以加载配置；已有未配置通知显示UNCONFIGURED。

本机服务：网关3300、OTLP14318；Web Vite将 `/ops/grafana/` 代理到网关。正式Cookie会话可进入，只有本地Bearer测试会话不能绕过网关。Grafana根地址默认127.0.0.1:5175（可用CAAU_GRAFANA_ROOT_URL覆盖），远程部署须替换成真实HTTPS域名；内部存储不开放公网。远程独立监控主机还需受限网络/TLS、真实业务主机地址和日志采集路径，不能直接照搬host.docker.internal。

```sh
node scripts/monitoring-smoke.mjs
node --test scripts/observability-notifier.test.mjs
```

前者写入专用合成probe日志和trace验证Alloy→Loki/Tempo，再查各组件ready；后者用本地合成飞书端点验证签名、重复、恢复和重启。两者均不代表真实飞书送达。

## 清理和备份

```sh
corepack pnpm governance:maintenance storage-scan
corepack pnpm governance:maintenance dry-run
corepack pnpm governance:maintenance backup
corepack pnpm governance:maintenance purge --apply
corepack pnpm governance:maintenance restore-test --test
```

`storage-scan`只读比较五类登记和PrivateStore文件元数据，最多十万条/个，超限明确失败；不读取正文、不跟随符号链接、不删除孤立对象。若API使用自定义CAAU_PRIVATE_FILE_ROOT，执行时须加载相同配置（相对路径按apps/api解析）。快照绑定数据库来源摘要（不保存凭据），不同环境不会互读；用于Web展示和Prometheus容量趋势，超过24小时显示STALE；运行时并发上传可能导致暂时差异，需人工复核。首次扫描前显示未接入。

`backup`写入私有目录 `.local/monitoring/backups/`，完整成功才从partial重命名。备份包含业务数据，禁止提交、聊天上传或复制到公开目录。清理只处理90天前监控记录及7天前符合固定文件名的备份；原Agent消息、业务版本/回执及业务附件不会被清理。运行账号没有清理函数权限。

恢复演练只支持本机15433独立test服务，会新建随机`caau_restore_*`库，核对账号/消息/赛程版本/回执数量，执行过期监控清理后删除自身临时库。不得把开发库作为恢复目标。服务器恢复时先隔离网络，完成过期清理、凭据轮换和权限核验后才能重新开放；备份回滚不能使已过期监控数据重新公开。

服务器应由独立维护身份每日执行备份和清理，并采集结果；本地不会擅自安装常驻计划任务。完整平台恢复还需私有附件与Grafana/Loki/Tempo/Prometheus卷，数据库dump不等于完整平台备份。远程加密备份、恢复时效和容量验证须另外登记。

## 故障与验收

- API/数据库不可用：先看外部ready探测，再按requestId查审计和trace；未知供应商原因保持unknown。
- 模型额度：区分used与reserved、已知与待核对；达到额度只拒绝新模型调用，不阻塞已生成票据人工确认。
- 采集失败：检查scrape、日志丢弃、Alloy状态与磁盘；不得通过开启原始请求/聊天日志诊断。
- 告警确认只记录负责人/备注；恢复必须由探测状态决定。相同故障去重，持续每30分钟提醒，恢复另发。
- 通知失败：独立进程持久保存待重试；API停机时先通知，恢复后同步平台。飞书未配置时不可声称通知成功。
- 百万审计性能：`CAAU_GOVERNANCE_PERFORMANCE=1 CAAU_BROWSER_API_PORT=3100 VITE_API_BASE_URL=http://127.0.0.1:3100 corepack pnpm db:test`。只在临时test库生成百万行，输出忽略的 `.local/evidence/governance/performance.json`。

服务器验收须记录4vCPU/8GB/100GB或实际配置、非模型API对照P95、真实通知、停API/停采集器/模型故障/磁盘/备份演练及连续七天结果。微信开发工具、真机、真实千问与服务器分别列结果。
