import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  uuid,
} from '../authorization/authorization.service.js';
import { deny, scheduleRead, type Actor } from '../authorization/policy.js';
import { validateConfig } from '../scheduling/scheduling.algorithm.js';
import type {
  ScheduleConfigDto,
  ScheduleMatchDto,
} from '../scheduling/scheduling.dto.js';
import { planningIssues, type PlanningCondition } from './planning.js';
import { PlanningService } from './planning.service.js';
import {
  calculateCandidate,
  type PreferenceReport,
} from './candidate.algorithm.js';

type Tx = Prisma.TransactionClient;
type Row = Prisma.AgentScheduleCandidateGetPayload<Record<string, never>>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const snapshot = (
  row: {
    format: string;
    status: string;
    config: unknown;
    matches: unknown;
    revision: number;
  } | null,
) =>
  row
    ? {
        format: row.format,
        status: row.status,
        config: row.config,
        matches: row.matches,
        revision: row.revision,
      }
    : { exists: false };
const participantSnapshot = (
  rows: {
    id: string;
    teamId: string;
    active: boolean;
    revision: number;
    updatedAt: Date;
    profile: Prisma.JsonValue;
  }[],
) =>
  rows.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    active: row.active,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    name:
      typeof row.profile === 'object' &&
      row.profile &&
      !Array.isArray(row.profile) &&
      typeof (row.profile as Record<string, unknown>).name === 'string'
        ? ((row.profile as Record<string, unknown>).name as string)
        : '未命名球队',
  }));
// PostgreSQL JSONB normalizes object key order. Compare canonical snapshots,
// never serialized insertion order from the HTTP client or Prisma driver.
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export type CandidateView = {
  id: string;
  planningId: string;
  planningRevision: number;
  eventId: string;
  baselineRevision: number;
  status: 'FOUND' | 'PROVEN_CONFLICT' | 'SEARCH_LIMIT' | 'STALE';
  warning: string;
  format: 'ROUND_ROBIN';
  config: ScheduleConfigDto;
  configSource: string;
  fixedMatchIds: string[];
  matches: ScheduleMatchDto[];
  changes: {
    matchId: string;
    homeLabel: string;
    awayLabel: string;
    beforeStartAt: string;
    beforeVenue: string;
    afterStartAt: string;
    afterVenue: string;
  }[];
  issues: { code: string; message: string; matchIds: string[] }[];
  preferences: PreferenceReport[];
  explored: number;
  createdAt: string;
};

@Injectable()
export class CandidateService {
  constructor(
    private readonly auth: AuthorizationService,
    private readonly planning: PlanningService,
  ) {}

