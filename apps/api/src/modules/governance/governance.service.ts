import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  uuid,
  text,
} from '../authorization/authorization.service.js';
import {
  deny,
  isHeadquartersSuperAdmin,
  scheduleReadScope,
  eventOperationsScope,
  scheduleRead,
  scheduleDraftAdjust,
  schedulePublish,
  eventOperations,
  taskPolicy,
} from '../authorization/policy.js';
import { redact, requestId, requestScope } from './request-context.js';
import { operationalRecords } from './operational-records.js';
import { storageStatus } from './storage-status.js';
import type {
  GovernancePageDto,
  GovernanceRowDto,
  GovernanceQueryDto,
} from './governance.dto.js';

const fields = (values: Record<string, unknown>) =>
  Object.entries(values).map(([label, value]) => ({
    label,
    value:
      value === null || value === undefined ? '未采集' : redact(String(value)),
  }));
const row = (
  id: string,
  title: string,
  status: string,
  at: Date | null,
  values: Record<string, unknown>,
  actorId: string | null = null,
  req: string | null = null,
  resourceId: string | null = null,
): GovernanceRowDto => ({
  id,
  title: redact(title),
  status,
  at: at?.toISOString() ?? '',
  fields: fields(values),
  actorId,
  requestId: req,
  resourceId,
});
export function parseWindow(query: GovernanceQueryDto) {
  bodyObject(query, [
    'actorId',
    'eventId',
    'requestId',
    'resourceId',
    'phase',
    'mode',
    'action',
    'outcome',
    'organizationId',
    'model',
    'from',
    'to',
    'cursor',
    'limit',
  ]);
  const limit = Number(query.limit ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BadRequestException('Invalid limit');
  const from = query.from
    ? new Date(query.from)
    : new Date(Date.now() - 90 * 86400000);
  const to = query.to ? new Date(query.to) : new Date();
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    from > to ||
    to.getTime() - from.getTime() > 90 * 86400000 + 1000 ||
    from.getTime() < Date.now() - 90 * 86400000 - 60000
  )
    throw new BadRequestException('请选择最近90天内的时间范围');
  for (const key of [
    'actorId',
    'eventId',
    'organizationId',
    'requestId',
    'resourceId',
  ] as const)
    if (query[key]) uuid(query[key]);
  for (const key of ['model', 'action', 'outcome', 'phase', 'mode'] as const)
    if (query[key]) text(query[key], 120);
  const cursor = query.cursor ? uuid(query.cursor) : undefined;
  return { limit, from, to, cursor };
}
export const micros = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value))
    throw new BadRequestException('请输入非负整数微货币单位');
  return BigInt(value);
};
const amount = (value: bigint | null) =>
  value === null
    ? '未配置或用量未知'
    : `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 1000000n}.${((value < 0n ? -value : value) % 1000000n).toString().padStart(6, '0')}`;

