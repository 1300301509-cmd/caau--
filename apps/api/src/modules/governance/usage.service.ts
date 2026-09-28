import { governanceTracer, count } from './metrics.js';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createAuthorizationDatabase, type Prisma } from '@caau/database';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AgentModelAdapter } from '../ai/model-adapter.js';
import { requestScope, type RequestScope } from './request-context.js';

export function billingPeriods(at: Date) {
  const bj = new Date(at.getTime() + 8 * 3600000).toISOString();
  return [bj.slice(0, 10), bj.slice(0, 7)];
}
export function estimateMicros(
  input: number,
  output: number,
  cached: number | null,
  price: {
    inputMicrosPerMillion: bigint;
    outputMicrosPerMillion: bigint;
    cachedMicrosPerMillion: bigint | null;
  },
) {
  const cache =
    price.cachedMicrosPerMillion !== null && cached !== null
      ? Math.min(input, cached)
      : 0;
  const numerator =
    BigInt(input - cache) * price.inputMicrosPerMillion +
    BigInt(output) * price.outputMicrosPerMillion +
    BigInt(cache) * (price.cachedMicrosPerMillion ?? 0n);
  return (numerator + 999999n) / 1000000n;
}
export function captureFailure(category: string) {
  const scope = requestScope.getStore();
  if (scope) scope.failureCategory = category;
}
export function captureUsage(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const value = raw as {
    id?: unknown;
    usage_metadata?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      input_token_details?: { cache_read?: unknown };
    };
    response_metadata?: { id?: unknown };
  };
  const u = value.usage_metadata;
  const valid = (n: unknown): n is number =>
    typeof n === 'number' &&
    Number.isSafeInteger(n) &&
    n >= 0 &&
    n <= 2000000000;
  const scope = requestScope.getStore();
  if (scope && valid(u?.input_tokens) && valid(u?.output_tokens)) {
    const providerId = value.response_metadata?.id ?? value.id;
    scope.usage = {
      input: u.input_tokens,
      output: u.output_tokens,
      cached: valid(u.input_token_details?.cache_read)
        ? u.input_token_details.cache_read
        : null,
      providerRequestId:
        typeof providerId === 'string' && /^[\w.-]{1,200}$/.test(providerId)
          ? providerId
          : null,
    };
  }
}

