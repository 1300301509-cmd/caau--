import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import { deny, eventOperations } from '../authorization/policy.js';
import type {
  ScheduleConfigDto,
  ScheduleMatchDto,
  ScheduleViewDto,
} from './scheduling.dto.js';
import {
  generateSchedule,
  validateConfig,
  validateSchedule,
} from './scheduling.algorithm.js';

type Tx = Prisma.TransactionClient;
type Plan = Prisma.EventScheduleGetPayload<Record<string, never>>;
const configKeys = [
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
const json = (value: unknown) => value as Prisma.InputJsonValue;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class SchedulingService {
  constructor(private readonly auth: AuthorizationService) {}

  private config(value: unknown) {
    const body = bodyObject(value, configKeys);
    if (!Array.isArray(body.teamIds) || !Array.isArray(body.venues))
      throw new BadRequestException('Invalid schedule configuration');
    return validateConfig({
      teamIds: body.teamIds.map(uuid),
      venues: body.venues.map((item) => text(item, 80)),
      startDate: String(body.startDate ?? ''),
      endDate: String(body.endDate ?? ''),
      dailyStart: String(body.dailyStart ?? ''),
      dailyEnd: String(body.dailyEnd ?? ''),
      durationMinutes: Number(body.durationMinutes),
      bufferMinutes: Number(body.bufferMinutes),
      minRestMinutes: Number(body.minRestMinutes),
    });
  }

  private async access(
    tx: Tx,
    actor: Parameters<typeof eventOperations>[1],
    eventId: string,
  ) {
    uuid(eventId);
    if (!(await tx.event.findUnique({ where: { id: eventId } }))) deny();
    await eventOperations(tx, actor, eventId);
  }

  private async teams(tx: Tx, eventId: string) {
    const rows = await tx.eventTeam.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name:
        typeof row.profile === 'object' &&
        row.profile &&
        !Array.isArray(row.profile) &&
        typeof (row.profile as Record<string, unknown>).name === 'string'
          ? String((row.profile as Record<string, unknown>).name)
          : '未命名球队',
      active: row.active,
    }));
  }

  private async view(tx: Tx, row: Plan): Promise<ScheduleViewDto> {
    const config = row.config as unknown as ScheduleConfigDto;
    const matches = row.matches as unknown as ScheduleMatchDto[];
    const issues = validateSchedule(
      config,
      matches,
      await this.teams(tx, row.eventId),
    );
    return {
      exists: true,
      eventId: row.eventId,
      format: row.format,
      status: row.status,
      config,
      matches,
      issues,
      revision: row.revision,
      publishedAt: row.publishedAt?.toISOString() ?? '',
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  get(token: string, eventId: string) {
    return this.auth.run(
      token,
      'schedules.read',
      eventId,
      {},
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        const row = await tx.eventSchedule.findUnique({ where: { eventId } });
        if (row) return this.view(tx, row);
        return {
          exists: false,
          eventId,
          format: 'ROUND_ROBIN' as const,
          status: 'DRAFT' as const,
          config: {
            teamIds: [],
            venues: [],
            startDate: '',
            endDate: '',
            dailyStart: '',
            dailyEnd: '',
            durationMinutes: 40,
            bufferMinutes: 10,
            minRestMinutes: 60,
          },
          matches: [],
          issues: [],
          revision: 0,
          publishedAt: '',
          updatedAt: '',
        };
      },
    );
  }

  generate(token: string, eventId: string, input: unknown) {
    return this.auth.run(
      token,
      'schedules.generate',
      eventId,
      input,
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        const body = bodyObject(input, ['commandId', 'format', 'config']);
        const commandId = uuid(body.commandId);
        if (
          !['ROUND_ROBIN', 'SINGLE_ELIMINATION'].includes(String(body.format))
        )
          throw new BadRequestException('Invalid schedule format');
        const format = body.format as 'ROUND_ROBIN' | 'SINGLE_ELIMINATION';
        const config = this.config(body.config);
        const teams = await this.teams(tx, eventId);
        if (
          config.teamIds.some(
            (id) => !teams.some((team) => team.id === id && team.active),
          )
        )
          throw new ConflictException('Selected team is unavailable');
        const commandHash = hash({ format, config });
        const current = await tx.eventSchedule.findUnique({
          where: { eventId },
        });
        if (current?.lastCommandId === commandId) {
          if (current.lastCommandHash !== commandHash)
            throw new ConflictException('Command conflict');
          return this.view(tx, current);
        }
        const generated = generateSchedule(format, config, teams, randomUUID);
        const revision = (current?.revision ?? 0) + 1;
        const data = {
          format,
          status: 'DRAFT' as const,
          config: json(config),
          matches: json(generated.matches),
          issues: json(generated.issues),
          revision,
          lastCommandId: commandId,
          lastCommandHash: commandHash,
          updatedBy: actor.id,
          updatedAt: new Date(),
          publishedBy: null,
          publishedAt: null,
        };
        const row = current
          ? await tx.eventSchedule.update({ where: { eventId }, data })
          : await tx.eventSchedule.create({
              data: { ...data, eventId, createdBy: actor.id },
            });
        await this.version(tx, row, actor.id);
        return this.view(tx, row);
      },
      { retries: 2, retryUnique: true },
    );
  }

  adjust(token: string, eventId: string, matchId: string, input: unknown) {
    return this.auth.run(
      token,
      'schedules.adjust',
      eventId,
      input,
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        const body = bodyObject(input, [
          'commandId',
          'expectedRevision',
          'startAt',
          'venue',
        ]);
        const commandId = uuid(body.commandId);
        const expectedRevision = Number(body.expectedRevision);
        const startAt = text(body.startAt, 40);
        const venue = text(body.venue, 80);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
          throw new BadRequestException('Invalid revision');
        if (!Number.isFinite(Date.parse(startAt)))
          throw new BadRequestException('Invalid start time');
        const current = await tx.eventSchedule.findUnique({
          where: { eventId },
        });
        if (!current) throw new ConflictException('Schedule not generated');
        const commandHash = hash({ expectedRevision, matchId, startAt, venue });
        if (current.lastCommandId === commandId) {
          if (current.lastCommandHash !== commandHash)
            throw new ConflictException('Command conflict');
          return this.view(tx, current);
        }
        if (current.revision !== expectedRevision)
          throw new ConflictException('Schedule revision changed');
        const config = current.config as unknown as ScheduleConfigDto;
        if (!config.venues.includes(venue))
          throw new BadRequestException('Venue is not configured');
        const matches = (current.matches as unknown as ScheduleMatchDto[]).map(
          (match) =>
            match.id === uuid(matchId) ? { ...match, startAt, venue } : match,
        );
        if (!matches.some((match) => match.id === matchId)) deny();
        const issues = validateSchedule(
          config,
          matches,
          await this.teams(tx, eventId),
        );
        const changed = await tx.eventSchedule.updateMany({
          where: { eventId, revision: expectedRevision },
          data: {
            status: 'DRAFT',
            matches: json(matches),
            issues: json(issues),
            revision: { increment: 1 },
            lastCommandId: commandId,
            lastCommandHash: commandHash,
            updatedBy: actor.id,
            updatedAt: new Date(),
            publishedBy: null,
            publishedAt: null,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Schedule revision changed');
        const row = (await tx.eventSchedule.findUnique({
          where: { eventId },
        }))!;
        await this.version(tx, row, actor.id);
        return this.view(tx, row);
      },
      { retries: 2, retryUnique: true },
    );
  }

  publish(token: string, eventId: string, input: unknown) {
    return this.auth.run(
      token,
      'schedules.publish',
      eventId,
      input,
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        const body = bodyObject(input, ['commandId', 'expectedRevision']);
        const commandId = uuid(body.commandId);
        const expectedRevision = Number(body.expectedRevision);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
          throw new BadRequestException('Invalid revision');
        const current = await tx.eventSchedule.findUnique({
          where: { eventId },
        });
        if (!current) throw new ConflictException('Schedule not generated');
        const commandHash = hash({ expectedRevision });
        if (current.lastCommandId === commandId) {
          if (current.lastCommandHash !== commandHash)
            throw new ConflictException('Command conflict');
          return this.view(tx, current);
        }
        if (current.revision !== expectedRevision)
          throw new ConflictException('Schedule revision changed');
        const issues = validateSchedule(
          current.config as unknown as ScheduleConfigDto,
          current.matches as unknown as ScheduleMatchDto[],
          await this.teams(tx, eventId),
        );
        if (issues.length)
          throw new ConflictException('Schedule has unresolved issues');
        const now = new Date();
        const changed = await tx.eventSchedule.updateMany({
          where: { eventId, revision: expectedRevision },
          data: {
            status: 'PUBLISHED',
            issues: json([]),
            revision: { increment: 1 },
            lastCommandId: commandId,
            lastCommandHash: commandHash,
            updatedBy: actor.id,
            updatedAt: now,
            publishedBy: actor.id,
            publishedAt: now,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Schedule revision changed');
        const row = (await tx.eventSchedule.findUnique({
          where: { eventId },
        }))!;
        await this.version(tx, row, actor.id);
        return this.view(tx, row);
      },
      { retries: 2, retryUnique: true },
    );
  }

  private version(tx: Tx, row: Plan, actorId: string) {
    return tx.eventScheduleVersion.create({
      data: {
        id: randomUUID(),
        eventId: row.eventId,
        format: row.format,
        status: row.status,
        config: row.config as Prisma.InputJsonValue,
        matches: row.matches as Prisma.InputJsonValue,
        issues: row.issues as Prisma.InputJsonValue,
        revision: row.revision,
        actorId,
      },
    });
  }
}
