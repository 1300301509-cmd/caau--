import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventSituationBrowserTest } from './event-situation-browser.integration.mjs';

export async function eventSituationIntegration(t, context) {
  const { base, tokens, users, orgA, sql, runtime, session } = context;
  for (const key of ['super', 'manager', 'a', 'b'])
    await session(key, users[key]);

  async function call(key, method, route, body, status = 200) {
    const response = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(
      response.status,
      status,
      `${key} ${method} ${route}: ${JSON.stringify(result)}`,
    );
    return result;
  }

  const appointment = (
    await sql.query(
      'SELECT "eventId" FROM "EventOrganizerAppointment" WHERE "organizationId"=$1 AND active=true LIMIT 1',
      [orgA],
    )
  ).rows[0];
  assert.ok(appointment);
  const eventId = appointment.eventId;
  let eventTeams = await call('a', 'GET', `events/${eventId}/teams`);
  for (let index = eventTeams.length; index < 2; index += 1) {
    await call('a', 'POST', 'teams', {
      id: randomUUID(),
      organizationId: orgA,
      eventId,
      profile: {
        name: `赛事情况测试队${index + 1}`,
        contactName: `领队${index + 1}`,
        contactPhone: `1390000000${index + 1}`,
        province: '广东省',
        city: '广州市',
        district: '',
        address: '',
        shortName: '',
        clubName: '',
        introduction: '',
        notes: '',
      },
    });
  }
  eventTeams = (await call('a', 'GET', `events/${eventId}/teams`)).filter(
    (team) => team.active,
  );
  const teamIds = eventTeams.slice(0, 2).map((team) => team.id);
  let schedule = await call(
    'a',
    'POST',
    `events/${eventId}/schedule/generate`,
    {
      commandId: randomUUID(),
      format: 'ROUND_ROBIN',
      config: {
        teamIds,
        venues: ['总部测试馆'],
        startDate: '2027-07-12',
        endDate: '2027-07-12',
        dailyStart: '09:00',
        dailyEnd: '18:00',
        durationMinutes: 40,
        bufferMinutes: 10,
        minRestMinutes: 60,
      },
    },
  );
  schedule = await call('a', 'POST', `events/${eventId}/schedule/publish`, {
    commandId: randomUUID(),
    expectedRevision: schedule.revision,
  });
  const match = schedule.matches[0];
  const player = {
    id: randomUUID(),
    name: '测试球员一号',
    role: 'PLAYER',
    jerseyNumber: '7',
    position: '后卫',
    contactPhone: '13800138000',
    notes: '',
  };
  const official = {
    id: randomUUID(),
    name: '测试主裁判',
    role: '主裁判',
    organization: 'CAAU 裁判组',
    contactPhone: '13800138001',
    notes: '',
  };

  await t.test(
    'event situation: organizer records isolated event roster and published-match staff',
    async () => {
      const roster = await call(
        'a',
        'PUT',
        `events/${eventId}/teams/${teamIds[0]}/roster`,
        { expectedRevision: 0, members: [player] },
      );
      assert.equal(roster.revision, 1);
      assert.equal(roster.members[0].name, player.name);
      const situation = await call(
        'a',
        'PUT',
        `events/${eventId}/matches/${match.id}/staff`,
        {
          expectedScheduleRevision: schedule.revision,
          expectedRevision: 0,
          staff: [official],
        },
      );
      assert.equal(situation.scheduleRevision, schedule.revision);
      assert.equal(situation.matches[0].staff[0].name, official.name);
      assert.equal(
        situation.matches[0].homeTeam?.eventTeamId === teamIds[0] ||
          situation.matches[0].awayTeam?.eventTeamId === teamIds[0],
        true,
      );
    },
  );

  await t.test(
    'event situation: headquarters reads only, other organizer denied and revisions conflict safely',
    async () => {
      const situation = await call(
        'super',
        'GET',
        `events/${eventId}/situation`,
      );
      assert.equal(situation.matches.length, 1);
      assert.equal(situation.matches[0].staff.length, 1);
      await call(
        'super',
        'PUT',
        `events/${eventId}/teams/${teamIds[0]}/roster`,
        { expectedRevision: 1, members: [player] },
        403,
      );
      await call('b', 'GET', `events/${eventId}/situation`, undefined, 403);
      await call(
        'a',
        'PUT',
        `events/${eventId}/matches/${match.id}/staff`,
        {
          expectedScheduleRevision: schedule.revision,
          expectedRevision: 0,
          staff: [official],
        },
        409,
      );
      await assert.rejects(
        runtime.query(
          'UPDATE "EventTeamRosterVersion" SET revision=99 WHERE "rosterId"=$1',
          [teamIds[0]],
        ),
      );
    },
  );

  await t.test(
    'event situation: calendar and centered detail modal work with the real API',
    async () => {
      await eventSituationBrowserTest({
        ...context,
        eventId,
        player,
        official,
      });
    },
  );
}
