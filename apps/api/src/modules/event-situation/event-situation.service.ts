import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import { type Actor, deny, eventOperations } from '../authorization/policy.js';
import type { ScheduleMatchDto } from '../scheduling/scheduling.dto.js';
import type { EventStaffProfileDto } from './event-staff.dto.js';
import {
  eventParticipantRoles,
  type EventParticipantDto,
  type EventSituationViewDto,
  type EventTeamRosterViewDto,
  type MatchStaffMemberDto,
} from './event-situation.dto.js';

type Tx = Prisma.TransactionClient;
const json = (value: unknown) => value as Prisma.InputJsonValue;

function integer(value: unknown, allowZero = false) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < (allowZero ? 0 : 1) ||
    Number(value) > 2_147_483_647
  )
    throw new BadRequestException('Invalid revision');
  return Number(value);
}

function optionalText(value: unknown, maximum: number) {
  if (value === undefined || value === '') return '';
  return text(value, maximum);
}

function phone(value: unknown) {
  const result = optionalText(value, 40);
  if (result && !/^[+\d][\d\s()-]{5,39}$/.test(result))
    throw new BadRequestException('Invalid contact phone');
  return result;
}

function participant(value: unknown): EventParticipantDto {
  const body = bodyObject(value, [
    'id',
    'name',
    'role',
    'jerseyNumber',
    'position',
    'contactPhone',
    'notes',
  ]);
  if (!eventParticipantRoles.includes(body.role as never))
    throw new BadRequestException('Invalid participant role');
  return {
    id: uuid(body.id),
    name: text(body.name, 80),
    role: body.role as EventParticipantDto['role'],
    jerseyNumber: optionalText(body.jerseyNumber, 12),
    position: optionalText(body.position, 40),
    contactPhone: phone(body.contactPhone),
    notes: optionalText(body.notes, 1000),
  };
}

function staffMember(value: unknown): MatchStaffMemberDto {
  const body = bodyObject(value, [
    'sourceStaffId',
    'sourceStaffRevision',
    'id',
    'name',
    'role',
    'organization',
    'contactPhone',
    'notes',
  ]);
  return {
    ...(body.sourceStaffId !== undefined
      ? {
          sourceStaffId: uuid(body.sourceStaffId),
          sourceStaffRevision: integer(body.sourceStaffRevision),
        }
      : {}),
    id: uuid(body.id),
    name: text(body.name, 80),
    role: text(body.role, 80),
    organization: optionalText(body.organization, 120),
    contactPhone: phone(body.contactPhone),
    notes: optionalText(body.notes, 1000),
  };
}

function list<T>(value: unknown, maximum: number, parse: (item: unknown) => T) {
  if (!Array.isArray(value) || value.length > maximum)
    throw new BadRequestException('Invalid list');
  const rows = value.map(parse);
  if (
    new Set(rows.map((row) => (row as { id: string }).id)).size !== rows.length
  )
    throw new BadRequestException('Duplicate member id');
  return rows;
}

function profileName(profile: Prisma.JsonValue) {
  return profile &&
    typeof profile === 'object' &&
    !Array.isArray(profile) &&
    typeof profile.name === 'string'
    ? profile.name
    : '未命名球队';
}

@Injectable()
export class EventSituationService {
  constructor(private readonly auth: AuthorizationService) {}

