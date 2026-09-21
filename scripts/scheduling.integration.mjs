import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { schedulingBrowserTest } from './scheduling-browser.integration.mjs';

export async function schedulingIntegration(t, context) {
  const { base, tokens, users, members, orgA, sql, runtime, session } = context;
  for (const key of ['super', 'manager', 'reviewer', 'a'])
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
  const event = await call('super', 'POST', 'events', {
    name: '合成赛程赛事',
    description: 'scheduling test',
  });
  const profile = (index) => ({
    name: `合成赛程球队${index}`,
    contactName: `负责人${index}`,
    contactPhone: `1380000000${index}`,
    province: '广东省',
    city: '广州市',
    district: '',
    address: '',
    shortName: '',
    clubName: '',
    introduction: '',
    notes: '',
  });
  const teams = [];
  for (let index = 1; index <= 4; index += 1) {
    const master = await call('super', 'POST', 'teams', {
      id: randomUUID(),
      organizationId: orgA,
      eventId: event.id,
      profile: profile(index),
    });
    teams.push(master);
  }
  const eventTeams = await call('super', 'GET', `events/${event.id}/teams`);
  const teamIds = eventTeams.map((item) => item.id);
  const config = {
    teamIds,
    venues: ['一号场', '二号场'],
    startDate: '2027-06-01',
    endDate: '2027-06-02',
    dailyStart: '09:00',
    dailyEnd: '18:00',
    durationMinutes: 40,
    bufferMinutes: 10,
    minRestMinutes: 60,
  };
  await sql.query(
    'INSERT INTO "EventGrant" (id,"eventId","memberId",active) VALUES ($1,$2,$3,true)',
    [randomUUID(), event.id, members.manager],
  );

  let schedule;
  await t.test(
    'scheduling: round robin generation, idempotency, permissions and infeasible explanation',
    async () => {
      const commandId = randomUUID();
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId,
          format: 'ROUND_ROBIN',
          config,
        },
      );
      assert.equal(schedule.matches.length, 6);
      assert.equal(schedule.issues.length, 0);
      assert.equal(new Set(schedule.matches.map((item) => item.id)).size, 6);
      assert.equal(
        (
          await call(
            'manager',
            'POST',
            `events/${event.id}/schedule/generate`,
            {
              commandId,
              format: 'ROUND_ROBIN',
              config,
            },
          )
        ).revision,
        schedule.revision,
      );
      await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId,
          format: 'ROUND_ROBIN',
          config: { ...config, minRestMinutes: 30 },
        },
        409,
      );
      await call(
        'reviewer',
        'GET',
        `events/${event.id}/schedule`,
        undefined,
        403,
      );
      await call('a', 'GET', `events/${event.id}/schedule`, undefined, 403);
      const limited = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config: {
            ...config,
            venues: ['一号场'],
            endDate: config.startDate,
            dailyEnd: '10:00',
          },
        },
      );
      assert.ok(limited.issues.some((item) => item.code === 'UNSCHEDULED'));
      await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/publish`,
        { commandId: randomUUID(), expectedRevision: limited.revision },
        409,
      );
    },
  );

  await t.test(
    'scheduling: manual conflicts, CAS, publish versions and team state changes',
    async () => {
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config,
        },
      );
      const first = schedule.matches[0];
      const second = schedule.matches[1];
      const conflicted = await call(
        'manager',
        'PUT',
        `events/${event.id}/schedule/matches/${first.id}`,
        {
          commandId: randomUUID(),
          expectedRevision: schedule.revision,
          startAt: second.startAt,
          venue: second.venue,
        },
      );
      assert.ok(
        conflicted.issues.some((item) => item.code === 'VENUE_OVERLAP'),
      );
      await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/publish`,
        { commandId: randomUUID(), expectedRevision: conflicted.revision },
        409,
      );
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config,
        },
      );
      const revision = schedule.revision;
      const results = await Promise.all(
        [0, 1].map((offset) =>
          fetch(
            `${base}/api/v1/events/${event.id}/schedule/matches/${schedule.matches[0].id}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${tokens.manager}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                commandId: randomUUID(),
                expectedRevision: revision,
                startAt: new Date(
                  Date.parse(schedule.matches[0].startAt) +
                    offset * 60 * 60 * 1000,
                ).toISOString(),
                venue: schedule.matches[0].venue,
              }),
            },
          ),
        ),
      );
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config,
        },
      );
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/publish`,
        {
          commandId: randomUUID(),
          expectedRevision: schedule.revision,
        },
      );
      assert.equal(schedule.status, 'PUBLISHED');
      assert.ok(schedule.publishedAt);
      const version = (
        await sql.query(
          'SELECT status FROM "EventScheduleVersion" WHERE "eventId"=$1 AND revision=$2',
          [event.id, schedule.revision],
        )
      ).rows[0];
      assert.equal(version.status, 'PUBLISHED');
      await assert.rejects(
        runtime.query(
          'UPDATE "EventScheduleVersion" SET status=\'DRAFT\' WHERE "eventId"=$1',
          [event.id],
        ),
      );
      const team = eventTeams[0];
      const publishedBeforeExit = schedule;
      await call('super', 'PUT', `events/${event.id}/teams/${team.id}`, {
        expectedRevision: team.revision,
        active: false,
        profile: team.profile,
      });
      const scheduleAfterExit = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      assert.equal(scheduleAfterExit.status, 'PUBLISHED');
      assert.equal(scheduleAfterExit.revision, publishedBeforeExit.revision);
      assert.deepEqual(scheduleAfterExit.matches, publishedBeforeExit.matches);
      assert.ok(
        scheduleAfterExit.issues.some(
          (item) => item.code === 'TEAM_UNAVAILABLE',
        ),
      );
      const storedAfterExit = (
        await sql.query(
          'SELECT status, revision, matches, issues FROM "EventSchedule" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0];
      assert.equal(storedAfterExit.status, 'PUBLISHED');
      assert.equal(storedAfterExit.revision, publishedBeforeExit.revision);
      assert.deepEqual(storedAfterExit.matches, publishedBeforeExit.matches);
      assert.deepEqual(storedAfterExit.issues, []);
      await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config,
        },
        409,
      );
      await call('super', 'PUT', `events/${event.id}/teams/${team.id}`, {
        expectedRevision: team.revision + 1,
        active: true,
        profile: team.profile,
      });
    },
  );

  await t.test(
    'scheduling: elimination dependencies and immediate grant revocation',
    async () => {
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'SINGLE_ELIMINATION',
          config,
        },
      );
      assert.equal(schedule.matches.length, 3);
      assert.equal(schedule.matches[2].homeEventTeamId, '');
      assert.ok(schedule.matches[2].homeSourceMatchId);
      assert.equal(schedule.issues.length, 0);
      await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'SINGLE_ELIMINATION',
          config: { ...config, teamIds: teamIds.slice(0, 3) },
        },
        400,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
        undefined,
        403,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
    },
  );

  await t.test(
    'scheduling: real API browser generate, publish and responsive layout',
    async () => {
      await call('super', 'POST', `events/${event.id}/schedule/generate`, {
        commandId: randomUUID(),
        format: 'ROUND_ROBIN',
        config,
      });
      await schedulingBrowserTest({ ...context, eventId: event.id });
    },
  );
}