export class UsageService {
  private readonly db;
  constructor(
    private readonly auth: AuthorizationService,
    databaseUrl?: string,
  ) {
    this.db = databaseUrl
      ? createAuthorizationDatabase(databaseUrl)
      : undefined;
  }
  async onModuleDestroy() {
    await this.db?.close();
  }
  private database() {
    if (!this.db)
      throw new ServiceUnavailableException('Usage database unavailable');
    return this.db.client;
  }
  async signal(
    fingerprint: string,
    title: string,
    severity: string,
    state: string,
    deliveryState = 'PENDING',
    deliveryAttempts = 0,
  ) {
    return this.transaction(async (tx) => {
      const old = await tx.governanceAlert.findFirst({
        where: { fingerprint },
        orderBy: { firstSeenAt: 'desc' },
      });
      if (old && (old.state === 'FIRING' || state === 'RECOVERED'))
        return tx.governanceAlert.update({
          where: { id: old.id },
          data: {
            state,
            lastSeenAt: new Date(),
            recoveredAt:
              state === 'RECOVERED' ? (old.recoveredAt ?? new Date()) : null,
            deliveryState,
            deliveryAttempts,
            notifiedAt: deliveryState === 'DELIVERED' ? new Date() : undefined,
          },
        });
      if (state === 'RECOVERED') return null;
      return tx.governanceAlert.create({
        data: {
          id: randomUUID(),
          fingerprint,
          title,
          severity,
          state,
          source: 'monitoring',
          deliveryState,
          deliveryAttempts,
          notifiedAt: deliveryState === 'DELIVERED' ? new Date() : null,
        },
      });
    });
  }
  async quotaSignals() {
    return this.transaction(async (tx) => {
      const alerts = await tx.governanceAlert.findMany({
        where: {
          source: 'quota',
          OR: [{ state: 'FIRING' }, { deliveryState: { not: 'DELIVERED' } }],
        },
        orderBy: { firstSeenAt: 'asc' },
        take: 100,
      });
      const result = [];
      for (const a of alerts) {
        const [, scope, subjectId, period, threshold] =
          a.fingerprint.split(':');
        if (!scope || !subjectId || !period) continue;
        const policy = await tx.aiQuotaPolicy.findUnique({
          where: { scope_subjectId: { scope, subjectId } },
        });
        const bucket = await tx.aiQuotaBucket.findUnique({
          where: { id: `${scope}:${subjectId}:${period}` },
        });
        const limit =
          period.length === 10 ? policy?.dailyTokens : policy?.monthlyTokens;
        const active = !!(
          policy?.enabled &&
          limit &&
          bucket &&
          billingPeriods(new Date()).includes(period) &&
          bucket.used * 100n >= BigInt(limit) * BigInt(threshold ?? 80)
        );
        const state = active ? 'FIRING' : 'RECOVERED';
        if (state !== a.state)
          await tx.governanceAlert.update({
            where: { id: a.id },
            data: { state, recoveredAt: new Date(), deliveryState: 'PENDING' },
          });
        result.push({
          fingerprint: a.fingerprint,
          title: `CAAU ${a.title}`,
          state,
          severity: a.severity,
        });
      }
      return result;
    });
  }
  private async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.database().$transaction(fn, {
          isolationLevel: 'Serializable',
          timeout: 10000,
        });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2034' || attempt >= 5) throw e;
      }
    }
  }
  wrap(model: AgentModelAdapter): AgentModelAdapter {
    const phases: Record<string, string> = {
      route: 'route',
      chat: 'chat',
      summarize: 'summary',
      parse: 'intent',
      planQuery: 'query_plan',
      planPlanning: 'planning',
      planTeam: 'team',
      chatStream: 'chat',
      testConnection: 'connection',
    };
    return new Proxy(model, {
      get: (target, key) => {
        const original = Reflect.get(target, key);
        if (
          typeof key !== 'string' ||
          !phases[key] ||
          typeof original !== 'function'
        )
          return typeof original === 'function'
            ? original.bind(target)
            : original;
        return async (...args: unknown[]) => {
          const parent = requestScope.getStore();
          if (!parent?.token) return original.apply(target, args);
          const scope: RequestScope = {
            ...parent,
            usage: undefined,
            failureCategory: undefined,
          };
          return requestScope.run(scope, async () => {
            const status = target.status();
            const reserve = Math.min(
              100000000,
              JSON.stringify(args).length * 4 + 8192,
            );
            const id = await this.begin(
              scope,
              target.mode,
              status.modelName ?? target.mode,
              status.baseUrlHost ?? 'simulated',
              phases[key]!,
              reserve,
            );
            const start = performance.now();
            const span = governanceTracer.startSpan(`model.${phases[key]}`, {
              attributes: {
                'caau.call_id': id,
                'caau.request_id': scope.requestId,
                'gen_ai.request.model': status.modelName,
                'caau.model_mode': target.mode,
              },
            });
            let success = false;
            try {
              const result = await original.apply(target, args);
              success =
                key !== 'testConnection' ||
                ['SUCCEEDED', 'NOT_APPLICABLE'].includes(
                  result.lastConnectionTest?.status,
                );
              return result;
            } finally {
              try {
                await this.finish(
                  id,
                  scope.usage,
                  success,
                  Math.round(performance.now() - start),
                );
              } finally {
                span.setAttribute(
                  'caau.result',
                  success ? 'SUCCESS' : 'FAILED',
                );
                span.end();
                count(
                  `caau_model_calls_total{mode="${target.mode}",result="${success ? 'SUCCESS' : 'FAILED'}"}`,
                );
                if (scope.usage && target.mode !== 'SIMULATED')
                  count(
                    'caau_model_tokens_total',
                    scope.usage.input + scope.usage.output,
                  );
              }
            }
          });
        };
      },
    });
  }
  private async begin(
    scope: RequestScope,
    mode: string,
    model: string,
    provider: string,
    phase: string,
    reservedTokens: number,
  ) {
    return this.auth.run(
      scope.token!,
      'ai.usage.reserve',
      undefined,
      undefined,
      async (tx, actor) => {
        const assignment = await tx.aiCostAssignment.findUnique({
          where: { userId: actor.id },
        });
        const organizationId = assignment?.organizationId ?? null;
        const now = new Date();
        const subjects = [
          { scope: 'ACCOUNT', subjectId: actor.id },
          ...(organizationId
            ? [{ scope: 'ORGANIZATION', subjectId: organizationId }]
            : []),
        ];
        if (mode !== 'SIMULATED') {
          for (const subject of subjects) {
            const policy = await tx.aiQuotaPolicy.findUnique({
              where: { scope_subjectId: subject },
            });
            if (policy?.paused)
              throw new HttpException('当前账号或机构已暂停AI使用', 429);
            for (const period of billingPeriods(now)) {
              const id = `${subject.scope}:${subject.subjectId}:${period}`;
              const bucket = await tx.aiQuotaBucket.upsert({
                where: { id },
                create: { id, ...subject, period },
                update: {},
              });
              const limit =
                period.length === 10
                  ? policy?.dailyTokens
                  : policy?.monthlyTokens;
              if (
                policy?.enabled &&
                limit !== null &&
                limit !== undefined &&
                bucket.used + bucket.reserved + BigInt(reservedTokens) >
                  BigInt(limit)
              )
                throw new HttpException(
                  'AI额度不足，请联系管理员调整额度后重试',
                  429,
                );
              await tx.aiQuotaBucket.update({
                where: { id },
                data: {
                  reserved: { increment: reservedTokens },
                  updatedAt: now,
                },
              });
            }
          }
        }
        const price =
          mode === 'SIMULATED'
            ? null
            : await tx.aiModelPrice.findFirst({
                where: { provider, model, effectiveAt: { lte: now } },
                orderBy: { effectiveAt: 'desc' },
              });
        const id = randomUUID();
        await tx.aiUsageCall.create({
          data: {
            id,
            actorId: actor.id,
            organizationId,
            requestId: scope.requestId,
            traceId: scope.traceId,
            sessionId: scope.sessionId,
            taskId: scope.taskId,
            mode,
            provider,
            model,
            phase,
            reservedTokens: mode === 'SIMULATED' ? 0 : reservedTokens,
            priceId: price?.id,
            currency: price?.currency,
          },
        });
        return id;
      },
      { retries: 5, retryUnique: true, timeout: 10000 },
    );
  }
  async finish(
    id: string,
    usage: RequestScope['usage'],
    success: boolean,
    elapsedMs: number,
    reason?: string,
    existingTx?: Prisma.TransactionClient,
  ) {
    const work = async (tx: Prisma.TransactionClient) => {
      const row = await tx.aiUsageCall.findUniqueOrThrow({ where: { id } });
      if (
        reason
          ? row.usageStatus !== 'UNKNOWN' &&
            !(
              row.status === 'RESERVED' &&
              row.createdAt.getTime() < Date.now() - 180000
            )
          : row.completedAt !== null
      )
        return;
      const known = row.mode === 'SIMULATED' || !!usage;
      if (row.mode !== 'SIMULATED' && known) {
        for (const subject of [
          { scope: 'ACCOUNT', subjectId: row.actorId! },
          ...(row.organizationId
            ? [{ scope: 'ORGANIZATION', subjectId: row.organizationId }]
            : []),
        ]) {
          const policy = await tx.aiQuotaPolicy.findUnique({
            where: { scope_subjectId: subject },
          });
          for (const period of billingPeriods(row.createdAt)) {
            const bucket = await tx.aiQuotaBucket.update({
              where: { id: `${subject.scope}:${subject.subjectId}:${period}` },
              data: {
                reserved: { decrement: row.reservedTokens },
                used: { increment: usage!.input + usage!.output },
                updatedAt: new Date(),
              },
            });
            const limit =
              period.length === 10
                ? policy?.dailyTokens
                : policy?.monthlyTokens;
            if (
              policy?.enabled &&
              limit &&
              bucket.used * 100n >= BigInt(limit) * 80n
            ) {
              const fingerprint = `quota:${bucket.id}:${bucket.used >= BigInt(limit) ? '100' : '80'}`;
              const exists = await tx.governanceAlert.findFirst({
                where: { fingerprint },
              });
              if (!exists)
                await tx.governanceAlert.create({
                  data: {
                    id: randomUUID(),
                    fingerprint,
                    source: 'quota',
                    severity: 'WARNING',
                    title: `AI额度已达到${bucket.used >= BigInt(limit) ? '100%' : '80%'}`,
                    state: 'FIRING',
                  },
                });
            }
          }
        }
      }
      const price = row.priceId
        ? await tx.aiModelPrice.findUnique({ where: { id: row.priceId } })
        : null;
      await tx.aiUsageCall.update({
        where: { id },
        data: {
          status: reason
            ? row.status === 'RESERVED'
              ? 'UNKNOWN'
              : row.status
            : success
              ? 'SUCCESS'
              : 'FAILED',
          usageStatus:
            row.mode === 'SIMULATED'
              ? 'SIMULATED'
              : usage
                ? reason
                  ? 'MANUAL'
                  : 'KNOWN'
                : 'UNKNOWN',
          inputTokens: usage?.input,
          outputTokens: usage?.output,
          cachedTokens: usage?.cached,
          providerRequestId: usage?.providerRequestId,
          elapsedMs,
          errorCategory: success
            ? null
            : (requestScope.getStore()?.failureCategory ?? 'unknown'),
          estimatedMicros:
            price && usage
              ? estimateMicros(usage.input, usage.output, usage.cached, price)
              : null,
          resolvedReason: reason,
          completedAt: new Date(),
        },
      });
    };
    return existingTx ? work(existingTx) : this.transaction(work);
  }
}
