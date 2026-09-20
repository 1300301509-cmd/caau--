# 赛事执行物料接口

所有接口位于 `/api/v1`，使用现有 Bearer 或 Web Cookie 会话。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/events/:eventId/supplies` | 查看赛事物料清单 |
| POST | `/events/:eventId/supplies` | 承办方新增物料 |
| PUT | `/events/:eventId/supplies/:id` | 承办方更新信息和进度 |
| GET | `/events/:eventId/supplies/:id/history` | 查看不可变变化历史 |
| POST | `/events/:eventId/supplies/:id/photos` | 建立照片上传意图 |
| PUT | `/event-supply-photos/:id/content` | 上传二进制照片 |
| POST | `/event-supply-photos/:id/confirm` | 校验并确认照片 |
| POST | `/event-supply-photos/:id/remove` | 从当前清单移除照片 |
| GET | `/event-supply-photos/:id/content` | 受权查看照片 |

新增物料的 `id` 和照片的 `id` 由客户端生成 UUID。所有更新以及照片确认/移除都携带当前 `expectedRevision`。照片确认或移除后物料修订号也会递增，调用方应重新读取清单。

状态值：`TO_PREPARE`、`PREPARING`、`READY`、`SHORTAGE`。

总部 Web 入口为 `http://127.0.0.1:5175/competition?module=supplies`。选择赛事后可查看状态概览、搜索和筛选清单，并在详情抽屉预览/下载照片及查看更新记录。总部页面为只读，不提供写操作。