  private async readAccess(tx: Tx, actor: Actor, eventId: string) {
    uuid(eventId);
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) deny();
    await eventOperations(tx, actor, eventId);
    return event;
  }

  private async writeAccess(tx: Tx, actor: Actor, eventId: string) {
    await this.readAccess(tx, actor, eventId);
    const organizationIds = actor.memberships
      .filter((member) => member.active && member.role === 'ORGANIZER')
      .map((member) => member.organizationId);
    if (!organizationIds.length) deny();
    const handlers = await tx.hostingApplicationHandlerGrant.findMany({
      where: {
        active: true,
        organizationId: { in: organizationIds },
        member: { userId: actor.id, active: true, role: 'ORGANIZER' },
      },
      select: { organizationId: true },
    });
    if (
      !(await tx.eventOrganizerAppointment.findFirst({
        where: {
          eventId,
          active: true,
          organizationId: { in: handlers.map((row) => row.organizationId) },
        },
      }))
    )
      deny();
  }

  private async view(tx: Tx, eventId: string): Promise<EventSituationViewDto> {
    const [event, schedule, teams] = await Promise.all([
      tx.event.findUniqueOrThrow({ where: { id: eventId } }),
      tx.eventSchedule.findUnique({ where: { eventId } }),
      tx.eventTeam.findMany({
        where: { eventId },
        include: { roster: true },
      }),
    ]);
    if (!schedule)
      return {
        exists: false,
        eventId,
        eventName: event.name,
        scheduleStatus: 'DRAFT',
        scheduleRevision: 0,
        matches: [],
        updatedAt: '',
      };
    const staffRows = await tx.eventMatchStaff.findMany({
      where: { eventId, scheduleRevision: schedule.revision },
    });
    const teamMap = new Map(
      teams.map((team) => {
        const roster: EventTeamRosterViewDto = {
          eventTeamId: team.id,
          teamName: profileName(team.profile),
          members: (team.roster?.members ??
            []) as unknown as EventParticipantDto[],
          revision: team.roster?.revision ?? 0,
          updatedAt: team.roster?.updatedAt.toISOString() ?? '',
        };
        return [team.id, roster] as const;
      }),
    );
    const staffMap = new Map(staffRows.map((row) => [row.matchId, row]));
    return {
      exists: true,
      eventId,
      eventName: event.name,
      scheduleStatus: schedule.status,
      scheduleRevision: schedule.revision,
      matches: (schedule.matches as unknown as ScheduleMatchDto[]).map(
        (match) => {
          const staff = staffMap.get(match.id);
          return {
            id: match.id,
            round: match.round,
            order: match.order,
            startAt: match.startAt,
            venue: match.venue,
            homeLabel: match.homeLabel,
            awayLabel: match.awayLabel,
            homeTeam: teamMap.get(match.homeEventTeamId) ?? null,
            awayTeam: teamMap.get(match.awayEventTeamId) ?? null,
            staff: (staff?.staff ?? []) as unknown as MatchStaffMemberDto[],
            staffRevision: staff?.revision ?? 0,
          };
        },
      ),
      updatedAt: schedule.updatedAt.toISOString(),
    };
  }

  get(token: string, eventId: string) {
    return this.auth.run(
      token,
      'eventSituation.get',
      eventId,
      {},
      async (tx, actor) => {
        await this.readAccess(tx, actor, eventId);
        return this.view(tx, eventId);
      },
    );
  }

  replaceRoster(
    token: string,
    eventId: string,
    eventTeamId: string,
    input: unknown,
  ) {
    return this.auth.run(
      token,
      'eventSituation.roster.replace',
      eventTeamId,
      input,
      async (tx, actor) => {
        await this.writeAccess(tx, actor, eventId);
        const team = await tx.eventTeam.findFirst({
          where: {
            id: uuid(eventTeamId),
            eventId: uuid(eventId),
            active: true,
          },
        });
        if (!team) deny();
        const body = bodyObject(input, ['expectedRevision', 'members']);
        const expectedRevision = integer(body.expectedRevision, true);
        const members = list(body.members, 100, participant);
        let roster = await tx.eventTeamRoster.findUnique({
          where: { eventTeamId },
        });
        if (!roster) {
          if (expectedRevision !== 0)
            throw new ConflictException('参赛名单已更新，请刷新后重试');
          roster = await tx.eventTeamRoster.create({
            data: {
              eventTeamId,
              members: json(members),
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          });
        } else {
          if (expectedRevision === 0)
            throw new ConflictException('参赛名单已更新，请刷新后重试');
          const changed = await tx.eventTeamRoster.updateMany({
            where: { eventTeamId, revision: expectedRevision },
            data: {
              members: json(members),
              revision: { increment: 1 },
              updatedBy: actor.id,
              updatedAt: new Date(),
            },
          });
          if (changed.count !== 1)
            throw new ConflictException('参赛名单已更新，请刷新后重试');
          roster = (await tx.eventTeamRoster.findUnique({
            where: { eventTeamId },
          }))!;
        }
        await tx.eventTeamRosterVersion.create({
          data: {
            id: randomUUID(),
            rosterId: eventTeamId,
            members: roster.members as Prisma.InputJsonValue,
            revision: roster.revision,
            actorId: actor.id,
          },
        });
        return {
          eventTeamId,
          teamName: profileName(team.profile),
          members: roster.members as unknown as EventParticipantDto[],
          revision: roster.revision,
          updatedAt: roster.updatedAt.toISOString(),
        };
      },
      { retries: 2, retryUnique: true },
    );
  }

  replaceStaff(
    token: string,
    eventId: string,
    matchId: string,
    input: unknown,
  ) {
    return this.auth.run(
      token,
      'eventSituation.staff.replace',
      matchId,
      input,
      async (tx, actor) => {
        await this.readAccess(tx, actor, eventId);
        const body = bodyObject(input, [
          'expectedScheduleRevision',
          'expectedRevision',
          'staff',
        ]);
        const scheduleRevision = integer(body.expectedScheduleRevision);
        const expectedRevision = integer(body.expectedRevision, true);
        const staff = list(body.staff, 30, staffMember);
        for (const member of staff) {
          if (!member.sourceStaffId) continue;
          const source = await tx.eventStaff.findFirst({
            where: { id: member.sourceStaffId, eventId },
          });
          if (!source) deny();
          if (!source.active || source.revision !== member.sourceStaffRevision)
            throw new ConflictException('人员已停用或资料已更新，请重新选择');
          const profile = source.profile as unknown as EventStaffProfileDto;
          member.name = profile.name;
          member.contactPhone = profile.contactPhone;
          member.organization = profile.organization;
        }
        const schedule = await tx.eventSchedule.findUnique({
          where: { eventId },
        });
        if (
          !schedule ||
          schedule.status !== 'PUBLISHED' ||
          schedule.revision !== scheduleRevision
        )
          throw new ConflictException('请先发布并刷新当前赛程');
        const normalizedMatchId = uuid(matchId);
        if (
          !(schedule.matches as unknown as ScheduleMatchDto[]).some(
            (match) => match.id === normalizedMatchId,
          )
        )
          deny();
        const key = {
          eventId_scheduleRevision_matchId: {
            eventId,
            scheduleRevision,
            matchId: normalizedMatchId,
          },
        };
        let row = await tx.eventMatchStaff.findUnique({ where: key });
        if (!row) {
          if (expectedRevision !== 0)
            throw new ConflictException('工作人员信息已更新，请刷新后重试');
          row = await tx.eventMatchStaff.create({
            data: {
              id: randomUUID(),
              eventId,
              scheduleRevision,
              matchId: normalizedMatchId,
              staff: json(staff),
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          });
        } else {
          if (expectedRevision === 0)
            throw new ConflictException('工作人员信息已更新，请刷新后重试');
          const changed = await tx.eventMatchStaff.updateMany({
            where: { id: row.id, revision: expectedRevision },
            data: {
              staff: json(staff),
              revision: { increment: 1 },
              updatedBy: actor.id,
              updatedAt: new Date(),
            },
          });
          if (changed.count !== 1)
            throw new ConflictException('工作人员信息已更新，请刷新后重试');
          row = (await tx.eventMatchStaff.findUnique({
            where: { id: row.id },
          }))!;
        }
        await tx.eventMatchStaffVersion.create({
          data: {
            id: randomUUID(),
            matchStaffId: row.id,
            staff: row.staff as Prisma.InputJsonValue,
            revision: row.revision,
            actorId: actor.id,
          },
        });
        return this.view(tx, eventId);
      },
      { retries: 2, retryUnique: true },
    );
  }
}
