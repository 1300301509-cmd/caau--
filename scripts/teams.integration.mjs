import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { teamsBrowserTest } from './teams-browser.integration.mjs';
export async function teamsIntegration(t, ctx) {
  const { base, tokens, users, members, orgA, sql, runtime, session } = ctx;
  for (const key of ['super', 'a', 'a2', 'b', 'manager', 'reviewer'])
    await session(key, users[key]);
  async function call(key, method, route, body, status = 200) {
    const r = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await r.json();
    assert.equal(
      r.status,
      status,
      `${key} ${method} ${route}: ${JSON.stringify(result)}`,
    );
    return result;
  }
  const p = {
    name: '合成球队 Alpha',
    contactName: '合成负责人',
    contactPhone: '13800000000',
    province: '广东省',
    city: '广州市',
    district: '',
    address: '',
    shortName: '',
    clubName: '',
    introduction: '合成测试',
    notes: '',
  };
  let team, entry, e1, e2, second;
  await t.test(
    'teams: manual creation, organization isolation, validation and idempotency',
    async () => {
      const body = { id: randomUUID(), organizationId: orgA, profile: p };
      team = await call('a', 'POST', 'teams', body);
      assert.equal(team.bound, false);
      assert.equal((await call('a', 'POST', 'teams', body)).id, team.id);
      await call(
        'a',
        'POST',
        'teams',
        { ...body, profile: { ...p, name: 'conflict' } },
        409,
      );
      await call('b', 'POST', 'teams', { ...body, id: randomUUID() }, 403);
      await call(
        'reviewer',
        'POST',
        'teams',
        { ...body, id: randomUUID() },
        403,
      );
      await call(
        'a',
        'POST',
        'teams',
        { ...body, id: randomUUID(), profile: { ...p, contactPhone: '' } },
        400,
      );
      assert.equal(
        (await call('b', 'GET', 'teams')).some((x) => x.id === team.id),
        false,
      );
      await call(
        'b',
        'PUT',
        `teams/${team.id}`,
        { expectedRevision: 1, active: true, profile: p },
        403,
      );
      // Same phone/name are allowed; they are not identity keys.
      second = await call('a', 'POST', 'teams', { ...body, id: randomUUID() });
      assert.notEqual(second.id, team.id);
    },
  );
  await t.test(
    'teams: event snapshot isolation in both directions and duplicate attachment',
    async () => {
      e1 = await call('super', 'POST', 'events', {
        name: '合成球队赛事一',
        description: 'team test',
      });
      e2 = await call('super', 'POST', 'events', {
        name: '合成球队赛事二',
        description: 'team test',
      });
      entry = await call('super', 'POST', `events/${e1.id}/teams`, {
        teamId: team.id,
      });
      await call('super', 'POST', `events/${e2.id}/teams`, { teamId: team.id });
      team = await call('a', 'PUT', `teams/${team.id}`, {
        expectedRevision: 1,
        active: true,
        profile: {
          ...p,
          name: '合成主档案已更新',
          contactPhone: '13900000000',
        },
      });
      assert.equal(
        (await call('super', 'GET', `events/${e1.id}/teams`))[0].profile.name,
        p.name,
      );
      assert.equal(
        (
          await call('super', 'POST', `events/${e1.id}/teams`, {
            teamId: team.id,
          })
        ).profile.name,
        p.name,
      );
      entry = await call('super', 'PUT', `events/${e1.id}/teams/${entry.id}`, {
        expectedRevision: 1,
        active: true,
        profile: { ...p, name: '合成本赛事专用资料' },
      });
      assert.equal(
        (await call('a', 'GET', 'teams')).find((x) => x.id === team.id).profile
          .name,
        '合成主档案已更新',
      );
      assert.equal(
        (await call('super', 'GET', `events/${e2.id}/teams`))[0].profile.name,
        p.name,
      );
      await call('a', 'GET', `events/${e1.id}/teams`, undefined, 403);
      await call(
        'super',
        'PUT',
        `events/${e2.id}/teams/${entry.id}`,
        { expectedRevision: entry.revision, active: true, profile: p },
        403,
      );
      await sql.query(
        'INSERT INTO "EventGrant" (id,"eventId","memberId",active) VALUES ($1,$2,$3,true)',
        [randomUUID(), e1.id, members.manager],
      );
      await call('manager', 'GET', `events/${e1.id}/teams`);
      await call('manager', 'GET', `events/${e2.id}/teams`, undefined, 403);
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [e1.id, members.manager],
      );
      await call('manager', 'GET', `events/${e1.id}/teams`, undefined, 403);
      // Organizer access depends on the approved appointment AND current handling permission.
      const appointment = (
        await sql.query(
          'SELECT "eventId" FROM "EventOrganizerAppointment" WHERE "organizationId"=$1 AND active=true LIMIT 1',
          [orgA],
        )
      ).rows[0];
      assert.ok(appointment);
      await sql.query(
        'UPDATE "HostingApplicationHandlerGrant" SET active=true WHERE "memberId"=$1',
        [members.a],
      );
      await call('a', 'POST', `events/${appointment.eventId}/teams`, {
        teamId: second.id,
      });
      await call(
        'b',
        'GET',
        `events/${appointment.eventId}/teams`,
        undefined,
        403,
      );
      await sql.query(
        'UPDATE "HostingApplicationHandlerGrant" SET active=false WHERE "memberId"=$1',
        [members.a],
      );
      await call(
        'a',
        'GET',
        `events/${appointment.eventId}/teams`,
        undefined,
        403,
      );
      await sql.query(
        'UPDATE "HostingApplicationHandlerGrant" SET active=true WHERE "memberId"=$1',
        [members.a],
      );
    },
  );
  await t.test(
    'teams: concurrent revision, immutable history, independent archive and membership scope',
    async () => {
      const body = {
        expectedRevision: team.revision,
        active: true,
        profile: team.profile,
      };
      const results = await Promise.all(
        [0, 1].map(() =>
          fetch(`${base}/api/v1/teams/${team.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${tokens.a}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      team = await results.find((r) => r.status === 200).json();
      await assert.rejects(
        runtime.query(
          'UPDATE "TeamVersion" SET active=false WHERE "teamId"=$1',
          [team.id],
        ),
      );
      await assert.rejects(
        runtime.query('DELETE FROM "EventTeamVersion" WHERE "eventTeamId"=$1', [
          entry.id,
        ]),
      );
      await assert.rejects(
        runtime.query(
          'UPDATE "EventTeam" SET "eventId"=$1,revision=revision+1 WHERE id=$2',
          [e2.id, entry.id],
        ),
      );
      await assert.rejects(
        runtime.query('DELETE FROM "Team" WHERE id=$1', [team.id]),
      );
      team = await call('a', 'PUT', `teams/${team.id}`, {
        expectedRevision: team.revision,
        active: false,
        profile: team.profile,
      });
      assert.equal(
        (await call('super', 'GET', `events/${e1.id}/teams`))[0].active,
        true,
      );
      entry = await call('super', 'PUT', `events/${e1.id}/teams/${entry.id}`, {
        expectedRevision: entry.revision,
        active: false,
        profile: entry.profile,
      });
      assert.equal(
        (await call('super', 'GET', `events/${e2.id}/teams`))[0].active,
        true,
      );
      const account = randomUUID();
      await sql.query(
        'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2)',
        [account, '合成球队账号'],
      );
      await session('teamAccount', account);
      await sql.query(
        'INSERT INTO "TeamMembership" (id,"teamId","userId") VALUES ($1,$2,$3)',
        [randomUUID(), team.id, account],
      );
      const owned = await call('teamAccount', 'GET', 'teams');
      assert.equal(owned.length, 1);
      assert.equal(owned[0].bound, true);
      await call('teamAccount', 'PUT', `teams/${team.id}`, {
        expectedRevision: team.revision,
        active: true,
        profile: team.profile,
      });
      await call(
        'a',
        'PUT',
        `teams/${team.id}`,
        { expectedRevision: team.revision + 1, active: true, profile: p },
        403,
      );
      await call('teamAccount', 'GET', `events/${e1.id}/teams`, undefined, 403);
      await sql.query(
        'UPDATE "TeamMembership" SET active=false WHERE "userId"=$1',
        [account],
      );
      assert.equal((await call('teamAccount', 'GET', 'teams')).length, 0);
      await sql.query('UPDATE "InternalUser" SET active=false WHERE id=$1', [
        account,
      ]);
      await call('teamAccount', 'GET', 'teams', undefined, 401);
      const versionCount = (
        await sql.query(
          'SELECT count(*)::int n FROM "TeamVersion" WHERE "teamId"=$1',
          [team.id],
        )
      ).rows[0].n;
      assert.equal(versionCount, team.revision + 1);
    },
  );
  await t.test(
    'teams: real API browser create/edit, event isolation and narrow viewport',
    async () => {
      await teamsBrowserTest({ ...ctx, eventId: e2.id });
    },
  );
}
