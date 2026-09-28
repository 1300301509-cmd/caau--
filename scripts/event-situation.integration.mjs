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
  const division = await call('a', 'POST', `events/${eventId}/divisions`, {
    id: randomUUID(),
    name: '赛事情况测试组',
  });
  const masterIds = [];
  for (let index = 0; index < 2; index += 1) {
    const master = await call('a', 'POST', 'teams', {
      id: randomUUID(),
      organizationId: orgA,
      eventId,
      divisionId: division.id,
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
    masterIds.push(master.id);
  }
  const eventTeams = await call('a', 'GET', `events/${eventId}/teams`);
  const teamIds = masterIds.map(
    (id) => eventTeams.find((team) => team.teamId === id)?.id,
  );
  assert.ok(teamIds.every(Boolean));
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
    'event situation: headquarters roster stays read-only, other organizer denied and revisions conflict safely',
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
  await t.test(
    'event staff: shared management, idempotency, CAS, source snapshots and isolation',
    async () => {
      const payload = {
        id: randomUUID(),
        profile: {
          name: '合成名单裁判',
          roles: ['裁判', '技术代表'],
          duties: '负责执裁',
          contactPhone: '',
          organization: '合成单位',
          notes: '',
        },
      };
      const created = await call(
        'super',
        'POST',
        `events/${eventId}/staff`,
        payload,
      );
      assert.deepEqual(
        await call('super', 'POST', `events/${eventId}/staff`, payload),
        created,
      );
      assert.equal(
        (await call('a', 'GET', `events/${eventId}/staff`)).some(
          (r) => r.id === created.id,
        ),
        true,
      );
      await call('b', 'GET', `events/${eventId}/staff`, undefined, 403);
      await call(
        'b',
        'POST',
        `events/${eventId}/staff`,
        { ...payload, id: randomUUID() },
        403,
      );
      await call(
        'super',
        'POST',
        `events/${eventId}/staff`,
        { ...payload, profile: { ...payload.profile, name: '不同请求' } },
        409,
      );
      let staff = await call(
        'a',
        'PUT',
        `events/${eventId}/staff/${created.id}`,
        {
          expectedRevision: 1,
          active: true,
          profile: { ...payload.profile, duties: '承办方补充职责' },
        },
      );
      await call(
        'super',
        'PUT',
        `events/${eventId}/staff/${created.id}`,
        { expectedRevision: 1, active: false, profile: payload.profile },
        409,
      );
      const other = await call('super', 'POST', 'events', {
        name: '合成人员隔离赛事',
        description: '本地测试',
      });
      await call(
        'super',
        'PUT',
        `events/${other.id}/staff/${created.id}`,
        {
          expectedRevision: staff.revision,
          active: false,
          profile: payload.profile,
        },
        403,
      );
      const foreign = await call('super', 'POST', `events/${other.id}/staff`, {
        ...payload,
        id: randomUUID(),
      });
      const sourceMember = {
        ...official,
        sourceStaffId: staff.id,
        sourceStaffRevision: staff.revision,
        name: '伪造姓名',
      };
      const assignment = {
        expectedScheduleRevision: schedule.revision,
        expectedRevision: 1,
        staff: [sourceMember],
      };
      await call(
        'super',
        'PUT',
        `events/${eventId}/matches/${match.id}/staff`,
        {
          ...assignment,
          staff: [
            {
              ...sourceMember,
              sourceStaffId: foreign.id,
              sourceStaffRevision: 1,
            },
          ],
        },
        403,
      );
      const bound = await call(
        'super',
        'PUT',
        `events/${eventId}/matches/${match.id}/staff`,
        assignment,
      );
      assert.equal(bound.matches[0].staff[0].name, payload.profile.name);
      assert.equal(bound.matches[0].staff[0].sourceStaffId, staff.id);
      staff = await call('a', 'PUT', `events/${eventId}/staff/${staff.id}`, {
        expectedRevision: staff.revision,
        active: false,
        profile: { ...payload.profile, name: '合成更新姓名' },
      });
      const retained = await call(
        'super',
        'GET',
        `events/${eventId}/situation`,
      );
      assert.deepEqual(retained.matches[0].staff, bound.matches[0].staff);
      await call(
        'super',
        'PUT',
        `events/${eventId}/matches/${match.id}/staff`,
        {
          ...assignment,
          expectedRevision: 2,
          staff: [{ ...sourceMember, sourceStaffRevision: staff.revision }],
        },
        409,
      );
      const history = await call(
        'a',
        'GET',
        `events/${eventId}/staff/${staff.id}/history`,
      );
      assert.equal(history.length, 3);
      assert.equal(history[2].profile.name, payload.profile.name);
      assert.equal(history[0].actorId, users.a);
      assert.ok(history[0].createdAt);
      assert.ok(history[0].actorName);
      await assert.rejects(
        runtime.query(
          'UPDATE "EventStaffVersion" SET revision=99 WHERE "staffId"=$1',
          [staff.id],
        ),
      );
      const concurrent = await Promise.all(
        [true, false].map((active) =>
          fetch(`${base}/api/v1/events/${eventId}/staff/${staff.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${tokens.super}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              expectedRevision: staff.revision,
              active,
              profile: payload.profile,
            }),
          }).then((r) => r.status),
        ),
      );
      assert.deepEqual(concurrent.sort(), [200, 409]);
    },
  );
}
