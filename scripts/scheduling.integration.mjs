import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { schedulingBrowserTest } from './scheduling-browser.integration.mjs';
import { createApiClient } from '../packages/api-client/dist/index.js';
import { createTaroTransport } from '../packages/api-client/dist/taro.js';

export async function schedulingIntegration(t, context) {
  let { base } = context;
  const {
    tokens,
    users,
    members,
    orgA,
    sql,
    runtime,
    session,
    getAgentModelCalls,
    restartApi,
  } = context;
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
    'agent: durable multi-turn graph, selections, switching, concurrency and revocation',
    async () => {
      const weekendConfig = {
        ...config,
        startDate: '2027-06-05',
        endDate: '2027-06-06',
      };
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config: weekendConfig,
        },
      );
      const baseline = {
        revision: schedule.revision,
        matches: schedule.matches,
        versions: (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
      };
      const modelStatus = await call('super', 'GET', 'agent/model-status');
      assert.deepEqual(modelStatus, {
        mode: 'SIMULATED',
        modelName: 'deterministic-rule-parser',
        baseUrlHost: null,
        credentialsConfigured: false,
        lastConnectionTest: {
          status: 'NOT_TESTED',
          testedAt: null,
          message: '尚未执行连接测试',
        },
      });
      await call('manager', 'GET', 'agent/model-status', undefined, 403);
      const testedModel = await call(
        'super',
        'POST',
        'agent/model-status/test',
        {},
      );
      assert.equal(testedModel.lastConnectionTest.status, 'NOT_APPLICABLE');
      assert.ok(testedModel.lastConnectionTest.testedAt);
      assert.ok(!JSON.stringify(testedModel).includes(tokens.super));

      const agentSession = await call('manager', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const waiting = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        {
          message: '把周六第二场移到周日',
          eventId: event.id,
          newTask: true,
        },
      );
      assert.equal(waiting.status, 'NEED_PARAMETERS');
      assert.deepEqual(waiting.task.pendingFields, ['targetTime']);
      assert.equal(waiting.task.parameters.sourceWeekday, 6);
      assert.equal(waiting.task.parameters.sourceOrdinal, 2);
      assert.equal(waiting.task.parameters.targetWeekday, 7);
      assert.ok(waiting.task.parameters.sourceMatchId);
      const durable = (
        await sql.query(
          'SELECT "checkpointThreadId" FROM "AgentTask" WHERE id=$1',
          [waiting.task.id],
        )
      ).rows[0];
      assert.ok(
        (
          await sql.query(
            'SELECT count(*)::int n FROM caau_agent.checkpoints WHERE thread_id=$1',
            [durable.checkpointThreadId],
          )
        ).rows[0].n > 0,
      );

      base = await restartApi();
      const ten = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '上午十点', taskId: waiting.task.id },
      );
      assert.equal(ten.status, 'PREVIEW');
      assert.equal(ten.task.id, waiting.task.id);
      assert.equal(ten.task.parameters.targetHour, 10);
      assert.equal(ten.task.parameters.targetMinute, 0);
      assert.match(ten.task.parameters.targetStartAt, /T02:00:00\.000Z$/);
      const later = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '再晚半小时', taskId: waiting.task.id },
      );
      assert.equal(later.status, 'PREVIEW');
      assert.equal(later.task.id, waiting.task.id);
      assert.equal(later.task.parameters.targetHour, 10);
      assert.equal(later.task.parameters.targetMinute, 30);
      assert.match(later.task.parameters.targetStartAt, /T02:30:00\.000Z$/);

      const saturday = baseline.matches
        .filter(
          (match) =>
            new Date(Date.parse(match.startAt) + 8 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10) === '2027-06-05',
        )
        .sort(
          (left, right) =>
            Date.parse(left.startAt) - Date.parse(right.startAt) ||
            left.order - right.order,
        );
      assert.ok(saturday.length >= 3);
      const thirdMatch = saturday[2];
      const changedSource = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '换成周六第三场', taskId: waiting.task.id },
      );
      assert.equal(changedSource.status, 'PREVIEW');
      assert.equal(changedSource.task.matchId, thirdMatch.id);
      assert.equal(changedSource.task.parameters.sourceMatchId, thirdMatch.id);
      assert.equal(changedSource.task.parameters.sourceOrdinal, 3);
      assert.equal(changedSource.task.preview.before.id, thirdMatch.id);
      assert.notEqual(changedSource.task.matchId, waiting.task.matchId);

      const explicitDate = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        {
          message: '改到2027-06-08上午十点',
          taskId: waiting.task.id,
        },
      );
      assert.equal(explicitDate.status, 'PREVIEW');
      assert.equal(explicitDate.task.parameters.targetWeekday, undefined);
      assert.equal(explicitDate.task.parameters.targetDate, '2027-06-08');
      assert.equal(
        explicitDate.task.parameters.targetStartAt,
        '2027-06-08T02:00:00.000Z',
      );
      assert.equal(explicitDate.task.preview.before.id, thirdMatch.id);
      assert.equal(
        explicitDate.task.preview.after.startAt,
        '2027-06-08T02:00:00.000Z',
      );

      const weekdayAgain = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '改到周日晚上十一点半', taskId: waiting.task.id },
      );
      assert.equal(weekdayAgain.task.parameters.targetWeekday, 7);
      assert.equal(weekdayAgain.task.parameters.targetDate, '2027-06-06');
      assert.equal(
        weekdayAgain.task.parameters.targetStartAt,
        '2027-06-06T15:30:00.000Z',
      );
      const crossWeek = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '再晚一小时', taskId: waiting.task.id },
      );
      assert.equal(crossWeek.status, 'PREVIEW');
      assert.equal(crossWeek.task.parameters.targetWeekday, undefined);
      assert.equal(crossWeek.task.parameters.targetDate, '2027-06-07');
      assert.equal(crossWeek.task.parameters.targetHour, 0);
      assert.equal(crossWeek.task.parameters.targetMinute, 30);
      assert.equal(
        crossWeek.task.parameters.targetStartAt,
        '2027-06-06T16:30:00.000Z',
      );
      assert.equal(
        crossWeek.task.preview.after.startAt,
        '2027-06-06T16:30:00.000Z',
      );
      assert.equal(
        (
          await sql.query(
            'SELECT "checkpointThreadId" FROM "AgentTask" WHERE id=$1',
            [crossWeek.task.id],
          )
        ).rows[0].checkpointThreadId,
        durable.checkpointThreadId,
      );
      const checkpoints = (
        await sql.query(
          'SELECT checkpoint::text, metadata::text FROM caau_agent.checkpoints WHERE thread_id=$1',
          [durable.checkpointThreadId],
        )
      ).rows;
      const persistedCheckpoint = JSON.stringify(checkpoints);
      assert.ok(!persistedCheckpoint.includes(tokens.manager));
      assert.ok(!persistedCheckpoint.includes('把周六第二场移到周日'));

      await call(
        'reviewer',
        'GET',
        `agent/sessions/${agentSession.id}`,
        undefined,
        403,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      const callsBeforeDeniedPost = getAgentModelCalls();
      await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '改到十一点', taskId: waiting.task.id },
        403,
      );
      assert.equal(getAgentModelCalls(), callsBeforeDeniedPost);
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      const afterAgentPreviews = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      assert.equal(afterAgentPreviews.revision, baseline.revision);
      assert.deepEqual(afterAgentPreviews.matches, baseline.matches);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        baseline.versions,
      );

      const changed = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config: weekendConfig,
        },
      );
      assert.ok(changed.revision > baseline.revision);
      const stale = await call(
        'manager',
        'GET',
        `agent/sessions/${agentSession.id}`,
      );
      assert.equal(stale.task.step, 'STALE');
      assert.equal(stale.task.preview, null);

      const selectionSession = await call(
        'super',
        'POST',
        'agent/sessions',
        {},
      );
      const chooseEvent = await call(
        'super',
        'POST',
        `agent/sessions/${selectionSession.id}/messages`,
        { message: '把比赛改到周日十点', newTask: true },
      );
      assert.equal(chooseEvent.status, 'NEED_EVENT');
      assert.ok(chooseEvent.candidates.length > 1);
      const chooseMatch = await call(
        'super',
        'POST',
        `agent/sessions/${selectionSession.id}/messages`,
        {
          message: '选择这个赛事',
          taskId: chooseEvent.task.id,
          eventId: event.id,
        },
      );
      assert.equal(chooseMatch.status, 'NEED_MATCH');
      assert.equal(chooseMatch.task.id, chooseEvent.task.id);
      const selected = await call(
        'super',
        'POST',
        `agent/sessions/${selectionSession.id}/messages`,
        {
          message: '选择这场',
          taskId: chooseEvent.task.id,
          eventId: event.id,
          matchId: chooseMatch.candidates[0].id,
        },
      );
      assert.equal(selected.status, 'PREVIEW');
      assert.equal(selected.task.id, chooseEvent.task.id);
      assert.equal(selected.task.parameters.targetHour, 10);

      const otherEvent = await call('super', 'POST', 'events', {
        name: '合成智能体切换赛事',
        description: 'agent switch isolation',
      });
      const switched = await call(
        'super',
        'POST',
        `agent/sessions/${selectionSession.id}/messages`,
        {
          message: '切换赛事后重新处理',
          taskId: selected.task.id,
          eventId: otherEvent.id,
        },
      );
      assert.equal(switched.status, 'ERROR');
      assert.notEqual(switched.task.id, selected.task.id);
      assert.deepEqual(switched.task.parameters, {});

      const concurrentSession = await call(
        'manager',
        'POST',
        'agent/sessions',
        {
          currentEventId: event.id,
        },
      );
      const concurrentWaiting = await call(
        'manager',
        'POST',
        `agent/sessions/${concurrentSession.id}/messages`,
        {
          message: '把周六第二场移到周日',
          eventId: event.id,
          newTask: true,
        },
      );
      const concurrentResponses = await Promise.all(
        ['上午十点', '上午十一点'].map((message) =>
          fetch(
            `${base}/api/v1/agent/sessions/${concurrentSession.id}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokens.manager}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message,
                taskId: concurrentWaiting.task.id,
              }),
            },
          ),
        ),
      );
      assert.deepEqual(
        concurrentResponses.map((response) => response.status).sort(),
        [200, 409],
      );
      const concurrentState = await call(
        'manager',
        'GET',
        `agent/sessions/${concurrentSession.id}`,
      );
      assert.equal(concurrentState.task.id, concurrentWaiting.task.id);
      assert.ok([10, 11].includes(concurrentState.task.parameters.targetHour));
      assert.equal(concurrentState.task.parameters.targetMinute, 0);

      const unchanged = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      assert.equal(unchanged.revision, changed.revision);
      assert.deepEqual(unchanged.matches, changed.matches);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        baseline.versions + 1,
      );
    },
  );

  await t.test(
    'agent C1: permission split, bound confirmation and exactly-once draft adjustment',
    async () => {
      const weekendConfig = {
        ...config,
        startDate: '2027-06-05',
        endDate: '2027-06-06',
      };
      schedule = await call(
        'manager',
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config: weekendConfig,
        },
      );
      await sql.query(
        'INSERT INTO "EventGrant" (id,"eventId","memberId",active) VALUES ($1,$2,$3,true) ON CONFLICT ("eventId","memberId") DO UPDATE SET active=true',
        [randomUUID(), event.id, members.reviewer],
      );
      await call('reviewer', 'GET', `events/${event.id}/schedule`);
      await call(
        'reviewer',
        'POST',
        `events/${event.id}/schedule/preview-adjustment`,
        {
          expectedRevision: schedule.revision,
          matchId: schedule.matches[0].id,
          startAt: schedule.matches[0].startAt,
          venue: schedule.matches[0].venue,
        },
      );
      await call(
        'reviewer',
        'PUT',
        `events/${event.id}/schedule/matches/${schedule.matches[0].id}`,
        {
          commandId: randomUUID(),
          expectedRevision: schedule.revision,
          startAt: schedule.matches[0].startAt,
          venue: schedule.matches[0].venue,
        },
        403,
      );
      await call(
        'reviewer',
        'POST',
        `events/${event.id}/schedule/publish`,
        { commandId: randomUUID(), expectedRevision: schedule.revision },
        403,
      );

      const agentSession = await call('manager', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const beforeModelFailure = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const ticketsBeforeModelFailure = (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentConfirmationTicket" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        {
          message: '__CAAU_SYNTHETIC_MODEL_TIMEOUT__',
          eventId: event.id,
          newTask: true,
        },
        503,
      );
      assert.equal(
        (await call('manager', 'GET', `events/${event.id}/schedule`)).revision,
        beforeModelFailure.revision,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentConfirmationTicket" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        ticketsBeforeModelFailure,
      );
      const issue = async () => {
        const response = await call(
          'manager',
          'POST',
          `agent/sessions/${agentSession.id}/messages`,
          {
            message: '把周六第二场比赛改到周日十点',
            eventId: event.id,
            newTask: true,
          },
        );
        assert.equal(response.status, 'PREVIEW');
        assert.equal(response.task.confirmation.state, 'PENDING');
        assert.equal(response.task.confirmation.actorId, users.manager);
        assert.equal(response.task.confirmation.eventId, event.id);
        assert.equal(
          response.task.confirmation.matchId,
          response.task.preview.before.id,
        );
        assert.equal(
          response.task.confirmation.expectedRevision,
          response.task.preview.baselineRevision,
        );
        assert.equal(response.task.confirmation.toolVersion, 'v1');
        assert.equal(response.task.confirmation.parameterHash.length, 64);
        return response;
      };
      const confirmBody = (response) => ({
        eventId: response.task.confirmation.eventId,
        matchId: response.task.confirmation.matchId,
        parameterHash: response.task.confirmation.parameterHash,
      });

      const bound = await issue();
      const boundId = bound.task.confirmation.id;
      await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${boundId}/confirm`,
        { ...confirmBody(bound), eventId: randomUUID() },
        409,
      );
      await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${boundId}/confirm`,
        { ...confirmBody(bound), parameterHash: '0'.repeat(64) },
        409,
      );
      await call(
        'reviewer',
        'POST',
        `agent/confirmation-tickets/${boundId}/confirm`,
        confirmBody(bound),
        403,
      );
      const expiredId = randomUUID();
      await sql.query(
        `INSERT INTO "AgentConfirmationTicket" (id,"taskId","ownerId","actorDisplayName","eventId","eventName","matchId","startAt",venue,"expectedRevision","parameterSummary","parameterHash","toolName","toolVersion","commandId",state,"expiresAt","createdAt")
         SELECT $1,"taskId","ownerId","actorDisplayName","eventId","eventName","matchId","startAt",venue,"expectedRevision","parameterSummary","parameterHash","toolName","toolVersion",$2,'PENDING',now()-interval '1 minute',now()
         FROM "AgentConfirmationTicket" WHERE id=$3`,
        [expiredId, randomUUID(), boundId],
      );
      await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${expiredId}/confirm`,
        confirmBody(bound),
        409,
      );
      const cancelled = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${boundId}/cancel`,
        {},
      );
      assert.deepEqual(cancelled, { id: boundId, state: 'CANCELLED' });
      assert.deepEqual(
        await call(
          'manager',
          'POST',
          `agent/confirmation-tickets/${boundId}/cancel`,
          {},
        ),
        cancelled,
      );
      await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${boundId}/confirm`,
        confirmBody(bound),
        409,
      );

      const revoked = await issue();
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${revoked.task.confirmation.id}/confirm`,
        confirmBody(revoked),
        403,
      );
      for (const ticketId of [revoked.task.confirmation.id, boundId]) {
        const denial = await call(
          'manager',
          'POST',
          `agent/confirmation-tickets/${ticketId}/cancel`,
          {},
          403,
        );
        assert.equal(denial.statusCode, 403);
        const serialized = JSON.stringify(denial);
        for (const privateValue of [
          revoked.task.confirmation.eventName,
          revoked.task.confirmation.parameterSummary.homeLabel,
          revoked.task.confirmation.parameterSummary.afterVenue,
          revoked.task.confirmation.parameterHash,
        ])
          assert.ok(!serialized.includes(privateValue));
      }
      assert.deepEqual(
        await call(
          'manager',
          'POST',
          `agent/confirmation-tickets/${revoked.task.confirmation.id}/cancel`,
          {},
          403,
        ),
        { message: 'Access denied', error: 'Forbidden', statusCode: 403 },
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );

      const stale = await issue();
      const current = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const other = current.matches.find(
        (match) => match.id !== stale.task.confirmation.matchId,
      );
      await call(
        'manager',
        'PUT',
        `events/${event.id}/schedule/matches/${other.id}`,
        {
          commandId: randomUUID(),
          expectedRevision: current.revision,
          startAt: other.startAt,
          venue: other.venue,
        },
      );
      await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${stale.task.confirmation.id}/confirm`,
        confirmBody(stale),
        409,
      );

      const executable = await issue();
      const before = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const versionsBefore = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const url = `${base}/api/v1/agent/confirmation-tickets/${executable.task.confirmation.id}/confirm`;
      const responses = await Promise.all(
        [0, 1].map(() =>
          fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.manager}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(confirmBody(executable)),
          }),
        ),
      );
      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
      );
      const results = await Promise.all(
        responses.map((response) => response.json()),
      );
      assert.equal(new Set(results.map((result) => result.revision)).size, 1);
      assert.equal(new Set(results.map((result) => result.commandId)).size, 1);
      assert.deepEqual(results.map((result) => result.replayed).sort(), [
        false,
        true,
      ]);
      const saved = await call('manager', 'GET', `events/${event.id}/schedule`);
      assert.equal(saved.revision, before.revision + 1);
      assert.equal(saved.status, 'DRAFT');
      assert.equal(
        saved.matches.find(
          (match) => match.id === executable.task.confirmation.matchId,
        ).startAt,
        executable.task.confirmation.parameterSummary.afterStartAt,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        versionsBefore + 1,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentCommandReceipt" WHERE "ticketId"=$1',
            [executable.task.confirmation.id],
          )
        ).rows[0].n,
        1,
      );
      base = await restartApi();
      const replay = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${executable.task.confirmation.id}/confirm`,
        confirmBody(executable),
      );
      assert.equal(replay.replayed, true);
      assert.equal(replay.revision, saved.revision);
      const recovered = await call(
        'manager',
        'GET',
        `agent/sessions/${agentSession.id}`,
      );
      assert.equal(recovered.lastExecution.result.commandId, replay.commandId);
      assert.equal(recovered.lastExecution.result.revision, saved.revision);
      assert.ok(recovered.lastExecution.executedAt);
      assert.equal(
        (await call('manager', 'GET', `events/${event.id}/schedule`)).revision,
        saved.revision,
      );
      const responseLost = await issue();
      const sent = await fetch(
        `${base}/api/v1/agent/confirmation-tickets/${responseLost.task.confirmation.id}/confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.manager}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(confirmBody(responseLost)),
        },
      );
      assert.equal(sent.status, 200);
      // Deliberately discard the committed HTTP response, as if the client lost it.
      await sent.body?.cancel();
      const restored = await call(
        'manager',
        'GET',
        `agent/sessions/${agentSession.id}`,
      );
      assert.equal(
        restored.lastExecution.result.ticketId,
        responseLost.task.confirmation.id,
      );
      assert.equal(restored.lastExecution.result.revision, saved.revision + 1);
      assert.notEqual(
        restored.lastExecution.result.commandId,
        replay.commandId,
      );
      const historical = restored.lastExecution.result;
      const otherAccount = await call(
        'reviewer',
        'GET',
        `agent/sessions/${agentSession.id}`,
        undefined,
        403,
      );
      assert.ok(!JSON.stringify(otherAccount).includes(historical.commandId));
      const retried = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${responseLost.task.confirmation.id}/confirm`,
        confirmBody(responseLost),
      );
      assert.equal(retried.replayed, true);
      assert.equal(retried.commandId, historical.commandId);
      assert.equal(retried.revision, historical.revision);
      assert.equal(
        (await call('manager', 'GET', `events/${event.id}/schedule`)).revision,
        historical.revision,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        versionsBefore + 2,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentCommandReceipt" WHERE "ticketId"=$1',
            [responseLost.task.confirmation.id],
          )
        ).rows[0].n,
        1,
      );
      await call('manager', 'POST', `events/${event.id}/schedule/generate`, {
        commandId: randomUUID(),
        format: 'ROUND_ROBIN',
        config: weekendConfig,
      });
      const currentSchedule = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      assert.ok(currentSchedule.revision > historical.revision);
      assert.equal(
        (await call('manager', 'GET', `agent/sessions/${agentSession.id}`))
          .lastExecution.result.revision,
        historical.revision,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      const deniedReceipt = await call(
        'manager',
        'GET',
        `agent/sessions/${agentSession.id}`,
        undefined,
        403,
      );
      assert.ok(!JSON.stringify(deniedReceipt).includes(historical.commandId));
      assert.ok(
        !(await call('manager', 'GET', 'agent/sessions')).some(
          (item) => item.id === agentSession.id,
        ),
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
    },
  );

  await t.test(
    'agent C1: organizer uses the portable miniapp transport on isolated synthetic data',
    async () => {
      const appointment = (
        await sql.query(
          'SELECT id,"eventId" FROM "EventOrganizerAppointment" WHERE "organizationId"=$1 AND active=true LIMIT 1',
          [orgA],
        )
      ).rows[0];
      assert.ok(appointment);
      const eventId = appointment.eventId;
      const mobile = createApiClient(
        base,
        createTaroTransport(async ({ url, method, header, data, timeout }) => {
          const response = await fetch(url, {
            method,
            headers: header,
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
            signal: AbortSignal.timeout(timeout),
          });
          return { statusCode: response.status, data: await response.json() };
        }),
      );
      const token = tokens.a;
      try {
        const teamIds = [];
        for (let index = 1; index <= 4; index++) {
          const team = await call('super', 'POST', 'teams', {
            id: randomUUID(),
            organizationId: orgA,
            eventId,
            profile: {
              name: `Miniapp agent synthetic team ${index}`,
              contactName: 'Synthetic contact',
              contactPhone: `1380000000${index}`,
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
          teamIds.push(team.id);
        }
        const attached = await mobile.request('listEventTeams', {
          token,
          path: { eventId },
        });
        const generated = await mobile.request('generateEventSchedule', {
          token,
          path: { eventId },
          body: {
            commandId: randomUUID(),
            format: 'ROUND_ROBIN',
            config: {
              ...config,
              teamIds: attached
                .filter((item) => teamIds.includes(item.teamId))
                .map((item) => item.id),
              startDate: '2027-06-05',
              endDate: '2027-06-06',
            },
          },
        });
        assert.equal(generated.matches.length, 6);
        const agent = await mobile.request('createAgentSession', {
          token,
          body: { currentEventId: eventId },
        });
        const first = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: agent.id },
          body: { eventId, message: '把周六第二场移到周日' },
        });
        assert.equal(first.status, 'NEED_PARAMETERS');
        const second = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: agent.id },
          body: { eventId, taskId: first.task.id, message: '上午十点' },
        });
        assert.equal(second.status, 'PREVIEW');
        const third = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: agent.id },
          body: { eventId, taskId: second.task.id, message: '再晚半小时' },
        });
        assert.equal(third.status, 'PREVIEW');
        const ticket = third.task.confirmation;
        assert.equal(
          third.task.preview.after.startAt,
          '2027-06-06T02:30:00.000Z',
        );
        assert.equal(
          third.task.preview.after.venue,
          third.task.preview.before.venue,
        );
        assert.equal(
          (
            await mobile.request('getEventSchedule', {
              token,
              path: { eventId },
            })
          ).revision,
          generated.revision,
        );
        const body = {
          eventId,
          matchId: ticket.matchId,
          parameterHash: ticket.parameterHash,
        };
        const result = await mobile.request('confirmAgentScheduleAdjustment', {
          token,
          path: { ticketId: ticket.id },
          body,
        });
        assert.equal(result.status, 'DRAFT');
        assert.equal(result.revision, generated.revision + 1);
        const restored = await mobile.request('getAgentSession', {
          token,
          path: { sessionId: agent.id },
        });
        assert.equal(
          restored.lastExecution?.result.commandId,
          result.commandId,
        );
        assert.equal(
          (
            await mobile.request('confirmAgentScheduleAdjustment', {
              token,
              path: { ticketId: ticket.id },
              body,
            })
          ).commandId,
          result.commandId,
        );
        assert.equal(
          (
            await mobile.request('getEventSchedule', {
              token,
              path: { eventId },
            })
          ).revision,
          result.revision,
        );
        await sql.query(
          'UPDATE "HostingApplicationHandlerGrant" SET active=false WHERE "memberId"=$1',
          [members.a],
        );
        await assert.rejects(
          mobile.request('getAgentSession', {
            token,
            path: { sessionId: agent.id },
          }),
          { status: 403 },
        );
      } finally {
        await sql.query(
          'UPDATE "HostingApplicationHandlerGrant" SET active=true WHERE "memberId"=$1',
          [members.a],
        );
      }
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
