# 人员管理（CAAU-050）

入口：`http://127.0.0.1:5175/competition?module=staff`。选定赛事后新增工作人员；姓名与岗位必填，岗位可多选或自填，联系电话、单位、职责说明和备注选填。可按岗位、状态和关键词筛选，编辑、停用、恢复及查看历史。停用不删除记录，人员登记不创建账号。

## 权限与归属

用户确认总部和承办方均可维护，承办方仅限自己的赛事。复用 eventOperations：总部超级管理员、具有有效赛事授权的赛事管理员，以及同时具有有效承办关系和有效办理授权的承办人员可操作。普通系统管理员、审核员或只有基本信息查看权的人员不自动得到写入权。球队参赛人员名单仍保持原有承办方写入规则。

名单属于赛事，不建立全局跨赛事人员库；不按姓名或电话自动合并。新增使用固定请求 UUID，超时后保留原 ID/原载荷重试；不同载荷重复使用 ID 返回409。修改/停用使用 expectedRevision，冲突后需刷新核对。历史只追加，保留实际操作人和服务器时间。

## 可供赛程编排复用的真实接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/v1/events/:eventId/staff` | 当前赛事人员，包含在岗和已停用 |
| `POST /api/v1/events/:eventId/staff` | 新增，body 为 id 和 profile |
| `PUT /api/v1/events/:eventId/staff/:id` | 修改、停用或恢复，body 为 profile、active、expectedRevision |
| `GET /api/v1/events/:eventId/staff/:id/history` | 人员变更历史 |
| `GET /api/v1/events/:eventId/situation` | 当前赛程各场次人员快照和 staffRevision |
| `PUT /api/v1/events/:eventId/matches/:matchId/staff` | 替换单场工作人员，CAS与赛程版本检查 |

场次写入沿用 expectedScheduleRevision、expectedRevision、staff。staff 每项保留 id/name/role/organization/contactPhone/notes；关联名单时额外传 sourceStaffId 和 sourceStaffRevision。后端核验来源同赛事、在岗和版本一致，然后从名单填入姓名、电话、单位，不信任客户端这三个值。role/notes为该场工作岗位及备注。保存的是快照，后续改名、停用不覆盖旧场次；旧的不关联名单记录继续读取和处理，不按姓名自动迁移。

单场接口本次允许上述总部管理人员写入，仍只接受当前已发布赛程。未发布赛程返回409。重新编排产生新版本后旧指派继续保留，不静默复制到新场次。赛程页面选择器、草稿指派、自动排班、报酬考勤和工作人员账号不在本批范围。

## 验证

执行 check、build、test 和隔离 db:test；实际结果见 [roadmap](../planning/roadmap.md)。不把构建或本地浏览器验收视为生产、微信或真机通过。
