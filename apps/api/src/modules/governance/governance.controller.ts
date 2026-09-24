import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  Header,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { prometheusMetrics } from './metrics.js';
import { redact } from './request-context.js';
import { Permission, Public } from '../authorization/authorization.guard.js';
import { BadRequestException } from '@nestjs/common';
import {
  bodyObject,
  uuid,
  text,
} from '../authorization/authorization.service.js';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { GovernanceService } from './governance.service.js';
import { UsageService } from './usage.service.js';
import {
  GovernancePageDto,
  GovernanceOverviewDto,
  GovernanceQueryDto,
  GovernanceReasonDto,
  GovernanceRevokeDto,
  GovernanceResultDto,
  GovernanceExportDto,
  AiAssignmentDto,
  AiQuotaInputDto,
  AiPriceInputDto,
  AiBillInputDto,
  GovernanceAlertUpdateDto,
  AiResolveUsageDto,
} from './governance.dto.js';

@ApiTags('governance')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('observability')
export class GovernanceController {
  constructor(
    private readonly service: GovernanceService,
    private readonly usage: UsageService,
  ) {}
  private internal(r: AuthRequest) {
    const expected = process.env.CAAU_MONITORING_TOKEN ?? '';
    const supplied =
      (r.headers as Record<string, string | undefined>)[
        'x-caau-monitoring-token'
      ] ??
      r.headers.authorization?.replace(/^Bearer /, '') ??
      '';
    if (
      expected.length < 32 ||
      expected.length !== supplied.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
    )
      throw new ForbiddenException();
  }
  @Get('metrics')
  @Public()
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  metrics(@Req() r: AuthRequest) {
    this.internal(r);
    return prometheusMetrics();
  }
  @Post('signals')
  @HttpCode(200)
  @Public()
  @ApiExcludeEndpoint()
  signals(@Req() r: AuthRequest, @Body() raw: unknown) {
    this.internal(r);
    const b = bodyObject(raw, [
      'fingerprint',
      'title',
      'severity',
      'state',
      'deliveryState',
      'deliveryAttempts',
    ]);
    const severity = text(b.severity, 16),
      state = text(b.state, 16);
    if (
      !['WARNING', 'CRITICAL'].includes(severity) ||
      !['FIRING', 'RECOVERED'].includes(state)
    )
      throw new BadRequestException('Invalid signal');
    if (
      b.deliveryState &&
      !['PENDING', 'DELIVERED', 'FAILED', 'UNCONFIGURED'].includes(
        String(b.deliveryState),
      )
    )
      throw new BadRequestException('Invalid delivery');
    if (
      b.deliveryAttempts !== undefined &&
      (!Number.isSafeInteger(b.deliveryAttempts) ||
        Number(b.deliveryAttempts) < 0)
    )
      throw new BadRequestException('Invalid attempts');
    return this.usage
      .signal(
        text(b.fingerprint, 200),
        redact(text(b.title, 200)),
        severity,
        state,
        b.deliveryState ? String(b.deliveryState) : 'PENDING',
        Number(b.deliveryAttempts ?? 0),
      )
      .then(() => ({ ok: true }));
  }
  @Get('quota-signals')
  @Public()
  @ApiExcludeEndpoint()
  quotaSignals(@Req() r: AuthRequest) {
    this.internal(r);
    return this.usage.quotaSignals();
  }
  @Get('access')
  @Permission('governance.access')
  @ApiExcludeEndpoint()
  access(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) res: { setHeader(k: string, v: string): void },
  ) {
    return this.service.run(
      r.token!,
      'governance.access',
      undefined,
      async (_tx, actorId) => {
        res.setHeader('X-WEBAUTH-USER', actorId);
        return { ok: true };
      },
    );
  }

  @Get('overview')
  @Permission('governance.overview.read')
  @ApiOperation({ operationId: 'getGovernanceOverview' })
  @ApiOkResponse({ type: GovernanceOverviewDto })
  overview(@Req() r: AuthRequest, @Query() q: GovernanceQueryDto) {
    return this.service.overview(r.token!, q);
  }
  @Get('accounts/:id')
  @Permission('governance.account.read')
  @ApiOperation({ operationId: 'getGovernanceAccount' })
  @ApiOkResponse({ type: GovernanceOverviewDto })
  account(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.account(r.token!, id);
  }
  @Get('accounts/:id/permission')
  @Permission('governance.permission.explain')
  @ApiOperation({ operationId: 'explainGovernancePermission' })
  @ApiOkResponse({ type: GovernanceOverviewDto })
  permission(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() q: GovernanceQueryDto,
  ) {
    return this.service.permission(r.token!, id, q);
  }
  @Post('accounts/:id/revoke')
  @HttpCode(200)
  @Permission('governance.sessions.revoke')
  @ApiOperation({ operationId: 'revokeGovernanceSessions' })
  @ApiOkResponse({ type: GovernanceResultDto })
  revoke(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: GovernanceRevokeDto,
  ) {
    return this.service.revoke(r.token!, id, b);
  }
  @Post('dialogues/:id/review')
  @HttpCode(200)
  @Permission('governance.dialogue.review')
  @ApiOperation({ operationId: 'reviewGovernanceDialogue' })
  @ApiOkResponse({ type: GovernancePageDto })
  review(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: GovernanceReasonDto,
  ) {
    return this.service.review(r.token!, id, b);
  }
  @Post('audit/export')
  @HttpCode(200)
  @Permission('governance.audit.export')
  @ApiOperation({ operationId: 'exportGovernanceAudit' })
  @ApiOkResponse({ type: GovernanceExportDto })
  export(@Req() r: AuthRequest, @Body() b: GovernanceQueryDto) {
    return this.service.exportAudit(r.token!, b);
  }
  @Post('alerts/:id/acknowledge')
  @HttpCode(200)
  @Permission('governance.alert.acknowledge')
  @ApiOperation({ operationId: 'acknowledgeGovernanceAlert' })
  @ApiOkResponse({ type: GovernanceResultDto })
  acknowledge(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: GovernanceAlertUpdateDto,
  ) {
    return this.service.alert(r.token!, id, b);
  }
  @Get(':kind')
  @Permission('governance.collection.read')
  @ApiOperation({ operationId: 'listGovernanceRecords' })
  @ApiOkResponse({ type: GovernancePageDto })
  list(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Query() q: GovernanceQueryDto,
  ) {
    return this.service.list(r.token!, kind, q);
  }
}
@ApiTags('ai-usage')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('ai-usage')
export class AiUsageController {
  constructor(
    private readonly service: GovernanceService,
    private readonly usage: UsageService,
  ) {}
  @Post('calls/:id/resolve')
  @HttpCode(200)
  @Permission('ai.usage.resolve')
  @ApiOperation({ operationId: 'resolveAiUsage' })
  @ApiOkResponse({ type: GovernanceResultDto })
  resolve(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: AiResolveUsageDto,
  ) {
    bodyObject(b, ['inputTokens', 'outputTokens', 'reason']);
    uuid(id);
    text(b.reason, 300);
    if (
      ![b.inputTokens, b.outputTokens].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 100000000,
      )
    )
      throw new BadRequestException('Invalid token count');
    return this.service.run(r.token!, 'ai.usage.resolve', id, async (tx) => {
      const existing = await tx.aiUsageCall.findUniqueOrThrow({
        where: { id },
      });
      if (
        existing.usageStatus !== 'UNKNOWN' &&
        !(
          existing.status === 'RESERVED' &&
          existing.createdAt.getTime() < Date.now() - 180000
        )
      )
        throw new BadRequestException(
          '仅待核对或超过三分钟未结束的调用可以人工核对',
        );
      await this.usage.finish(
        id,
        {
          input: b.inputTokens,
          output: b.outputTokens,
          cached: null,
          providerRequestId: null,
        },
        existing.status === 'SUCCESS',
        existing.elapsedMs ?? 0,
        b.reason,
        tx,
      );
      return { id, message: '已核对并结算，原调用ID保持不变' };
    });
  }
  @Post('quotas')
  @HttpCode(200)
  @Permission('ai.usage.quota.update')
  @ApiOperation({ operationId: 'setAiUsageQuota' })
  @ApiOkResponse({ type: GovernanceResultDto })
  quota(@Req() r: AuthRequest, @Body() b: AiQuotaInputDto) {
    return this.service.quota(r.token!, b);
  }
  @Post('accounts/:id/assignment')
  @HttpCode(200)
  @Permission('ai.usage.assignment.update')
  @ApiOperation({ operationId: 'setAiCostAssignment' })
  @ApiOkResponse({ type: GovernanceResultDto })
  assignment(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: AiAssignmentDto,
  ) {
    return this.service.assignment(r.token!, id, b);
  }
  @Post('prices')
  @HttpCode(200)
  @Permission('ai.usage.price.create')
  @ApiOperation({ operationId: 'createAiModelPrice' })
  @ApiOkResponse({ type: GovernanceResultDto })
  price(@Req() r: AuthRequest, @Body() b: AiPriceInputDto) {
    return this.service.price(r.token!, b);
  }
  @Post('bills')
  @HttpCode(200)
  @Permission('ai.usage.bill.create')
  @ApiOperation({ operationId: 'createAiSupplierBill' })
  @ApiOkResponse({ type: GovernanceResultDto })
  bill(@Req() r: AuthRequest, @Body() b: AiBillInputDto) {
    return this.service.bill(r.token!, b);
  }
}