  private async context(tx: Tx, actor: Actor, planningId: string) {
    const plan = await tx.agentPlanningRequest.findUnique({
      where: { id: uuid(planningId) },
    });
    if (!plan || plan.ownerId !== actor.id) deny();
    const view = await this.planning.view(tx, actor, plan);
    await scheduleRead(tx, actor, plan.eventId);
    const baseline = await tx.eventSchedule.findUnique({
      where: { eventId: plan.eventId },
    });
    const rows = await tx.eventTeam.findMany({
      where: { eventId: plan.eventId },
      orderBy: { id: 'asc' },
    });
    const staff = baseline
      ? await tx.eventMatchStaff.findMany({
          where: { eventId: plan.eventId, scheduleRevision: baseline.revision },
          orderBy: { matchId: 'asc' },
          select: { matchId: true, revision: true, staff: true },
        })
      : [];
    const staffSnapshot = staff.map((item) => ({
      matchId: item.matchId,
      revision: item.revision,
      assigned: Array.isArray(item.staff) && item.staff.length > 0,
    }));
    return {
      plan,
      view,
      baseline,
      teams: participantSnapshot(rows),
      staffSnapshot,
      baselineSnapshot: { ...snapshot(baseline), staff: staffSnapshot },
    };
  }
  private async view(tx: Tx, actor: Actor, row: Row): Promise<CandidateView> {
    if (row.ownerId !== actor.id) deny();
    const { plan, view, baseline, teams, baselineSnapshot } =
      await this.context(tx, actor, row.planningId);
    if (plan.sessionId !== row.sessionId || plan.eventId !== row.eventId)
      deny();
    const stale =
      view.status !== 'CONFIRMED' ||
      view.revision !== row.planningRevision ||
      view.confirmedRevision !== row.planningRevision ||
      view.pending.length > 0 ||
      view.issues.length > 0 ||
      !same(baselineSnapshot, row.baselineSnapshot) ||
      !same(teams, row.teamSnapshot) ||
      (
        (baseline?.matches as unknown as ScheduleMatchDto[] | undefined) ?? []
      ).some(
        (match) =>
          match.startAt &&
          Date.parse(match.startAt) <= Date.now() &&
          !(row.fixedMatchIds as string[]).includes(match.id),
      );
    const current = row.matches as unknown as ScheduleMatchDto[];
    const old =
      (row.baselineSnapshot as { matches?: ScheduleMatchDto[] } | null)
        ?.matches ?? [];
    const changes = current
      .map((match) => {
        const before = old.find((item) => item.id === match.id);
        return {
          matchId: match.id,
          homeLabel: match.homeLabel,
          awayLabel: match.awayLabel,
          beforeStartAt: before?.startAt ?? '',
          beforeVenue: before?.venue ?? '',
          afterStartAt: match.startAt,
          afterVenue: match.venue,
        };
      })
      .filter(
        (item) =>
          item.beforeStartAt !== item.afterStartAt ||
          item.beforeVenue !== item.afterVenue,
      );
    return {
      id: row.id,
      planningId: row.planningId,
      planningRevision: row.planningRevision,
      eventId: row.eventId,
      baselineRevision: row.baselineRevision,
      status: stale ? 'STALE' : (row.outcome as CandidateView['status']),
      warning: stale
        ? '需求确认、参赛记录或基础赛程已变化；此候选不可沿用，请重新核对并生成。'
        : '候选预览，尚未保存；不产生正式赛程版本或执行许可。',
      format: 'ROUND_ROBIN',
      config: row.config as unknown as ScheduleConfigDto,
      configSource: row.configSource,
      fixedMatchIds: row.fixedMatchIds as string[],
      matches: current,
      changes,
      issues: row.issues as CandidateView['issues'],
      preferences: row.preferences as PreferenceReport[],
      explored: row.explored,
      createdAt: row.createdAt.toISOString(),
    };
  }
  get(token: string, planningId: string, candidateId: string) {
    return this.auth.run(
      token,
      'agent.candidate.read',
      planningId,
      {},
      async (tx, actor) => {
        const row = await tx.agentScheduleCandidate.findUnique({
          where: { id: uuid(candidateId) },
        });
        if (!row || row.planningId !== uuid(planningId)) deny();
        return this.view(tx, actor, row);
      },
    );
  }
  latest(token: string, planningId: string) {
    return this.auth.run(
      token,
      'agent.candidate.read',
      planningId,
      {},
      async (tx, actor) => {
        const { plan } = await this.context(tx, actor, planningId);
        const row = await tx.agentScheduleCandidate.findFirst({
          where: { planningId: plan.id, ownerId: actor.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (!row) throw new NotFoundException('No candidate preview yet');
        return this.view(tx, actor, row);
      },
    );
  }
  generate(token: string, planningId: string, input: unknown) {
    return this.auth.run(
      token,
      'agent.candidate.preview',
      planningId,
      input,
      async (tx, actor) => {
        const body = bodyObject(input, [
          'expectedRevision',
          'baselineRevision',
          'format',
          'configSource',
          'config',
          'fixedMatchIds',
        ]);
        if (
          !Number.isSafeInteger(body.expectedRevision) ||
          !Number.isSafeInteger(body.baselineRevision) ||
          Number(body.baselineRevision) < 0
        )
          throw new BadRequestException(
            'Specify planning and baseline revisions',
          );
        if (body.format !== 'ROUND_ROBIN')
          throw new BadRequestException(
            'Only single round-robin previews are supported; no silent format downgrade',
          );
        if (!['EVENT_SCHEDULE', 'EXPLICIT'].includes(String(body.configSource)))
          throw new BadRequestException(
            'Configuration source must be explicit',
          );
        if (
          !Array.isArray(body.fixedMatchIds) ||
          body.fixedMatchIds.length > 66
        )
          throw new BadRequestException(
            'Explicit fixed-match scope required (may be an empty list)',
          );
        const fixedMatchIds = body.fixedMatchIds.map(uuid);
        if (new Set(fixedMatchIds).size !== fixedMatchIds.length)
          throw new BadRequestException('Duplicate fixed match');
        const { plan, view, baseline, teams, baselineSnapshot, staffSnapshot } =
          await this.context(tx, actor, planningId);
        if (
          view.status !== 'CONFIRMED' ||
          view.confirmedRevision !== view.revision ||
          view.pending.length ||
          view.issues.length ||
          plan.revision !== body.expectedRevision
        )
          throw new ConflictException(
            'Confirmed planning revision is missing or stale; review requirements again',
          );
        if ((baseline?.revision ?? 0) !== body.baselineRevision)
          throw new ConflictException('Baseline schedule revision changed');
        if (
          baseline?.format === 'SINGLE_ELIMINATION' ||
          baseline?.status === 'PUBLISHED'
        )
          throw new ConflictException(
            'Existing elimination/published schedule may contain protected matches; this version cannot reschedule it',
          );
        if (body.configSource === 'EXPLICIT' && !body.config)
          throw new BadRequestException(
            'Complete configuration required; no business defaults',
          );
        const raw = body.config;
        const requiredConfig = [
          'teamIds',
          'venues',
          'startDate',
          'endDate',
          'dailyStart',
          'dailyEnd',
          'durationMinutes',
          'bufferMinutes',
          'minRestMinutes',
        ];
        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw) ||
          !same(Object.keys(raw).sort(), requiredConfig.sort()) ||
          !['startDate', 'endDate', 'dailyStart', 'dailyEnd'].every(
            (key) => typeof (raw as Record<string, unknown>)[key] === 'string',
          ) ||
          !['durationMinutes', 'bufferMinutes', 'minRestMinutes'].every(
            (key) => typeof (raw as Record<string, unknown>)[key] === 'number',
          ) ||
          !Array.isArray((raw as ScheduleConfigDto).teamIds) ||
          !(raw as ScheduleConfigDto).teamIds.every(
            (value) =>
              typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
          ) ||
          !Array.isArray((raw as ScheduleConfigDto).venues) ||
          !(raw as ScheduleConfigDto).venues.every(
            (value) => typeof value === 'string',
          )
        )
          throw new BadRequestException(
            'Complete valid configuration required',
          );
        const config = validateConfig({
          ...(raw as ScheduleConfigDto),
          teamIds: (raw as ScheduleConfigDto).teamIds.map(uuid),
        });
        if (
          body.configSource === 'EVENT_SCHEDULE' &&
          (!baseline || !same(baseline.config, config))
        )
          throw new ConflictException(
            'Event schedule configuration is absent or has changed; specify all fields explicitly',
          );
        const conditions = view.conditions as PlanningCondition[];
        const period = conditions.find(
          (condition) =>
            condition.kind === 'DATE_RANGE' && condition.priority === 'MUST',
        );
        if (
          !period?.from ||
          !period.to ||
          period.from !== config.startDate ||
          period.to !== config.endDate
        )
          throw new ConflictException(
            'Confirmed MUST date range and candidate configuration differ; clarify before calculation',
          );
        if (planningIssues(conditions).length)
          throw new ConflictException(
            'Requirements contain conflicting conditions',
          );
        if (
          conditions.some(
            (condition) =>
              condition.kind === 'TEAM_WINDOW' &&
              condition.priority === 'MUST' &&
              condition.availability === 'AVAILABLE',
          )
        )
          throw new ConflictException(
            'MUST AVAILABLE only states a possible time and does not define an enforceable match placement constraint; clarify ONLY/BLOCK or mark it as a preference',
          );
        if (conditions.some((condition) => condition.kind === 'MATCHUP'))
          throw new ConflictException(
            'Unqualified pair preference cannot be optimized in single round-robin: each pair already meets exactly once; clarify time/round semantics or remove it',
          );
        if (
          conditions.some(
            (condition) =>
              condition.kind === 'TEAM_WINDOW' &&
              (!condition.dates?.length ||
                !['ONLY', 'BLOCK', 'AVAILABLE'].includes(
                  condition.availability ?? '',
                )),
          )
        )
          throw new ConflictException(
            'Unresolved or unsupported team window condition',
          );
        if (
          !same(
            [...config.teamIds].sort(),
            teams
              .filter((team) => team.active)
              .map((team) => team.id)
              .sort(),
          )
        )
          throw new ConflictException(
            'Configuration must include every active event participant, no additions/removals; deactivate old participation before retry',
          );
        const before = (baseline?.matches ??
          []) as unknown as ScheduleMatchDto[];
        if (
          fixedMatchIds.some(
            (id) => !before.some((match) => match.id === id && match.startAt),
          )
        )
          throw new BadRequestException(
            'Fixed match must have an existing scheduled time',
          );
        const protectedIds = new Set(
          before
            .filter(
              (match) =>
                match.startAt && Date.parse(match.startAt) <= Date.now(),
            )
            .map((match) => match.id),
        );
        for (const assignment of staffSnapshot.filter((item) => item.assigned))
          protectedIds.add(assignment.matchId);
        if ([...protectedIds].some((id) => !fixedMatchIds.includes(id)))
          throw new ConflictException(
            'Started/past or staffed matches must be fixed explicitly; cannot rearrange protected matches',
          );
        const result = calculateCandidate(
          config,
          teams,
          conditions,
          before,
          fixedMatchIds,
        );
        // A second authority check after bounded computation, before storing any preview.
        const updated = await this.context(tx, actor, plan.id);
        if (
          updated.view.status !== 'CONFIRMED' ||
          updated.plan.revision !== plan.revision ||
          !same(updated.baselineSnapshot, baselineSnapshot) ||
          !same(updated.teams, teams)
        )
          throw new ConflictException(
            'Planning or baseline changed during calculation',
          );
        const row = await tx.agentScheduleCandidate.create({
          data: {
            id: randomUUID(),
            planningId: plan.id,
            sessionId: plan.sessionId,
            ownerId: actor.id,
            eventId: plan.eventId,
            planningRevision: plan.revision,
            baselineRevision: baseline?.revision ?? 0,
            format: 'ROUND_ROBIN',
            config: json(config),
            configSource: body.configSource as string,
            teamSnapshot: json(teams),
            baselineSnapshot: json(baselineSnapshot),
            fixedMatchIds: json(fixedMatchIds),
            matches: json(result.matches),
            issues: json(result.issues),
            preferences: json(result.preferences),
            outcome: result.outcome,
            explored: result.explored,
          },
        });
        return this.view(tx, actor, row);
      },
    );
  }
}
