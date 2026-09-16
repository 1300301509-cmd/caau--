# @caau/miniapp

Taro 4.2.1 + React 18 微信小程序工程。无会话先选择本地测试身份，再进入板块式主页；主页使用可替换本地赛事横幅，当前只展示“材料审批”板块及“材料提交”“审核进度”两个子模块，不配置底部tabBar。赛事/任务选择保留在材料提交流程，进度页只读当前承办范围结果，不授予总部审批权限。新版单份任务继续支持自由新增、名称/类别/说明、私有附件上传/确认/绑定、草稿/冲突核对、独立提交/同键重试、退回修改重交、五态/实际操作人时间、不可变版本/动作快照和受控下载；旧任务继续进入原整包详情。通过 @caau/api-client 的生成契约、MaterialEditor 客户端命令状态和 Taro.request 适配器访问真实 API；不跨应用引用源码。就绪请求与存活请求独立，无数据库配置时就绪应显示503；不引入Prisma、Nest或Node/fetch传输运行库。

```sh
# 在仓库根目录；先按任务手册迁移，再在另一终端运行：
# CAAU_IDENTITY_MODE=local corepack pnpm db:api
corepack pnpm dev:miniapp
# 单次生产构建
corepack pnpm --filter @caau/miniapp... build
```

构建输出到本目录 `dist/`。微信开发者工具应导入 **apps/miniapp**，项目配置的 miniprogramRoot 为 `dist/`。`touristappid` 仅是明确标记的游客占位值，不是用户微信 AppID；不保证游客模式具备完整运行/预览权限。实际测试身份以用户的平台资源为准，请在工具中选择有权限的测试 AppID；工具生成的 project.private.config.json 已忽略，若工具修改了受追踪的项目配置，提交前必须审查并保留仓库占位值，不混入本机平台配置。

默认 API 是 `http://127.0.0.1:3000`，仅供电脑本地模拟器。要覆盖地址，在启动/构建前显式设置：

```sh
TARO_APP_API_BASE_URL=https://YOUR_TEST_API_HOST corepack pnpm dev:miniapp
```

上面域名是占位值，不可直接联网使用。`TARO_APP_API_BASE_URL` 为公开编译变量，修改后需重启/重新编译；本目录 `.env.example` 只展示变量结构，不要求依赖 Taro 自动加载它。

仓库保持 `urlCheck: true`。本地 HTTP 调试需要使用者在开发者工具里**仅对本地调试**关闭合法域名检查；此设置不证明生产 HTTPS/域名配置通过。手机上的 127.0.0.1 指向手机自身，不能请求电脑 API；真机需可达测试服务、合法 HTTPS 域名、平台权限及相应配置，不能直接使用本机默认地址。

首次进入的身份页及主页底部次要“切换测试身份”入口，在local模式下从后端读取可选承办身份，并由后端签发真实测试会话；不默认选择承办方。页面另保留收起的手动短期token入口，验证承办身份后清空输入且只在内存保存。不通过微信聊天发送会话文件、不写Storage、不截令牌、不冒充正式微信登录。材料使用chooseMessageFile/readFile，幂等键使用getRandomValues；这些平台API的权限、文件来源、最大文件耗时和离开提醒仍须分别记录实际微信验证。

CAAU-020已在官方微信开发者工具游客模拟器实际核验身份优先顺序、主页横幅、唯一材料审批板块、两个子模块、A身份材料提交列表及只读审核进度入口，未执行材料写操作。当前导航下尚未重跑新增、附件、提交、退回和V2完整流程；仍缺组织AppID、HTTPS合法域名、测试微信及真机资源，不能把构建或游客模拟器当作真机验收。详见[Taro操作与平台验收](../../docs/runbooks/individual-material-miniapp.md)。