@Injectable()
export class GovernanceService {
  constructor(
    private readonly auth: AuthorizationService,
    @Inject('GOVERNANCE_DATABASE_URL') private readonly databaseUrl: string,
  ) {}
  run<T>(
    token: string,
    action: string,
    resource: string | undefined,
    work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>,
  ) {
    return this.auth.run(
      token,
      action,
      resource,
      undefined,
      async (tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        return work(tx, actor.id);
      },
      { retries: 3, retryUnique: true, timeout: 15000 },
    );
  }
  private async evidence(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    resourceId: string,
    reason: string,
    context: Prisma.InputJsonObject = {},
  ) {
    await tx.auditRecord.create({
      data: {
        id: randomUUID(),
        actorId,
        action,
        resourceId,
        requestId: requestId(),
        traceId: requestScope.getStore()?.traceId,
        outcome: 'ALLOWED',
        result: 'SUCCESS',
        context: { ...context, reason: redact(text(reason, 300)) },
      },
    });
  }
  async list(
    token: string,
    kind: string,
    query: GovernanceQueryDto = {},
  ): Promise<GovernancePageDto> {
    const q = parseWindow(query);
    return this.run(token, `governance.${kind}.read`, undefined, async (tx) => {
      const page = {
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      };
      const time = { gte: q.from, lte: q.to };
      let items: GovernanceRowDto[];
      if (kind === 'files' || kind === 'business-records') {
        const records = await operationalRecords(tx, kind, query, q);
        items = records.map((r) =>
          row(
            r.id,
            r.kind,
            r.state,
            r.at,
            {
              赛事: r.event,
              资源: r.resource,
              当前修订: r.revision,
              ...(kind === 'files'
                ? {
                    登记预期字节: r.bytes?.toString(),
                    确认时间: r.checked?.toISOString(),
                    说明: '上传登记与确认元数据；无附件下载授权，不等于磁盘实占',
                  }
                : {
                    提交或发布时间: r.checked?.toISOString(),
                    待审小时: [
                      'PENDING_REVIEW',
                      'IN_REVIEW',
                      'SUBMITTED',
                    ].includes(r.state)
                      ? r.checked
                        ? Math.max(
                            0,
                            Math.floor(
                              (Date.now() - r.checked.getTime()) / 3600000,
                            ),
                          )
                        : '提交时间未采集'
                      : '不适用',
                    说明: '当前真实状态；无确定审核期限时仅显示等待时长，不判为逾期',
                  }),
            },
            r.actor,
            null,
            r.resource,
          ),
        );
      } else if (kind === 'audit' || kind === 'agent-runs') {
        const records = await tx.auditRecord.findMany({
          ...page,
          where: {
            occurredAt: time,
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.eventId ? { eventId: query.eventId } : {}),
            ...(query.requestId ? { requestId: query.requestId } : {}),
            ...(query.resourceId ? { resourceId: query.resourceId } : {}),
            ...(kind === 'agent-runs'
              ? {
                  AND: [
                    {
                      OR: [
                        { action: { startsWith: 'agent.' } },
                        { action: { startsWith: 'ai.usage.' } },
                      ],
                    },
                    ...(query.action
                      ? [{ action: { startsWith: query.action } }]
                      : []),
                  ],
                }
              : query.action
                ? { action: { startsWith: query.action } }
                : {}),
            ...(query.outcome ? { result: query.outcome } : {}),
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        items = records.map((r) =>
          row(
            r.id,
            r.action,
            r.result ??
              (r.outcome === 'ALLOWED' ? 'ALLOWED_LEGACY' : 'UNCLASSIFIED'),
            r.occurredAt,
            {
              操作人: r.actorId,
              资源: r.resourceId,
              赛事: r.eventId,
              命令: r.commandId,
              请求: r.requestId,
              调用链: r.traceId,
              记录: JSON.stringify(r.context),
            },
            r.actorId,
            r.requestId,
            r.resourceId,
          ),
        );
      } else if (kind === 'accounts') {
        const records = await tx.internalUser.findMany({
          ...page,
          where: query.actorId ? { id: query.actorId } : {},
          select: {
            id: true,
            displayName: true,
            loginName: true,
            active: true,
            memberships: { include: { organization: true } },
          },
          orderBy: { id: 'asc' },
        });
        items = records.map((r) =>
          row(
            r.id,
            r.displayName,
            r.active ? 'ACTIVE' : 'DISABLED',
            null,
            {
              登录名: r.loginName,
              组织角色: r.memberships
                .map(
                  (m) =>
                    `${m.organization.name} / ${m.role} / ${m.active ? '有效' : '停用'}`,
                )
                .join('；'),
            },
            r.id,
          ),
        );
      } else if (kind === 'sessions') {
        const records = await tx.session.findMany({
          ...page,
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
            user: { active: true },
            ...(query.actorId ? { userId: query.actorId } : {}),
          },
          select: {
            id: true,
            userId: true,
            clientType: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        items = records.map((r) =>
          row(
            r.id,
            r.clientType,
            'VALID',
            r.createdAt,
            {
              账号: r.userId,
              到期时间: r.expiresAt.toISOString(),
              说明: '有效会话不代表实时在线',
            },
            r.userId,
          ),
        );
      } else if (kind === 'dialogues') {
        const records = await tx.agentSession.findMany({
          ...page,
          where: query.actorId ? { ownerId: query.actorId } : {},
          select: {
            id: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
            currentEventId: true,
            _count: { select: { turns: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        items = records.map((r) =>
          row(
            r.id,
            'AI 会话',
            'REVIEW_REQUIRED',
            r.createdAt,
            {
              消息数: r._count.turns,
              更新时间: r.updatedAt.toISOString(),
              赛事: r.currentEventId,
              说明: '查看正文须填写原因；旧审计可能已过期',
            },
            r.ownerId,
            null,
            r.id,
          ),
        );
      } else if (kind === 'usage-summary') {
        const records = await tx.$queryRaw<
          Array<{
            id: string;
            day: string;
            model: string;
            mode: string;
            phase: string;
            actorId: string;
            organizationId: string | null;
            calls: bigint;
            input: bigint | null;
            output: bigint | null;
            unknown: bigint;
            failures: bigint;
          }>
        >`
          WITH grouped AS (
            SELECT to_char("createdAt" AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,
              model,mode,phase,"actorId","organizationId",count(*) AS calls,
              sum("inputTokens") AS input,sum("outputTokens") AS output,
              count(*) FILTER(WHERE "usageStatus" IN ('UNKNOWN','PENDING')) AS unknown,
              count(*) FILTER(WHERE status='FAILED') AS failures
            FROM "AiUsageCall" WHERE "createdAt">=${q.from} AND "createdAt"<=${q.to}
              AND (${query.actorId ?? null}::uuid IS NULL OR "actorId"=${query.actorId ?? null}::uuid)
              AND (${query.organizationId ?? null}::uuid IS NULL OR "organizationId"=${query.organizationId ?? null}::uuid)
              AND (${query.model ?? null}::text IS NULL OR model=${query.model ?? null})
            GROUP BY day,model,mode,phase,"actorId","organizationId"
          ), identified AS (SELECT *,overlay(overlay(md5(concat_ws('|',day,model,mode,phase,"actorId","organizationId")) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid AS id FROM grouped)
          SELECT * FROM identified WHERE (${q.cursor ?? null}::uuid IS NULL OR id>${q.cursor ?? null}::uuid) ORDER BY id LIMIT ${q.limit + 1}
        `;
        items = records.map((r) =>
          row(
            r.id,
            `${r.day} · ${r.model} · ${r.phase}`,
            r.mode,
            null,
            {
              北京日期: r.day,
              账号: r.actorId,
              费用机构: r.organizationId,
              调用数: r.calls,
              已知输入: r.input,
              已知输出: r.output,
              未知用量调用: r.unknown,
              失败调用: r.failures,
            },
            r.actorId,
          ),
        );
      } else if (kind === 'usage') {
        const records = await tx.aiUsageCall.findMany({
          ...page,
          where: {
            createdAt: time,
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.organizationId
              ? { organizationId: query.organizationId }
              : {}),
            ...(query.model ? { model: query.model } : {}),
            ...(query.requestId ? { requestId: query.requestId } : {}),
            ...(query.phase ? { phase: query.phase } : {}),
            ...(query.mode ? { mode: query.mode } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        items = records.map((r) =>
          row(
            r.id,
            `${r.model} · ${r.phase}`,
            r.status,
            r.createdAt,
            {
              模式: r.mode,
              供应商: r.provider,
              用量状态: r.usageStatus,
              输入Token: r.inputTokens,
              输出Token: r.outputTokens,
              缓存Token: r.cachedTokens,
              预占Token: r.reservedTokens,
              费用归属机构: r.organizationId,
              耗时毫秒: r.elapsedMs,
              估算费用: `${amount(r.estimatedMicros)} ${r.currency ?? ''}`,
              价格版本: r.priceId,
              错误分类: r.errorCategory,
              调用链: r.traceId,
              会话: r.sessionId,
              任务: r.taskId,
              请求: r.requestId,
            },
            r.actorId,
            r.requestId,
            r.sessionId,
          ),
        );
      } else if (kind === 'quotas') {
        const records = await tx.aiQuotaPolicy.findMany({
          ...page,
          where: query.actorId
            ? { scope: 'ACCOUNT', subjectId: query.actorId }
            : {},
          orderBy: { id: 'asc' },
        });
        items = records.map((r) =>
          row(
            r.id,
            `${r.scope} · ${r.subjectId}`,
            r.paused ? 'PAUSED' : r.enabled ? 'ENABLED' : 'UNLIMITED',
            r.updatedAt,
            {
              范围: r.scope,
              对象: r.subjectId,
              启用: r.enabled,
              暂停: r.paused,
              日额度: r.dailyTokens ?? '无限制',
              月额度: r.monthlyTokens ?? '无限制',
              revision: r.revision,
            },
          ),
        );
      } else if (kind === 'prices') {
        const records = await tx.aiModelPrice.findMany({
          ...page,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        items = records.map((r) =>
          row(
            r.id,
            `${r.provider} / ${r.model}`,
            'PRICE_VERSION',
            r.createdAt,
            {
              币种: r.currency,
              每百万输入微货币: r.inputMicrosPerMillion,
              每百万输出微货币: r.outputMicrosPerMillion,
              每百万缓存微货币: r.cachedMicrosPerMillion,
              生效时间: r.effectiveAt.toISOString(),
            },
          ),
        );
      } else if (kind === 'bills') {
        const records = await tx.aiSupplierBill.findMany({
          ...page,
          where: { createdAt: time },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        items = [];
        for (const r of records) {
          const calls = await tx.aiUsageCall.aggregate({
            where: {
              provider: r.provider,
              currency: r.currency,
              createdAt: { gte: r.from, lt: r.to },
            },
            _sum: { estimatedMicros: true },
            _count: { estimatedMicros: true, _all: true },
          });
          items.push(
            row(r.id, r.provider, 'MANUAL_BILL', r.createdAt, {
              周期: `${r.from.toISOString()} — ${r.to.toISOString()}`,
              币种: r.currency,
              供应商账单: amount(r.amountMicros),
              已知估算合计: amount(calls._sum.estimatedMicros),
              可估算调用数: calls._count.estimatedMicros,
              说明: r.note,
              差额:
                calls._sum.estimatedMicros === null
                  ? '未知'
                  : amount(r.amountMicros - calls._sum.estimatedMicros),
              注意: '缺少归价或历史用量时不可精确对账',
            }),
          );
        }
      } else if (kind === 'alerts') {
        const records = await tx.governanceAlert.findMany({
          ...page,
          where: { lastSeenAt: time },
          orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
        });
        items = records.map((r) =>
          row(r.id, r.title, r.state, r.lastSeenAt, {
            级别: r.severity,
            来源: r.source,
            确认人: r.acknowledgedBy,
            负责人: r.ownerId,
            处置备注: r.note,
            恢复时间: r.recoveredAt?.toISOString(),
            通知状态: r.deliveryState,
            最近送达: r.notifiedAt?.toISOString(),
            通知尝试: r.deliveryAttempts,
          }),
        );
      } else throw new BadRequestException('Unknown collection');
      const more = items.length > q.limit;
      items = items.slice(0, q.limit);
      return {
        items,
        nextCursor: more ? items.at(-1)!.id : null,
        asOf: new Date().toISOString(),
      };
    });
  }
  overview(token: string, query: GovernanceQueryDto = {}) {
    const q = parseWindow(query);
    return this.run(
      token,
      'governance.overview.read',
      undefined,
      async (tx) => {
        const usageWhere = {
          createdAt: { gte: q.from, lte: q.to },
          ...(query.actorId ? { actorId: query.actorId } : {}),
          ...(query.organizationId
            ? { organizationId: query.organizationId }
            : {}),
          ...(query.model ? { model: query.model } : {}),
          mode: { not: 'SIMULATED' },
        };
        const [
          accounts,
          organizations,
          sessions,
          events,
          applications,
          schedules,
          calls,
          unknown,
          audits,
          alerts,
          files,
          hostingFiles,
          individualFiles,
          templates,
          photos,
          oldestApplication,
          operationGroups,
        ] = await Promise.all([
          tx.internalUser.count(),
          tx.organization.count(),
          tx.session.count({
            where: {
              revokedAt: null,
              expiresAt: { gt: new Date() },
              user: { active: true },
            },
          }),
          tx.event.count(),
          tx.eventHostingApplication.groupBy({ by: ['status'], _count: true }),
          tx.eventSchedule.groupBy({ by: ['status'], _count: true }),
          tx.aiUsageCall.aggregate({
            where: usageWhere,
            _sum: { inputTokens: true, outputTokens: true },
            _count: true,
          }),
          tx.aiUsageCall.count({
            where: {
              ...usageWhere,
              usageStatus: { in: ['UNKNOWN', 'PENDING'] },
            },
          }),
          tx.auditRecord.count({
            where: {
              occurredAt: { gte: q.from, lte: q.to },
              ...(query.actorId ? { actorId: query.actorId } : {}),
            },
          }),
          tx.governanceAlert.count({ where: { state: 'FIRING' } }),
          tx.fileUpload.aggregate({
            _count: true,
            _sum: { expectedBytes: true },
          }),
          tx.hostingApplicationUpload.aggregate({
            _count: true,
            _sum: { expectedBytes: true },
          }),
          tx.individualUpload.aggregate({
            _count: true,
            _sum: { expectedBytes: true },
          }),
          tx.templateUpload.aggregate({
            _count: true,
            _sum: { expectedBytes: true },
          }),
          tx.eventSupplyPhoto.aggregate({
            _count: true,
            _sum: { expectedBytes: true },
          }),
          tx.hostingApplicationSubmission.findFirst({
            where: {
              application: { status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] } },
            },
            orderBy: { submittedAt: 'asc' },
            select: { submittedAt: true },
          }),
          tx.auditRecord.groupBy({
            by: ['action', 'result'],
            where: { occurredAt: { gte: q.from, lte: q.to } },
            _count: true,
            orderBy: { _count: { action: 'desc' } },
            take: 40,
          }),
        ]);
        const storage = storageStatus(this.databaseUrl);
        return {
          asOf: new Date().toISOString(),
          metrics: fields({
            账号总数: accounts,
            机构总数: organizations,
            有效登录会话: sessions,
            赛事总数: events,
            时间范围内审计记录: audits,
            真实模型调用: calls._count,
            已知输入Token: calls._sum.inputTokens ?? '未采集',
            已知输出Token: calls._sum.outputTokens ?? '未采集',
            待核对调用: unknown,
            活跃告警: alerts,
            申请状态: applications
              .map((a) => `${a.status}: ${a._count}`)
              .join(' / '),
            赛程状态: schedules
              .map((a) => `${a.status}: ${a._count}`)
              .join(' / '),
            五类上传记录数:
              files._count +
              hostingFiles._count +
              individualFiles._count +
              templates._count +
              photos._count,
            五类登记预期字节:
              (files._sum.expectedBytes ?? 0) +
              (hostingFiles._sum.expectedBytes ?? 0) +
              (individualFiles._sum.expectedBytes ?? 0) +
              (templates._sum.expectedBytes ?? 0) +
              (photos._sum.expectedBytes ?? 0),
            存储口径:
              '材料、办赛、单份、模板与物料图片登记预期字节；含待确认与历史记录，不是磁盘实占容量',
            附件实体扫描: storage.status,
            附件扫描时间: storage.at ?? '未接入',
            附件实际字节: storage.bytes ?? '未接入',
            附件未登记对象: storage.unregistered ?? '未接入',
            已确认附件缺失: storage.missingConfirmed ?? '未接入',
            附件大小不符: storage.sizeMismatch ?? '未接入',
            扫描说明:
              '独立维护任务只读扫描；采样期间可能有在途上传，异常仅供复核，不自动删除。STALE表示超过24小时未采样。',
            最早待审申请等待小时: oldestApplication
              ? Math.floor(
                  (Date.now() - oldestApplication.submittedAt.getTime()) /
                    3600000,
                )
              : '暂无待审申请',
            操作分布: operationGroups
              .map(
                (g) => `${g.action} / ${g.result ?? '历史未分类'}: ${g._count}`,
              )
              .join('；'),
            技术看板: process.env.CAAU_GRAFANA_PUBLIC_PATH
              ? '已配置受控入口，健康以监控工作台为准'
              : '未接入',
            微信外部依赖: '未接入独立探测',
            更新说明:
              '数据库实时聚合；用量/审计最近90天；模拟调用不计真实Token',
          }),
        };
      },
    );
  }
  account(token: string, id: string) {
    return this.run(token, 'governance.account.read', uuid(id), async (tx) => {
      const target = await tx.internalUser.findUnique({
        where: { id },
        include: {
          memberships: {
            include: {
              organization: true,
              grants: true,
              hostingApplicationHandlerGrant: true,
              hostingApplicationReviewGrant: true,
            },
          },
        },
      });
      if (!target) deny();
      const [readable, operable, assignment, buckets] = await Promise.all([
        target.active
          ? tx.event.findMany({
              where: scheduleReadScope(target),
              take: 100,
              select: { id: true, name: true },
            })
          : [],
        target.active
          ? tx.event.findMany({
              where: eventOperationsScope(target),
              take: 100,
              select: { id: true, name: true },
            })
          : [],
        tx.aiCostAssignment.findUnique({ where: { userId: id } }),
        tx.aiQuotaBucket.findMany({
          where: { scope: 'ACCOUNT', subjectId: id },
          orderBy: { period: 'desc' },
          take: 4,
        }),
      ]);
      return {
        asOf: new Date().toISOString(),
        metrics: fields({
          账号: target.displayName,
          状态: target.active ? '启用' : '停用',
          费用归属机构: assignment?.organizationId ?? '仅归属账号',
          角色与来源: target.memberships
            .map(
              (m) =>
                `${m.organization.name} / ${m.role} / ${m.active ? '有效' : '停用'} / 赛事授权${
                  m.grants
                    .filter((g) => g.active)
                    .map((g) => g.eventId)
                    .join('、') || '无'
                }`,
            )
            .join('\n'),
          赛程可读范围:
            readable.map((e) => `${e.name} (${e.id})`).join('\n') ||
            '无；实际策略拒绝',
          赛事操作范围:
            operable.map((e) => `${e.name} (${e.id})`).join('\n') ||
            '无；实际策略拒绝',
          规则说明:
            '使用实际 scheduleReadScope/eventOperationsScope；最多展示100项，其它材料/办赛授权见账号管理；不代表全部功能授权',
          最近额度周期:
            buckets
              .map((b) => `${b.period} 已知 ${b.used}，预占 ${b.reserved}`)
              .join('\n') || '未采集',
        }),
      };
    });
  }
  permission(token: string, id: string, query: GovernanceQueryDto) {
    const action = text(query.action, 80),
      resourceId = uuid(query.resourceId);
    return this.run(
      token,
      'governance.permission.explain',
      uuid(id),
      async (tx) => {
        const target = await tx.internalUser.findUnique({
          where: { id },
          include: {
            memberships: {
              include: {
                organization: true,
                grants: true,
                hostingApplicationHandlerGrant: true,
                hostingApplicationReviewGrant: true,
              },
            },
          },
        });
        if (!target) deny();
        const checks: Record<string, () => Promise<unknown>> = {
          'schedule.read': () => scheduleRead(tx, target, resourceId),
          'schedule.draft.adjust': () =>
            scheduleDraftAdjust(tx, target, resourceId),
          'schedule.publish': () => schedulePublish(tx, target, resourceId),
          'event.operations': () => eventOperations(tx, target, resourceId),
          ...Object.fromEntries(
            ['task.read', 'file.download', 'content.write', 'review'].map(
              (a) => [a, () => taskPolicy(tx, target, resourceId, a)],
            ),
          ),
        };
        if (!checks[action])
          throw new BadRequestException('Unsupported policy explanation');
        let allowed = false;
        if (target.active) {
          try {
            await checks[action]!();
            allowed = true;
          } catch (e) {
            if (!(e instanceof HttpException) || e.getStatus() !== 403) throw e;
          }
        }
        return {
          asOf: new Date().toISOString(),
          metrics: fields({
            动作: action,
            资源: resourceId,
            判定: allowed ? '允许' : '拒绝',
            原因: !target.active
              ? '账号已停用'
              : allowed
                ? '实际业务权限判定通过；执行仍检查当时权限和资源状态'
                : '实际业务策略拒绝：请核对有效组织角色、赛事范围、经办/审核分配与互斥身份',
            来源: target.memberships
              .map(
                (m) =>
                  `${m.organization.name} / ${m.role} / ${m.active ? '有效' : '停用'}`,
              )
              .join('；'),
          }),
        };
      },
    );
  }
  revoke(token: string, userId: string, input: unknown) {
    const body = bodyObject(input, ['reason', 'sessionId']);
    const reason = text(body.reason, 300);
    const sessionId = body.sessionId ? uuid(body.sessionId) : undefined;
    return this.run(
      token,
      'governance.sessions.revoke',
      uuid(userId),
      async (tx, actorId) => {
        const target = await tx.internalUser.findUnique({
          where: { id: userId },
        });
        if (!target) deny();
        const isSuper = await tx.organizationMember.count({
          where: {
            userId,
            active: true,
            role: 'HEADQUARTERS_SUPER_ADMIN',
            user: { active: true },
          },
        });
        if (isSuper) {
          const otherAccount = await tx.organizationMember.count({
            where: {
              userId: { not: userId },
              active: true,
              role: 'HEADQUARTERS_SUPER_ADMIN',
              user: { active: true },
            },
          });
          const remainingSession = sessionId
            ? await tx.session.count({
                where: {
                  userId,
                  id: { not: sessionId },
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
              })
            : 0;
          if (!otherAccount && !remainingSession)
            throw new ConflictException(
              '请先建立另一个可用超级管理员会话，再撤销最后一个会话',
            );
        }
        if (
          sessionId &&
          !(await tx.session.findFirst({ where: { id: sessionId, userId } }))
        )
          deny();
        await tx.session.updateMany({
          where: {
            userId,
            revokedAt: null,
            ...(sessionId ? { id: sessionId } : {}),
          },
          data: { revokedAt: new Date() },
        });
        await this.evidence(
          tx,
          actorId,
          'governance.sessions.revoked',
          userId,
          reason,
          { sessionId: sessionId ?? null },
        );
        return { id: userId, message: '会话已撤销；后续请求须重新登录' };
      },
    );
  }
  review(token: string, sessionId: string, input: unknown) {
    const body = bodyObject(input, ['reason', 'cursor']);
    const reason = text(body.reason, 300);
    const after = body.cursor ? Number(body.cursor) : 0;
    if (!Number.isSafeInteger(after) || after < 0)
      throw new BadRequestException('Invalid cursor');
    return this.run(
      token,
      'governance.dialogue.review',
      uuid(sessionId),
      async (tx, actorId) => {
        const session = await tx.agentSession.findUnique({
          where: { id: sessionId },
        });
        if (!session) deny();
        const turns = await tx.agentTurn.findMany({
          where: { sessionId, sequence: { gt: after } },
          orderBy: { sequence: 'asc' },
          take: 101,
        });
        await this.evidence(
          tx,
          actorId,
          'governance.dialogue.content.read',
          sessionId,
          reason,
          {
            ownerId: session.ownerId,
            afterSequence: after,
            count: Math.min(turns.length, 100),
          },
        );
        const items = turns
          .slice(0, 100)
          .map((t) =>
            row(
              t.id,
              t.role === 'USER' ? '用户' : '智能助手',
              t.role,
              t.createdAt,
              { 序号: t.sequence, 正文: redact(t.content) },
              session.ownerId,
              null,
              sessionId,
            ),
          );
        return {
          items,
          asOf: new Date().toISOString(),
          nextCursor: turns.length > 100 ? String(turns[99]!.sequence) : null,
        };
      },
    );
  }
  async exportAudit(token: string, query: GovernanceQueryDto) {
    const collected: GovernanceRowDto[] = [];
    let cursor: string | undefined;
    do {
      const p = await this.list(token, 'audit', {
        ...query,
        limit: '100',
        cursor,
      });
      collected.push(...p.items);
      cursor = p.nextCursor ?? undefined;
    } while (cursor && collected.length < 10000);
    return this.run(
      token,
      'governance.audit.export',
      undefined,
      async (tx, actorId) => {
        await this.evidence(
          tx,
          actorId,
          'governance.audit.exported',
          actorId,
          '导出脱敏审计CSV',
          {
            count: collected.length,
            filters: Object.fromEntries(
              Object.entries(query).filter(([, v]) => v !== undefined),
            ),
          },
        );
        const cell = (v: string) =>
          `"${(/^[=+@\-\t\r\n]/.test(v) ? "'" : '') + v.replaceAll('"', '""')}"`;
        return {
          csv:
            '\uFEFF' +
            [
              ['记录ID', '时间', '动作', '结果', '操作人', '请求ID', '资源ID'],
              ...collected.map((r) => [
                r.id,
                r.at,
                r.title,
                r.status,
                r.actorId ?? '',
                r.requestId ?? '',
                r.resourceId ?? '',
              ]),
            ]
              .map((r) => r.map(cell).join(','))
              .join('\r\n'),
          count: collected.length,
        };
      },
    );
  }
  quota(token: string, input: unknown) {
    const b = bodyObject(input, [
      'scope',
      'subjectId',
      'enabled',
      'paused',
      'dailyTokens',
      'monthlyTokens',
      'expectedRevision',
      'reason',
    ]);
    const scope = String(b.scope);
    if (!['ACCOUNT', 'ORGANIZATION'].includes(scope))
      throw new BadRequestException('Invalid scope');
    const subjectId = uuid(b.subjectId);
    const reason = text(b.reason, 300);
    for (const k of ['enabled', 'paused'])
      if (typeof b[k] !== 'boolean')
        throw new BadRequestException('Boolean required');
    for (const k of ['dailyTokens', 'monthlyTokens'])
      if (
        b[k] !== null &&
        (!Number.isInteger(b[k]) ||
          Number(b[k]) < 0 ||
          Number(b[k]) > 2000000000)
      )
        throw new BadRequestException('Invalid quota');
    if (!Number.isInteger(b.expectedRevision) || Number(b.expectedRevision) < 0)
      throw new BadRequestException('Invalid revision');
    return this.run(
      token,
      'ai.usage.quota.update',
      subjectId,
      async (tx, actorId) => {
        const exists =
          scope === 'ACCOUNT'
            ? await tx.internalUser.count({ where: { id: subjectId } })
            : await tx.organization.count({ where: { id: subjectId } });
        if (!exists) deny();
        const prev = await tx.aiQuotaPolicy.findUnique({
          where: { scope_subjectId: { scope, subjectId } },
        });
        if ((prev?.revision ?? 0) !== b.expectedRevision)
          throw new ConflictException('额度版本已变化，请刷新');
        const data = {
          enabled: b.enabled as boolean,
          paused: b.paused as boolean,
          dailyTokens: b.dailyTokens as number | null,
          monthlyTokens: b.monthlyTokens as number | null,
          revision: (prev?.revision ?? 0) + 1,
          updatedAt: new Date(),
        };
        const result = await tx.aiQuotaPolicy.upsert({
          where: { scope_subjectId: { scope, subjectId } },
          create: { id: randomUUID(), scope, subjectId, ...data },
          update: data,
        });
        await this.evidence(
          tx,
          actorId,
          'ai.usage.quota.changed',
          result.id,
          reason,
          {
            before: prev
              ? {
                  enabled: prev.enabled,
                  paused: prev.paused,
                  dailyTokens: prev.dailyTokens,
                  monthlyTokens: prev.monthlyTokens,
                  revision: prev.revision,
                }
              : null,
            after: { ...data, updatedAt: data.updatedAt.toISOString() },
            scope,
            subjectId,
          },
        );
        return { id: result.id, message: `额度已更新至 V${result.revision}` };
      },
    );
  }
  assignment(token: string, userId: string, input: unknown) {
    const b = bodyObject(input, ['organizationId', 'reason']);
    const organizationId =
      b.organizationId === null ? null : uuid(b.organizationId);
    const reason = text(b.reason, 300);
    return this.run(
      token,
      'ai.usage.assignment.update',
      uuid(userId),
      async (tx, actorId) => {
        if (!(await tx.internalUser.count({ where: { id: userId } }))) deny();
        if (
          organizationId &&
          !(await tx.organization.count({
            where: { id: organizationId },
          }))
        )
          throw new BadRequestException('费用归属机构不存在');
        await tx.aiCostAssignment.upsert({
          where: { userId },
          create: { userId, organizationId },
          update: { organizationId, updatedAt: new Date() },
        });
        await this.evidence(
          tx,
          actorId,
          'ai.usage.assignment.changed',
          userId,
          reason,
          { organizationId },
        );
        return {
          id: userId,
          message: '后续模型调用使用新的费用归属，历史不改写',
        };
      },
    );
  }
  price(token: string, input: unknown) {
    const b = bodyObject(input, [
      'provider',
      'model',
      'currency',
      'inputMicrosPerMillion',
      'outputMicrosPerMillion',
      'cachedMicrosPerMillion',
      'effectiveAt',
      'reason',
    ]);
    const provider = text(b.provider, 160),
      model = text(b.model, 120),
      currency = text(b.currency, 8).toUpperCase(),
      effectiveAt = new Date(String(b.effectiveAt)),
      reason = text(b.reason, 300);
    if (
      !/^[A-Z]{3}$/.test(currency) ||
      !Number.isFinite(+effectiveAt) ||
      +effectiveAt < Date.now() - 60000
    )
      throw new BadRequestException('新价格只作用于当前或未来调用');
    const data = {
      provider,
      model,
      currency,
      effectiveAt,
      inputMicrosPerMillion: micros(b.inputMicrosPerMillion),
      outputMicrosPerMillion: micros(b.outputMicrosPerMillion),
      cachedMicrosPerMillion:
        b.cachedMicrosPerMillion === null
          ? null
          : micros(b.cachedMicrosPerMillion),
    };
    return this.run(
      token,
      'ai.usage.price.create',
      undefined,
      async (tx, actorId) => {
        const id = randomUUID();
        await tx.aiModelPrice.create({ data: { id, ...data } });
        await this.evidence(tx, actorId, 'ai.usage.price.created', id, reason, {
          provider,
          model,
          currency,
          effectiveAt: effectiveAt.toISOString(),
        });
        return { id, message: '已新增价格版本；历史估算保持原价' };
      },
    );
  }
  bill(token: string, input: unknown) {
    const b = bodyObject(input, [
      'provider',
      'currency',
      'from',
      'to',
      'amountMicros',
      'note',
    ]);
    const from = new Date(String(b.from)),
      to = new Date(String(b.to));
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || from >= to)
      throw new BadRequestException('Invalid bill period');
    const data = {
      provider: text(b.provider, 160),
      currency: text(b.currency, 8).toUpperCase(),
      from,
      to,
      amountMicros: micros(b.amountMicros),
      note: redact(text(b.note, 300)),
    };
    return this.run(token, 'ai.usage.bill.create', undefined, async (tx) => {
      const id = randomUUID();
      await tx.aiSupplierBill.create({ data: { id, ...data } });
      return { id, message: '账单已记录；差额为周期总额核对，不自动分摊' };
    });
  }
  alert(token: string, id: string, input: unknown) {
    const b = bodyObject(input, ['ownerId', 'note']);
    const note = redact(text(b.note, 300)),
      ownerId = b.ownerId === null ? null : uuid(b.ownerId);
    return this.run(
      token,
      'governance.alert.acknowledge',
      uuid(id),
      async (tx, actorId) => {
        if (
          ownerId &&
          !(await tx.internalUser.count({
            where: { id: ownerId, active: true },
          }))
        )
          throw new BadRequestException('Invalid owner');
        await tx.governanceAlert.update({
          where: { id },
          data: {
            acknowledgedBy: actorId,
            acknowledgedAt: new Date(),
            ownerId,
            note,
          },
        });
        await this.evidence(
          tx,
          actorId,
          'governance.alert.acknowledged',
          id,
          note,
          { ownerId },
        );
        return { id, message: '已确认收到；实际恢复状态由监控信号决定' };
      },
    );
  }
}
