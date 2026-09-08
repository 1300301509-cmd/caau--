# @caau/api-client

Web 与 Taro 共用的健康/就绪及权限底座客户端，**无运行时依赖**。不包含 Prisma 实体、Nest、Node 内置模块、密钥或业务规则。

## 生成边界

Nest DTO/控制器 → 真实 OpenAPI → openapi-typescript 类型及操作元数据：

- `openapi.json`
- `src/generated/schema.ts`
- `src/generated/operations.ts`

以上三个文件受追踪且禁止手改。手写的 `src/index.ts` 只提供传输中立的请求门面、错误类型与生成响应枚举校验；`fetch.ts` 和 `taro.ts` 是独立适配器，不能宣称这些手写适配代码也是工具生成的 SDK。

```sh
# 从仓库根目录：
corepack pnpm contract:generate
corepack pnpm contract:check
corepack pnpm --filter @caau/api-client build
corepack pnpm --filter @caau/api-client test
```

生成命令先编译当前 Nest 与数据库包，不监听网络、不连接 DB；按稳定顺序写入产物。check 在内存中重生成并逐字节比较；CI 会因契约漂移失败。已实际重复生成两次，三个文件全部字节一致。

CAAU-004 已扩展元数据生成器：GET/POST/PATCH/DELETE、路径参数、JSON 请求体、对象/数组/可空标量响应及 bearer 标记。`client.request(operationId, { token, path, body })` 使用生成参数和响应类型；fetch/Taro 适配器支持 header/data 并有单测、真实 PostgreSQL/API 联调。未支持文件流、multipart、任意 OpenAPI 组合类型；新增形状须先扩展生成与测试，不宣称完整通用 SDK。运行时响应校验覆盖类型、必填与枚举，不是完整 JSON Schema format 校验器。

## 消费方式

Web 从本包及 `@caau/api-client/fetch` 导入；小程序从本包及 `@caau/api-client/taro` 导入并注入 `Taro.request`。Taro 适配器只依赖结构化请求能力，不引用 Node 或 fetch 适配器。请求路径、方法和成功/错误响应校验均消费生成元数据，两端不另手写健康接口类型。

已验证生成/类型/适配器单测、两端共享真实 HTTP 接口与 Web 浏览器；小程序 HTTP 联调使用 Node 传输替身，不代表微信开发者工具/真机验收。数据库成功与停启恢复已由独立 db:test 在本机验证，非微信平台验收。详情见 [数据库与契约文档](../../docs/runbooks/database-contract.md)。
