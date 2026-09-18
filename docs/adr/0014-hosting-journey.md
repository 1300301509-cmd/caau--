# ADR-0014：办赛全流程与线下合同确认

状态：已实施并通过本地验证，CAAU-034。

- `EventHostingApplication.formVersion`默认为1，旧客户端与历史行为不变；小程序新申请显式创建v2。版本不可变，服务端以已存版本校验提交及审核，不接受保存表单时降级校验。v2联系方式、比赛时间进入原不可变提交快照；不再强制前置材料附件。
- `HostingPermit`以已批准材料的applicationId为唯一主键，只追加确认人、服务端时间及幂等键；数据库限制目标必须是APPROVED材料、操作人存在且有效，并禁止UPDATE/DELETE/TRUNCATE。不改写原审核结论、赛事来源或旧生命周期枚举。
- `GET /hosting-journeys`鉴权后聚合申请/材料/确认，返回四阶段与办理历史；`POST /event-materials/:id/confirm-permit`复用授权事务、行锁、有效审核grant、自审拒绝及审计，核对材料版本后写唯一确认记录。
- 总部业务员首版使用既有审核授权；小程序根据API canConfirm显示按钮，服务端仍逐请求判断。进度不存独立可变副本，不创建第二场赛事。授权撤销立即阻止读取或推进。
- 新小程序页面与Web只能消费生成API客户端，不跨应用引用源码。前台3秒顺序刷新，隐藏/卸载停止，失败明确显示过期状态。

规格见[办赛流程](../product/hosting-journey.md)，实际验证见[任务记录](../planning/roadmap.md)。
