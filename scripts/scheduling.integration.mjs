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
    getAgentHistory,
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
    const content = await response.text();
    const result = content ? JSON.parse(content) : null;
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
  await t.test(
    'agent skills are versioned admin instructions, not executable tools',
    async () => {
      const catalog = await call(
        'super',
        'GET',
        'observability/agent/skills/tools/catalog',
      );
      assert.equal(
        catalog.find((tool) => tool.name === 'schedule.list').risk,
        'READ',
      );
      assert.equal(
        catalog.find((tool) => tool.name === 'schedule.draft.adjust')
          .confirmation,
        'BOUND_TICKET_BUTTON_OR_DIALOGUE',
      );
      await call(
        'manager',
        'GET',
        'observability/agent/skills',
        undefined,
        403,
      );
      await call(
        'manager',
        'POST',
        'observability/agent/skills',
        {
          skillKey: 'INTENT_ROUTING',
          instructions: '测试指令',
        },
        403,
      );
      const first = await call('super', 'POST', 'observability/agent/skills', {
        skillKey: 'INTENT_ROUTING',
        instructions: '先区分自由对话与业务请求。',
      });
      assert.equal(first.state, 'DRAFT');
      assert.equal(first.version, 1);
      const active = await call(
        'super',
        'POST',
        `observability/agent/skills/${first.id}/activate`,
        {},
      );
      assert.equal(active.state, 'ACTIVE');
      const second = await call('super', 'POST', 'observability/agent/skills', {
        skillKey: 'INTENT_ROUTING',
        instructions: '先区分自由对话、查询与改期。',
      });
      assert.equal(second.version, 2);
      await call(
        'super',
        'POST',
        `observability/agent/skills/${second.id}/activate`,
        {},
      );
      const versions = await call('super', 'GET', 'observability/agent/skills');
      assert.equal(
        versions.find((item) => item.id === first.id).state,
        'RETIRED',
      );
      assert.equal(
        versions.find((item) => item.id === second.id).state,
        'ACTIVE',
      );
    },
  );
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
      const queryDuringTask = await call(
        'manager',
        'POST',
        `agent/sessions/${agentSession.id}/messages`,
        { message: '查2027-06-05的赛程', taskId: waiting.task.id },
      );
      assert.equal(queryDuringTask.status, 'QUERY');
      assert.match(
        queryDuringTask.message,
        /赛事：.*草稿 V\d+.*北京日期：2027-06-05/,
      );
      assert.equal(queryDuringTask.task.revision, ten.task.revision);
      assert.deepEqual(queryDuringTask.task.parameters, ten.task.parameters);
      assert.equal(
        queryDuringTask.task.preview.before.id,
        ten.task.preview.before.id,
      );
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
          message: '把周六第二场比赛改到周日十点',
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
    'agent CAAU-062: query-only provenance, follow-up, ambiguity, revocation and failure isolation',
    async () => {
      const before = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const versionCount = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const ticketCount = (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentConfirmationTicket" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const querySession = await call('manager', 'POST', 'agent/sessions', {});
      const endpoint = `agent/sessions/${querySession.id}/messages`;
      const noEvent = await call('manager', 'POST', endpoint, {
        message: '查2027-06-05赛程',
      });
      assert.equal(noEvent.status, 'NEED_EVENT');
      assert.ok(
        noEvent.candidates.some((candidate) => candidate.id === event.id),
      );
      const list = await call('manager', 'POST', endpoint, {
        message: '查2027-06-05比赛',
        eventId: event.id,
      });
      assert.equal(list.status, 'QUERY');
      assert.equal(list.task, null);
      assert.match(list.message, new RegExp(`草稿 V${before.revision}`));
      assert.match(list.message, /北京日期：2027-06-05/);
      assert.match(list.message, /北京时间.*场地：/);
      const teamName = before.matches[0].homeLabel;
      const teamMatches = before.matches.filter(
        (match) =>
          new Date(Date.parse(match.startAt) + 8 * 3600000)
            .toISOString()
            .slice(0, 10) === '2027-06-05' &&
          [match.homeLabel, match.awayLabel].includes(teamName),
      );
      const teamList = await call('manager', 'POST', endpoint, {
        message: `查${teamName}在2027-06-05的比赛`,
        eventId: event.id,
      });
      assert.equal(teamList.status, 'QUERY');
      assert.match(teamList.message, new RegExp(`共 ${teamMatches.length} 场`));
      const teamAmbiguity = await call('manager', 'POST', endpoint, {
        message: '查合成赛程球队的比赛',
        eventId: event.id,
      });
      assert.equal(teamAmbiguity.status, 'CLARIFY');
      assert.match(teamAmbiguity.message, /找到 4 支同名\/近似球队/);
      const detail = await call('manager', 'POST', endpoint, {
        message: '查看2027-06-05第二场详情',
        eventId: event.id,
      });
      assert.equal(detail.status, 'QUERY');
      assert.match(detail.message, /比赛详情/);
      const referred = await call('manager', 'POST', endpoint, {
        message: '刚才那场的场地呢？',
        eventId: event.id,
      });
      assert.equal(referred.status, 'QUERY');
      assert.ok(
        referred.message.includes(
          /比赛 ID：([0-9a-f-]+)/.exec(detail.message)[1],
        ),
      );
      const ambiguous = await call('manager', 'POST', endpoint, {
        message: '查2027-06-05哪场比赛的详情',
        eventId: event.id,
      });
      assert.equal(ambiguous.status, 'NEED_MATCH');
      assert.ok(ambiguous.candidates.length > 1);
      const chosen = await call('manager', 'POST', endpoint, {
        message: '查2027-06-05哪场比赛的详情',
        eventId: event.id,
        matchId: ambiguous.candidates[0].id,
      });
      assert.equal(chosen.status, 'QUERY');
      assert.match(chosen.message, /比赛详情/);
      const nothing = await call('manager', 'POST', endpoint, {
        message: '查2027-06-07比赛',
        eventId: event.id,
      });
      assert.equal(nothing.status, 'QUERY');
      assert.match(nothing.message, /不能据此断言球队有空/);
      const badDate = await call('manager', 'POST', endpoint, {
        message: '查2027-02-30比赛',
        eventId: event.id,
      });
      assert.equal(badDate.status, 'CLARIFY');
      assert.match(badDate.message, /有效的北京时间日期/);
      const history = await call(
        'manager',
        'GET',
        `agent/sessions/${querySession.id}`,
      );
      assert.ok(history.turns.some((turn) => turn.content === detail.message));
      assert.equal(history.task, null);
      const sources = (
        await sql.query(
          'SELECT structured FROM "AgentTurn" WHERE "sessionId"=$1 AND role=$2 ORDER BY sequence',
          [querySession.id, 'ASSISTANT'],
        )
      ).rows
        .map((row) => row.structured)
        .filter((record) => record.kind === 'QUERY');
      assert.ok(sources.length >= 5);
      assert.ok(
        sources.every(
          (record) =>
            record.source.eventId === event.id &&
            record.source.revision === before.revision,
        ),
      );
      assert.ok(sources.some((record) => record.source.matchId));
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentTask" WHERE "sessionId"=$1',
            [querySession.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentConfirmationTicket" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        ticketCount,
      );
      const callCount = getAgentModelCalls();
      await call(
        'manager',
        'POST',
        endpoint,
        { message: '__CAAU_SYNTHETIC_QUERY_TIMEOUT__', eventId: event.id },
        503,
      );
      assert.ok(getAgentModelCalls() > callCount);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentTurn" WHERE "sessionId"=$1',
            [querySession.id],
          )
        ).rows[0].n,
        history.turns.length,
      );
      await call(
        'reviewer',
        'GET',
        `agent/sessions/${querySession.id}`,
        undefined,
        403,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      const deniedCalls = getAgentModelCalls();
      await call(
        'manager',
        'GET',
        `agent/sessions/${querySession.id}`,
        undefined,
        403,
      );
      const filtered = await call('manager', 'GET', 'agent/sessions');
      assert.ok(!filtered.some((session) => session.id === querySession.id));
      await call('manager', 'POST', endpoint, { message: '你好' }, 403);
      assert.equal(getAgentModelCalls(), deniedCalls);
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      const recovered = await call(
        'manager',
        'GET',
        `agent/sessions/${querySession.id}`,
      );
      assert.ok(
        recovered.turns.some((turn) => turn.content === detail.message),
      );
      const otherEvent = await call('super', 'POST', 'events', {
        name: '合成查询第二赛事',
        description: 'isolated query provenance',
      });
      await sql.query(
        'INSERT INTO "EventGrant" (id,"eventId","memberId",active) VALUES ($1,$2,$3,true)',
        [randomUUID(), otherEvent.id, members.manager],
      );
      const crossEvent = await call('manager', 'POST', endpoint, {
        message: '查询合成查询第二赛事赛程',
        eventId: otherEvent.id,
      });
      assert.equal(crossEvent.status, 'QUERY');
      assert.match(crossEvent.message, /尚未生成 V0/);
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [otherEvent.id, members.manager],
      );
      const revokedCalls = getAgentModelCalls();
      await call(
        'manager',
        'GET',
        `agent/sessions/${querySession.id}`,
        undefined,
        403,
      );
      await call('manager', 'POST', endpoint, { message: '查赛程' }, 403);
      assert.equal(getAgentModelCalls(), revokedCalls);
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [otherEvent.id, members.manager],
      );
      const after = await call('manager', 'GET', `events/${event.id}/schedule`);
      assert.equal(after.revision, before.revision);
      assert.deepEqual(after.matches, before.matches);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        versionCount,
      );
    },
  );

  await t.test(
    'agent CAAU-062: fresh query detail can start a separate single-match preview, never auto-confirm',
    async () => {
      const session = await call('manager', 'POST', 'agent/sessions', {});
      const path = `agent/sessions/${session.id}/messages`;
      const current = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const detail = await call('manager', 'POST', path, {
        message: '查2027-06-05第二场详情',
        eventId: event.id,
      });
      assert.equal(detail.status, 'QUERY');
      const sourceId = /比赛 ID：([0-9a-f-]+)/.exec(detail.message)?.[1];
      assert.ok(sourceId);
      const preview = await call('manager', 'POST', path, {
        message: '把刚才那场改到2027-06-08上午十点',
        eventId: event.id,
      });
      assert.equal(preview.status, 'PREVIEW');
      assert.equal(preview.task.preview.before.id, sourceId);
      assert.equal(preview.task.matchId, sourceId);
      assert.equal(preview.task.confirmation.state, 'PENDING');
      assert.equal(
        (await call('manager', 'GET', `events/${event.id}/schedule`)).revision,
        current.revision,
      );
      const ticket = preview.task.confirmation;
      const confirmed = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${ticket.id}/confirm`,
        {
          eventId: event.id,
          matchId: sourceId,
          parameterHash: ticket.parameterHash,
        },
      );
      assert.equal(confirmed.replayed, false);
      assert.equal(confirmed.matchId, sourceId);
      assert.equal(confirmed.status, 'DRAFT');
      assert.equal(
        (await call('manager', 'GET', `events/${event.id}/schedule`)).revision,
        current.revision + 1,
      );
      const replay = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${ticket.id}/confirm`,
        {
          eventId: event.id,
          matchId: sourceId,
          parameterHash: ticket.parameterHash,
        },
      );
      assert.equal(replay.replayed, true);
      assert.equal(replay.commandId, confirmed.commandId);
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
      const readOnlySession = await call('reviewer', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const readOnlyPreview = await call(
        'reviewer',
        'POST',
        `agent/sessions/${readOnlySession.id}/messages`,
        { message: '把周六第二场比赛改到周日十点', eventId: event.id },
      );
      assert.equal(readOnlyPreview.status, 'PREVIEW');
      assert.equal(readOnlyPreview.task.confirmation, null);
      assert.match(readOnlyPreview.message, /只读预览.*未创建确认票据/);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentConfirmationTicket" WHERE "taskId"=$1',
            [readOnlyPreview.task.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await call('reviewer', 'GET', `events/${event.id}/schedule`)).revision,
        schedule.revision,
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
      await sql.query('UPDATE "OrganizationMember" SET role=$1 WHERE id=$2', [
        'REVIEWER',
        members.manager,
      ]);
      try {
        const downgraded = await call(
          'manager',
          'GET',
          `agent/sessions/${agentSession.id}`,
        );
        assert.equal(downgraded.task.confirmation, null);
        await call(
          'manager',
          'POST',
          `agent/confirmation-tickets/${boundId}/confirm`,
          confirmBody(bound),
          403,
        );
      } finally {
        await sql.query('UPDATE "OrganizationMember" SET role=$1 WHERE id=$2', [
          'EVENT_MANAGER',
          members.manager,
        ]);
      }
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
        const conversation = await mobile.request('createAgentSession', {
          token,
          body: {},
        });
        const greeting = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: conversation.id },
          body: { message: '你好' },
        });
        assert.equal(greeting.status, 'CHAT');
        assert.equal(greeting.task, null);
        const discussion = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: conversation.id },
          body: { message: '七支球队适合什么赛制？' },
        });
        assert.equal(discussion.status, 'CHAT');
        assert.equal(
          (
            await mobile.request('getAgentSession', {
              token,
              path: { sessionId: conversation.id },
            })
          ).task,
          null,
        );
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
        assert.notEqual(
          third.task.confirmation.id,
          second.task.confirmation.id,
        );
        await assert.rejects(
          mobile.request('confirmAgentScheduleAdjustment', {
            token,
            path: { ticketId: second.task.confirmation.id },
            body: {
              eventId,
              matchId: second.task.confirmation.matchId,
              parameterHash: second.task.confirmation.parameterHash,
            },
          }),
          { status: 409 },
        );
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
        const impact = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: agent.id },
          body: { eventId, message: '如果确认会影响什么？' },
        });
        assert.equal(impact.status, 'CHAT');
        assert.equal(impact.task.confirmation.id, ticket.id);
        const executed = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: agent.id },
          body: { eventId, message: '确认执行' },
        });
        assert.equal(executed.status, 'EXECUTED');
        const result = executed.execution;
        assert.equal(result.status, 'DRAFT');
        assert.equal(result.ticketId, ticket.id);
        assert.ok(executed.message.includes(result.commandId));
        assert.equal(result.revision, generated.revision + 1);
        const restored = await mobile.request('getAgentSession', {
          token,
          path: { sessionId: agent.id },
        });
        assert.equal(
          restored.lastExecution?.result.commandId,
          result.commandId,
        );
        assert.equal(restored.task.step, 'EXECUTED');
        assert.equal(restored.turns.at(-2).content, '确认执行');
        assert.ok(restored.turns.at(-1).content.includes(result.commandId));
        assert.equal(
          (
            await mobile.request('getEventSchedule', {
              token,
              path: { eventId },
            })
          ).revision,
          result.revision,
        );
        await assert.rejects(
          mobile.request('getAgentSession', {
            token: tokens.manager,
            path: { sessionId: agent.id },
          }),
          { status: 403 },
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
        const monday = await mobile.request('generateEventSchedule', {
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
              startDate: '2027-06-07',
              endDate: '2027-06-13',
            },
          },
        });
        const mondaySession = await mobile.request('createAgentSession', {
          token,
          body: { currentEventId: eventId },
        });
        const exact = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: mondaySession.id },
          body: { eventId, message: '把周一第二场改到周日上午十点半' },
        });
        assert.equal(exact.status, 'PREVIEW');
        assert.equal(
          exact.task.preview.after.startAt,
          '2027-06-13T02:30:00.000Z',
        );
        assert.equal(
          exact.task.preview.before.id,
          monday.matches
            .filter((match) => match.startAt.startsWith('2027-06-07'))
            .sort(
              (a, b) =>
                Date.parse(a.startAt) - Date.parse(b.startAt) ||
                a.order - b.order,
            )[1].id,
        );
        assert.equal(
          (
            await mobile.request('getEventSchedule', {
              token,
              path: { eventId },
            })
          ).revision,
          monday.revision,
        );
        const old = exact.task.confirmation;
        const modified = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: mondaySession.id },
          body: {
            eventId,
            taskId: exact.task.id,
            message: '改成周日上午十一点',
          },
        });
        assert.equal(modified.status, 'PREVIEW');
        assert.equal(
          modified.task.preview.after.startAt,
          '2027-06-13T03:00:00.000Z',
        );
        await assert.rejects(
          mobile.request('confirmAgentScheduleAdjustment', {
            token,
            path: { ticketId: old.id },
            body: {
              eventId,
              matchId: old.matchId,
              parameterHash: old.parameterHash,
            },
          }),
          { status: 409 },
        );
        const stream = await fetch(
          `${base}/api/v1/agent/sessions/${mondaySession.id}/messages/stream`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ eventId, message: '确认执行' }),
          },
        );
        assert.equal(stream.status, 200);
        const frames = (await stream.text())
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.equal(
          frames.filter((frame) => frame.type === 'result').length,
          1,
        );
        assert.ok(
          !frames.some(
            (frame) => frame.type === 'delta' || frame.type === 'error',
          ),
        );
        const latest = frames.find((frame) => frame.type === 'result').reply;
        assert.equal(latest.status, 'EXECUTED');
        assert.equal(latest.execution.revision, monday.revision + 1);
        assert.equal(
          (
            await mobile.request('getEventSchedule', {
              token,
              path: { eventId },
            })
          ).matches.find((match) => match.id === old.matchId).startAt,
          '2027-06-13T03:00:00.000Z',
        );
        const abandoned = await mobile.request('createAgentSession', {
          token,
          body: { currentEventId: eventId },
        });
        const abandonedPreview = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: abandoned.id },
          body: {
            eventId,
            matchId: old.matchId,
            message: '把这场改到周日下午14点',
          },
        });
        assert.equal(abandonedPreview.status, 'PREVIEW');
        const otherAction = await mobile.request('sendAgentMessage', {
          token,
          path: { sessionId: abandoned.id },
          body: {
            eventId,
            newTask: true,
            matchId: abandonedPreview.task.matchId,
            message: '把这场改到周日下午三点',
          },
        });
        // A separate action must invalidate the earlier ticket even if the
        // new action needs another answer before it can be previewed.
        assert.ok(
          ['PREVIEW', 'NEED_PARAMETERS', 'NEED_MATCH'].includes(
            otherAction.status,
          ),
        );
        assert.notEqual(otherAction.task.id, abandonedPreview.task.id);
        await assert.rejects(
          mobile.request('confirmAgentScheduleAdjustment', {
            token,
            path: { ticketId: abandonedPreview.task.confirmation.id },
            body: {
              eventId,
              matchId: abandonedPreview.task.confirmation.matchId,
              parameterHash: abandonedPreview.task.confirmation.parameterHash,
            },
          }),
          { status: 409 },
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

  await t.test(
    'agent turns: full answer bounds, durable order and concurrent recovery',
    async () => {
      const chat = await call('manager', 'POST', 'agent/sessions', {});
      const path = `agent/sessions/${chat.id}`;
      for (const length of [2000, 2001, 4000]) {
        const input = `__CAAU_SYNTHETIC_CHAT_LENGTH_${length}__`;
        const reply = await call('manager', 'POST', `${path}/messages`, {
          message: input,
        });
        assert.equal(reply.status, 'CHAT');
        assert.equal(reply.message, '答'.repeat(length));
        const recovered = await call('manager', 'GET', path);
        assert.equal(recovered.turns.at(-2).content, input);
        assert.equal(recovered.turns.at(-1).content, reply.message);
      }
      const beforeOverflow = await sql.query(
        'SELECT count(*)::int n FROM "AgentTurn" WHERE "sessionId"=$1',
        [chat.id],
      );
      const overflow = await call(
        'manager',
        'POST',
        `${path}/messages`,
        { message: '__CAAU_SYNTHETIC_CHAT_LENGTH_4001__' },
        502,
      );
      assert.match(overflow.message, /4000/);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentTurn" WHERE "sessionId"=$1',
            [chat.id],
          )
        ).rows[0].n,
        beforeOverflow.rows[0].n,
      );
      const observed = await call('manager', 'POST', `${path}/messages`, {
        message: '__CAAU_SYNTHETIC_HISTORY__',
      });
      assert.equal(observed.status, 'CHAT');
      const history = getAgentHistory();
      assert.deepEqual(
        history.map((turn) => turn.role),
        ['USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT'],
      );
      assert.ok(
        history.every((turn) => Array.from(turn.content).length <= 600),
      );
      assert.match(history.at(-1).content, /仅模型上下文节选/);
      assert.equal(
        (await call('manager', 'GET', path)).turns[5].content,
        '答'.repeat(4000),
      );
      const incoming = Array.from(
        { length: 8 },
        (_, index) => `并发闲聊${index}`,
      );
      const [parallel, snapshots] = await Promise.all([
        Promise.all(
          incoming.map((message) =>
            call('manager', 'POST', `${path}/messages`, { message }),
          ),
        ),
        Promise.all(
          Array.from({ length: 8 }, () => call('manager', 'GET', path)),
        ),
      ]);
      for (const snapshot of snapshots) {
        assert.ok(
          snapshot.turns.every(
            (turn, index) =>
              turn.role === (index % 2 === 0 ? 'USER' : 'ASSISTANT'),
          ),
        );
      }
      assert.ok(parallel.every((reply) => reply.status === 'CHAT'));
      const restored = await call('manager', 'GET', path);
      const fromList = (await call('manager', 'GET', 'agent/sessions')).find(
        (item) => item.id === chat.id,
      );
      assert.deepEqual(fromList.turns, restored.turns);
      const rows = (
        await sql.query(
          'SELECT "sequence",role,content FROM "AgentTurn" WHERE "sessionId"=$1 ORDER BY "sequence"',
          [chat.id],
        )
      ).rows;
      assert.deepEqual(
        rows.map((row) => row.sequence),
        Array.from({ length: rows.length }, (_, index) => index + 1),
      );
      for (let index = 0; index < rows.length; index += 2) {
        assert.equal(rows[index].role, 'USER');
        assert.equal(rows[index + 1].role, 'ASSISTANT');
      }
      assert.deepEqual(
        restored.turns.map((turn) => turn.content),
        rows.slice(-20).map((row) => row.content),
      );
      await call('manager', 'POST', `${path}/messages`, {
        message: '__CAAU_SYNTHETIC_HISTORY__',
      });
      assert.deepEqual(
        getAgentHistory().map((turn) => turn.role),
        rows.slice(-30).map((row) => row.role),
      );
      assert.deepEqual(
        getAgentHistory().map((turn) => turn.content),
        rows.slice(-30).map((row) => {
          const characters = Array.from(row.content);
          return characters.length <= 600
            ? row.content
            : `${characters.slice(0, 400).join('')}…（仅模型上下文节选）${characters.slice(-180).join('')}`;
        }),
      );
      assert.deepEqual(
        incoming.slice().sort(),
        rows
          .filter((row) => incoming.includes(row.content))
          .map((row) => row.content)
          .sort(),
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentTask" WHERE "sessionId"=$1',
            [chat.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentConfirmationTicket" t JOIN "AgentTask" a ON a.id=t."taskId" WHERE a."sessionId"=$1',
            [chat.id],
          )
        ).rows[0].n,
        0,
      );
    },
  );

  await t.test(
    'agent stream: provisional text ends in one persisted reply and owner checks still apply',
    async () => {
      const chat = await call('manager', 'POST', 'agent/sessions', {});
      const url = `${base}/api/v1/agent/sessions/${chat.id}/messages/stream`;
      const send = async (key, message = '你好') => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens[key]}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
        });
        return {
          status: response.status,
          events: (await response.text())
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
        };
      };
      const allowed = await send('manager');
      assert.equal(allowed.status, 200);
      assert.equal(allowed.events[0].type, 'phase');
      assert.equal(
        allowed.events.at(-1).type,
        'result',
        JSON.stringify(allowed.events),
      );
      assert.equal(allowed.events.at(-1).reply.status, 'CHAT');
      assert.ok(
        allowed.events.filter((event) => event.type === 'delta').length >= 2,
      );
      assert.equal(
        allowed.events
          .filter((event) => event.type === 'delta')
          .map((event) => event.text)
          .join(''),
        allowed.events.at(-1).reply.message,
      );
      const saved = await call('manager', 'GET', `agent/sessions/${chat.id}`);
      assert.deepEqual(
        saved.turns.map((turn) => turn.role),
        ['USER', 'ASSISTANT'],
      );
      assert.equal(saved.turns[1].content, allowed.events.at(-1).reply.message);
      const denied = await send('a');
      assert.equal(denied.events.at(-1).type, 'error');
      assert.equal(denied.events.at(-1).status, 403);
      assert.equal(
        denied.events.some((event) => event.type === 'delta'),
        false,
      );
      const tooLong = await send(
        'manager',
        '__CAAU_SYNTHETIC_CHAT_LENGTH_4001__',
      );
      assert.equal(tooLong.events.at(-1).type, 'error');
      assert.equal(tooLong.events.at(-1).status, 502);
      assert.equal(
        (await call('manager', 'GET', `agent/sessions/${chat.id}`)).turns
          .length,
        2,
      );
    },
  );

  await t.test(
    'agent dialogue: no-context chat, task insertion, denial and exactly-once draft',
    async () => {
      const chat = await call('manager', 'POST', 'agent/sessions', {});
      assert.equal(chat.currentEventId, null);
      const counts = async () =>
        (
          await sql.query(
            'SELECT (SELECT count(*)::int FROM "AgentTask" WHERE "sessionId"=$1) tasks, (SELECT count(*)::int FROM "AgentConfirmationTicket" t JOIN "AgentTask" a ON a.id=t."taskId" WHERE a."sessionId"=$1) tickets',
            [chat.id],
          )
        ).rows[0];
      const before = await counts();
      assert.deepEqual(before, { tasks: 0, tickets: 0 });
      const hello = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '你好' },
      );
      assert.equal(hello.status, 'CHAT');
      assert.equal(hello.task, null);
      const ideas = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '七支球队适合什么赛制？' },
      );
      assert.equal(ideas.status, 'CHAT');
      assert.match(ideas.message, /21场/);
      const unsupported = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '帮我登记俱乐部并批量重排整周比赛' },
      );
      assert.equal(unsupported.status, 'UNSUPPORTED');
      assert.equal(unsupported.task, null);
      const unclear = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '安排一下' },
      );
      assert.equal(unclear.status, 'CLARIFY');
      await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '__CAAU_SYNTHETIC_CHAT_TIMEOUT__' },
        503,
      );
      assert.deepEqual(await counts(), before);
      const saved = await call('manager', 'GET', `agent/sessions/${chat.id}`);
      assert.equal(saved.task, null);
      assert.equal(saved.turns.length, 8);
      await call('a', 'GET', `agent/sessions/${chat.id}`, undefined, 403);

      const baseline = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const waiting = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '把周二第二场移到周三', eventId: event.id },
      );
      assert.equal(waiting.status, 'NEED_PARAMETERS');
      const row = async () =>
        (
          await sql.query(
            'SELECT revision,"checkpointThreadId" FROM "AgentTask" WHERE id=$1',
            [waiting.task.id],
          )
        ).rows[0];
      const taskBefore = await row();
      const question = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        {
          message: '赛制规则是什么？',
          taskId: waiting.task.id,
          eventId: event.id,
        },
      );
      assert.equal(question.status, 'CHAT');
      assert.equal(question.task.id, waiting.task.id);
      assert.deepEqual(await row(), taskBefore);
      const preview = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '上午十点', taskId: waiting.task.id, eventId: event.id },
      );
      assert.equal(preview.status, 'PREVIEW');
      assert.equal(preview.task.id, waiting.task.id);
      assert.equal(
        (await row()).checkpointThreadId,
        taskBefore.checkpointThreadId,
      );
      const businessTurns = (
        await sql.query(
          'SELECT "sequence",role FROM "AgentTurn" WHERE "sessionId"=$1 AND structured->>\'taskId\'=$2 ORDER BY "sequence"',
          [chat.id, waiting.task.id],
        )
      ).rows;
      assert.deepEqual(
        businessTurns.map((turn) => turn.role),
        ['USER', 'ASSISTANT', 'USER', 'ASSISTANT'],
      );
      assert.equal(businessTurns[0].sequence + 1, businessTurns[1].sequence);
      assert.equal(businessTurns[2].sequence + 1, businessTurns[3].sequence);
      const revision = (await row()).revision;
      const ticket = preview.task.confirmation;
      const impact = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        {
          message: '如果改到周日有什么影响？',
          taskId: waiting.task.id,
          eventId: event.id,
        },
      );
      assert.equal(impact.status, 'CHAT');
      assert.equal(impact.task.confirmation.id, ticket.id);
      const okay = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '好的', taskId: waiting.task.id, eventId: event.id },
      );
      assert.equal(okay.status, 'CHAT');
      const noTool = await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        {
          message: '请整周重排全部场次',
          taskId: waiting.task.id,
          eventId: event.id,
        },
      );
      assert.equal(noTool.status, 'UNSUPPORTED');
      assert.equal(noTool.task.confirmation.id, ticket.id);
      assert.equal((await row()).revision, revision);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        baseline,
      );
      const confirmation = {
        eventId: event.id,
        matchId: ticket.matchId,
        parameterHash: ticket.parameterHash,
      };
      const executed = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${ticket.id}/confirm`,
        confirmation,
      );
      assert.equal(executed.status, 'DRAFT');
      const replay = await call(
        'manager',
        'POST',
        `agent/confirmation-tickets/${ticket.id}/confirm`,
        confirmation,
      );
      assert.equal(replay.replayed, true);
      assert.equal(replay.commandId, executed.commandId);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        baseline + 1,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      await call('manager', 'GET', `agent/sessions/${chat.id}`, undefined, 403);
      await call(
        'manager',
        'POST',
        `agent/sessions/${chat.id}/messages`,
        { message: '你好' },
        403,
      );
      assert.ok(
        !(await call('manager', 'GET', 'agent/sessions')).some(
          (item) => item.id === chat.id,
        ),
      );
      const fresh = await call('manager', 'POST', 'agent/sessions', {});
      assert.equal(
        (
          await call('manager', 'POST', `agent/sessions/${fresh.id}/messages`, {
            message: '你好',
          })
        ).status,
        'CHAT',
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
    },
  );

  await t.test(
    'agent planning: persistent requirements, CAS confirmation, authorization and no schedule writes',
    async () => {
      const chat = await call('manager', 'POST', 'agent/sessions', {});
      const route = `agent/sessions/${chat.id}`;
      const before = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const send = (message, extra = {}, status = 200) =>
        call(
          'manager',
          'POST',
          `${route}/messages`,
          { message, ...extra },
          status,
        );
      assert.equal((await send('你好')).planningRequest, null);
      assert.equal(
        (await send('请批量重排整套赛程并发布赛程', { eventId: event.id }))
          .status,
        'UNSUPPORTED',
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentPlanningRequest" WHERE "sessionId"=$1',
            [chat.id],
          )
        ).rows[0].n,
        0,
      );
      const prompt = '请收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07';
      const choose = await send(prompt);
      assert.equal(choose.status, 'NEED_EVENT');
      assert.ok(choose.candidates.some((item) => item.id === event.id));
      let reply = await send(prompt, { eventId: event.id });
      assert.equal(reply.status, 'PLAN');
      let plan = reply.planningRequest;
      assert.equal(plan.conditions[0].from, '2027-06-01');
      assert.equal(plan.conditions[0].to, '2027-06-07');
      assert.equal(plan.status, 'COLLECTING');
      assert.equal(plan.revision, 1);
      assert.equal(plan.conditions[0].sourceTurnIds.length, 1);
      assert.equal(
        (await call('manager', 'GET', route)).planningRequest.sourceTurns[0].id,
        plan.conditions[0].sourceTurnIds[0],
      );
      const details = {
        eventId: event.id,
        planningId: plan.id,
        planningRevision: plan.revision,
      };
      reply = await send('合成赛程球队4只能周三', details);
      assert.equal(reply.status, 'PLAN');
      plan = reply.planningRequest;
      assert.deepEqual(
        plan.conditions.find((item) => item.kind === 'TEAM_WINDOW').dates,
        ['2027-06-02'],
      );
      assert.equal(
        plan.conditions.find((item) => item.kind === 'TEAM_WINDOW').teamId,
        eventTeams.find((item) => item.profile.name === '合成赛程球队4').id,
      );
      await send(
        '合成赛程球队4只能周五',
        { ...details, planningRevision: plan.revision, teamId: randomUUID() },
        403,
      );
      await send('改成周三和周五', details, 409);
      reply = await send('改成周三和周五', {
        ...details,
        planningRevision: plan.revision,
      });
      assert.equal(reply.status, 'PLAN');
      plan = reply.planningRequest;
      assert.deepEqual(
        plan.conditions.find((item) => item.kind === 'TEAM_WINDOW').dates,
        ['2027-06-02', '2027-06-04'],
      );
      reply = await send('取消合成赛程球队4时间限制', {
        ...details,
        planningRevision: plan.revision,
      });
      assert.equal(reply.status, 'PLAN');
      plan = reply.planningRequest;
      assert.equal(
        plan.conditions.filter((item) => item.kind === 'TEAM_WINDOW').length,
        0,
      );
      reply = await send('合成赛程球队4只能周三', {
        ...details,
        planningRevision: plan.revision,
      });
      plan = reply.planningRequest;
      reply = await send('合成赛程球队4周三不能比赛', {
        ...details,
        planningRevision: plan.revision,
      });
      plan = reply.planningRequest;
      assert.equal(plan.issues.length, 1);
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: plan.revision },
        409,
      );
      reply = await send('取消合成赛程球队4时间限制', {
        ...details,
        planningRevision: plan.revision,
      });
      plan = reply.planningRequest;
      reply = await send('合成赛程球队4只能周三', {
        ...details,
        planningRevision: plan.revision,
      });
      plan = reply.planningRequest;
      assert.equal(plan.issues.length, 0);
      const unclearMatchup = await send('优先对阵', {
        ...details,
        planningRevision: plan.revision,
      });
      assert.equal(unclearMatchup.status, 'CLARIFY');
      assert.equal(unclearMatchup.planningRequest.revision, plan.revision);
      reply = await send('希望合成赛程球队1与合成赛程球队2尽量对阵', {
        ...details,
        planningRevision: plan.revision,
      });
      assert.equal(reply.status, 'PLAN');
      plan = reply.planningRequest;
      assert.equal(
        plan.conditions.find((item) => item.kind === 'MATCHUP').priority,
        'PREFER',
      );
      assert.equal(
        plan.conditions.find((item) => item.kind === 'MATCHUP').matchup,
        'PREFER',
      );
      assert.equal(plan.issues.length, 0);
      await call(
        'a',
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: plan.revision },
        403,
      );
      const confirmed = await call(
        'manager',
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: plan.revision },
      );
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(confirmed.confirmedRevision, plan.revision);
      assert.ok(
        confirmed.conditions.every((item) => item.confirmation === 'CONFIRMED'),
      );
      assert.equal(
        (
          await call(
            'manager',
            'POST',
            `agent/planning-requests/${plan.id}/confirm`,
            { expectedRevision: plan.revision },
          )
        ).revision,
        plan.revision,
      );
      assert.equal(
        (await send('好的', { ...details, planningRevision: plan.revision }))
          .status,
        'CHAT',
      );
      assert.equal(
        (await call('manager', 'GET', route)).planningRequest.status,
        'CONFIRMED',
      );
      const confirmedTeam = plan.conditions.find(
        (item) => item.kind === 'TEAM_WINDOW',
      ).teamId;
      const teamRecord = (
        await call('super', 'GET', `events/${event.id}/teams`)
      ).find((item) => item.id === confirmedTeam);
      const archived = await call(
        'super',
        'PUT',
        `events/${event.id}/teams/${confirmedTeam}`,
        {
          expectedRevision: teamRecord.revision,
          active: false,
          profile: teamRecord.profile,
        },
      );
      const staleTeam = await call('manager', 'GET', route);
      assert.equal(staleTeam.planningRequest.status, 'STALE');
      assert.ok(
        staleTeam.planningRequest.issues.some((issue) =>
          issue.includes('停用'),
        ),
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: plan.revision },
        409,
      );
      await call('super', 'PUT', `events/${event.id}/teams/${confirmedTeam}`, {
        expectedRevision: archived.revision,
        active: true,
        profile: archived.profile,
      });
      assert.equal(
        (await call('manager', 'GET', route)).planningRequest.status,
        'CONFIRMED',
      );
      reply = await send('改成周三和周五', {
        ...details,
        planningRevision: plan.revision,
      });
      plan = reply.planningRequest;
      assert.equal(plan.status, 'COLLECTING');
      assert.equal(plan.confirmedRevision, null);
      assert.ok(
        plan.conditions.every((item) => item.confirmation === 'PENDING'),
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: confirmed.revision },
        409,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentTask" WHERE "sessionId"=$1',
            [chat.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentConfirmationTicket" t JOIN "AgentTask" a ON a.id=t."taskId" WHERE a."sessionId"=$1',
            [chat.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        before,
      );
      const pendingSession = await call(
        'manager',
        'POST',
        'agent/sessions',
        {},
      );
      const pendingRoute = `agent/sessions/${pendingSession.id}`;
      const pendingFirst = await call(
        'manager',
        'POST',
        `${pendingRoute}/messages`,
        {
          message: '合成赛程球队4只能周三',
          eventId: event.id,
        },
      );
      assert.equal(pendingFirst.status, 'PLAN');
      assert.equal(pendingFirst.planningRequest.conditions.length, 0);
      assert.ok(
        pendingFirst.planningRequest.pending.some((item) =>
          item.includes('日期范围'),
        ),
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${pendingFirst.planningRequest.id}/confirm`,
        {
          expectedRevision: pendingFirst.planningRequest.revision,
        },
        409,
      );
      const pendingResolved = await call(
        'manager',
        'POST',
        `${pendingRoute}/messages`,
        {
          message: '赛事日期范围 2027-06-01 到 2027-06-07',
          eventId: event.id,
          planningId: pendingFirst.planningRequest.id,
          planningRevision: pendingFirst.planningRequest.revision,
        },
      );
      assert.equal(pendingResolved.status, 'PLAN');
      assert.deepEqual(
        pendingResolved.planningRequest.conditions.find(
          (item) => item.kind === 'TEAM_WINDOW',
        ).dates,
        ['2027-06-02'],
      );
      assert.equal(
        pendingResolved.planningRequest.conditions.find(
          (item) => item.kind === 'TEAM_WINDOW',
        ).sourceTurnIds.length,
        2,
      );
      assert.equal(
        (await call('manager', 'GET', pendingRoute)).planningRequest.sourceTurns
          .length,
        2,
      );
      assert.deepEqual(pendingResolved.planningRequest.pending, []);
      const other = await call('manager', 'POST', 'agent/sessions', {});
      await call(
        'manager',
        'POST',
        `agent/sessions/${other.id}/messages`,
        {
          message: '取消合成赛程球队4时间限制',
          eventId: event.id,
          planningId: pendingFirst.planningRequest.id,
          planningRevision: pendingResolved.planningRequest.revision,
        },
        403,
      );
      await call(
        'manager',
        'POST',
        `agent/sessions/${other.id}/messages`,
        {
          message: '请收集排程需求',
          eventId: randomUUID(),
        },
        403,
      );
      const duplicate = await call('super', 'POST', 'teams', {
        id: randomUUID(),
        organizationId: orgA,
        eventId: event.id,
        profile: profile(4),
      });
      const attached = (
        await call('super', 'GET', `events/${event.id}/teams`)
      ).find((item) => item.teamId === duplicate.id);
      assert.ok(attached);
      const ambiguousSession = await call('manager', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const ambiguousPath = `agent/sessions/${ambiguousSession.id}/messages`;
      const period = await call('manager', 'POST', ambiguousPath, {
        message: '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
        eventId: event.id,
      });
      assert.equal(period.status, 'PLAN');
      const ambiguous = await call('manager', 'POST', ambiguousPath, {
        message: '合成赛程球队4只能周三',
        eventId: event.id,
        planningId: period.planningRequest.id,
        planningRevision: period.planningRequest.revision,
      });
      assert.equal(ambiguous.status, 'NEED_TEAM');
      assert.ok(ambiguous.candidates.some((item) => item.id === attached.id));
      assert.equal(
        (await call('manager', 'GET', `agent/sessions/${ambiguousSession.id}`))
          .planningRequest.revision,
        period.planningRequest.revision,
      );
      const selected = await call('manager', 'POST', ambiguousPath, {
        message: '合成赛程球队4只能周三',
        eventId: event.id,
        teamId: attached.id,
        planningId: period.planningRequest.id,
        planningRevision: period.planningRequest.revision,
      });
      assert.equal(selected.status, 'PLAN');
      assert.equal(
        selected.planningRequest.conditions.find(
          (item) => item.kind === 'TEAM_WINDOW',
        ).teamId,
        attached.id,
      );
      const compoundSession = await call(
        'manager',
        'POST',
        'agent/sessions',
        {},
      );
      const compound = await call(
        'manager',
        'POST',
        `agent/sessions/${compoundSession.id}/messages`,
        {
          message:
            '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07，合成赛程球队2只能周三',
          eventId: event.id,
        },
      );
      assert.equal(compound.status, 'PLAN');
      assert.deepEqual(
        compound.planningRequest.conditions.map((item) => item.kind),
        ['DATE_RANGE', 'TEAM_WINDOW'],
      );
      assert.deepEqual(compound.planningRequest.conditions[1].dates, [
        '2027-06-02',
      ]);
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      await call('manager', 'GET', route, undefined, 403);
      await call(
        'manager',
        'POST',
        `${route}/messages`,
        { message: '你好' },
        403,
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: plan.revision },
        403,
      );
      assert.ok(
        !(await call('manager', 'GET', 'agent/sessions')).some(
          (item) => item.id === chat.id,
        ),
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      assert.equal(
        (await call('manager', 'GET', route)).planningRequest.revision,
        plan.revision,
      );
    },
  );

  await t.test(
    'agent ten-day request clarifies pair coverage, then previews every pair without saving',
    async () => {
      const session = await call('manager', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const route = `agent/sessions/${session.id}/messages`;
      const baseline = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const beforeVersions = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const first = await call('manager', 'POST', route, {
        message: '帮我编排一下赛程，10天解决，要求所有队伍都必须比过一场',
        eventId: event.id,
      });
      assert.equal(first.status, 'PLAN');
      assert.equal(first.planningRequest.conditions[0].from, '2027-06-01');
      assert.equal(first.planningRequest.conditions[0].to, '2027-06-10');
      assert.equal(
        first.planningRequest.conditions[0].dateSource,
        'EVENT_SCHEDULE',
      );
      assert.ok(
        first.planningRequest.pending.some((item) => item.includes('每两支')),
      );
      assert.equal(first.pendingQuestion.kind, 'ROUND_ROBIN');
      assert.equal(
        (await call('manager', 'GET', `agent/sessions/${session.id}`))
          .pendingQuestion.planningRevision,
        first.planningRequest.revision,
      );
      const interlude = await call('manager', 'POST', route, {
        message: '你好',
        eventId: event.id,
      });
      assert.equal(interlude.status, 'CHAT');
      assert.equal(
        interlude.planningRequest.revision,
        first.planningRequest.revision,
      );
      assert.equal(
        (await call('manager', 'GET', `agent/sessions/${session.id}`))
          .pendingQuestion.kind,
        'ROUND_ROBIN',
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${first.planningRequest.id}/confirm`,
        { expectedRevision: first.planningRequest.revision },
        409,
      );
      const clarified = await call('manager', 'POST', route, {
        message: '是的',
        eventId: event.id,
      });
      assert.equal(clarified.status, 'PLAN');
      assert.equal(clarified.pendingQuestion, null);
      assert.deepEqual(clarified.planningRequest.pending, []);
      assert.equal(
        clarified.planningRequest.conditions.find(
          (item) => item.kind === 'FORMAT',
        ).format,
        'ROUND_ROBIN',
      );
      const confirmed = await call(
        'manager',
        'POST',
        `agent/planning-requests/${first.planningRequest.id}/confirm`,
        { expectedRevision: clarified.planningRequest.revision },
      );
      assert.equal(confirmed.status, 'CONFIRMED');
      const currentTeams = await call(
        'manager',
        'GET',
        `events/${event.id}/teams`,
      );
      const cfg = {
        ...baseline.config,
        teamIds: currentTeams
          .filter((item) => item.active)
          .map((item) => item.id),
        startDate: '2027-06-01',
        endDate: '2027-06-10',
      };
      const candidate = await call(
        'manager',
        'POST',
        `agent/planning-requests/${first.planningRequest.id}/candidates`,
        {
          expectedRevision: confirmed.revision,
          baselineRevision: baseline.revision,
          format: 'ROUND_ROBIN',
          configSource: 'EXPLICIT',
          config: cfg,
          fixedMatchIds: [],
        },
      );
      assert.equal(candidate.status, 'FOUND');
      assert.equal(
        candidate.matches.length,
        (cfg.teamIds.length * (cfg.teamIds.length - 1)) / 2,
      );
      assert.ok(
        candidate.matches.every((match) => {
          const day = new Date(Date.parse(match.startAt) + 8 * 3600000)
            .toISOString()
            .slice(0, 10);
          return day >= cfg.startDate && day <= cfg.endDate;
        }),
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        beforeVersions,
      );
    },
  );

  await t.test(
    'agent whole-schedule candidates: isolated preview, deterministic audit, restore/stale and authorization',
    async () => {
      const session = await call('manager', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const path = `agent/sessions/${session.id}/messages`;
      let reply = await call('manager', 'POST', path, {
        message: '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
        eventId: event.id,
      });
      const planId = reply.planningRequest.id;
      const send = async (message) => {
        reply = await call('manager', 'POST', path, {
          message,
          eventId: event.id,
          planningId: planId,
          planningRevision: reply.planningRequest.revision,
        });
        assert.equal(reply.status, 'PLAN');
      };
      await send('合成赛程球队2只能周三（模型短ID回归）');
      await send('尽量让合成赛程球队3只能周二');
      let planning = reply.planningRequest;
      assert.equal(planning.issues.length, 0);
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${planId}/candidates`,
        {},
        400,
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${planId}/confirm`,
        { expectedRevision: planning.revision },
      );
      planning = (await call('manager', 'GET', `agent/sessions/${session.id}`))
        .planningRequest;
      const baseline = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const currentTeams = await call(
        'manager',
        'GET',
        `events/${event.id}/teams`,
      );
      const cfg = {
        ...baseline.config,
        teamIds: currentTeams
          .filter((item) => item.active)
          .map((item) => item.id),
        startDate: '2027-06-01',
        endDate: '2027-06-07',
      };
      const url = `agent/planning-requests/${planId}/candidates`;
      const input = {
        expectedRevision: planning.revision,
        baselineRevision: baseline.revision,
        format: 'ROUND_ROBIN',
        configSource: 'EXPLICIT',
        config: cfg,
        fixedMatchIds: [],
      };
      const before = await sql.query(
        'SELECT config,matches,revision FROM "EventSchedule" WHERE "eventId"=$1',
        [event.id],
      );
      const versionsBefore = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const receiptsBefore = (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentCommandReceipt" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      await call('manager', 'GET', `${url}/latest`, undefined, 404);
      await call('reviewer', 'POST', url, input, 403);
      await call(
        'manager',
        'POST',
        url,
        { ...input, format: 'SINGLE_ELIMINATION' },
        400,
      );
      await call(
        'manager',
        'POST',
        url,
        { ...input, baselineRevision: baseline.revision - 1 },
        409,
      );
      await call(
        'manager',
        'POST',
        url,
        { ...input, configSource: 'EVENT_SCHEDULE' },
        409,
      );
      const candidate = await call('manager', 'POST', url, input);
      assert.equal(candidate.status, 'FOUND');
      assert.equal(
        candidate.matches.length,
        (cfg.teamIds.length * (cfg.teamIds.length - 1)) / 2,
      );
      assert.equal(
        new Set(
          candidate.matches.map((match) =>
            [match.homeEventTeamId, match.awayEventTeamId].sort().join(':'),
          ),
        ).size,
        candidate.matches.length,
      );
      assert.ok(
        candidate.matches.every(
          (match) => match.startAt && cfg.venues.includes(match.venue),
        ),
      );
      assert.ok(
        candidate.matches
          .filter((match) =>
            [match.homeEventTeamId, match.awayEventTeamId].includes(
              currentTeams.find((item) => item.profile.name === '合成赛程球队2')
                .id,
            ),
          )
          .every((match) => match.startAt.startsWith('2027-06-02')),
      );
      assert.ok(
        candidate.preferences.some(
          (preference) => preference.status === 'UNMET',
        ),
      );
      assert.deepEqual(candidate.issues, []);
      assert.equal(
        (await call('manager', 'GET', `${url}/latest`)).id,
        candidate.id,
      );
      assert.equal(
        (await call('manager', 'GET', `${url}/${candidate.id}`)).status,
        'FOUND',
      );
      await call('reviewer', 'GET', `${url}/${candidate.id}`, undefined, 403);
      const assignedMatchId = baseline.matches[0].id;
      const assignmentId = randomUUID();
      await sql.query(
        'INSERT INTO "EventMatchStaff" (id,"eventId","scheduleRevision","matchId",staff,"createdBy","updatedBy") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)',
        [
          assignmentId,
          event.id,
          baseline.revision,
          assignedMatchId,
          JSON.stringify([{ id: randomUUID() }]),
          users.manager,
        ],
      );
      await call('manager', 'POST', url, input, 409);
      assert.equal(
        (await call('manager', 'GET', `${url}/${candidate.id}`)).status,
        'STALE',
      );
      await sql.query('DELETE FROM "EventMatchStaff" WHERE id=$1', [
        assignmentId,
      ]);
      assert.equal(
        (await call('manager', 'GET', `${url}/${candidate.id}`)).status,
        'FOUND',
      );
      assert.deepEqual(
        (
          await sql.query(
            'SELECT config,matches,revision FROM "EventSchedule" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows,
        before.rows,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        versionsBefore,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentCommandReceipt" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        receiptsBefore,
      );
      // Synthetic fixture only: simulate an external forward schedule change.
      await sql.query(
        'UPDATE "EventSchedule" SET revision=revision+1 WHERE "eventId"=$1',
        [event.id],
      );
      assert.equal(
        (await call('manager', 'GET', `${url}/${candidate.id}`)).status,
        'STALE',
      );
      await call('manager', 'POST', url, input, 409);
      const renewed = await call('manager', 'POST', url, {
        ...input,
        baselineRevision: baseline.revision + 1,
      });
      assert.equal(renewed.status, 'FOUND');
      await sql.query(
        'UPDATE "EventTeam" SET revision=revision+1 WHERE id=$1',
        [cfg.teamIds[0]],
      );
      assert.equal(
        (await call('manager', 'GET', `${url}/${renewed.id}`)).status,
        'STALE',
      );
      await call(
        'manager',
        'POST',
        url,
        { ...input, expectedRevision: planning.revision - 1 },
        409,
      );
      await send('合成赛程球队1周二不能比赛');
      assert.equal(
        (await call('manager', 'GET', `${url}/${candidate.id}`)).status,
        'STALE',
      );
      await send('请记录排程需求：希望合成赛程球队1与合成赛程球队3尽量交手');
      const revised = reply.planningRequest;
      assert.equal(
        revised.conditions.some((item) => item.kind === 'MATCHUP'),
        true,
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${planId}/confirm`,
        { expectedRevision: revised.revision },
      );
      await call(
        'manager',
        'POST',
        url,
        {
          ...input,
          baselineRevision: baseline.revision + 1,
          expectedRevision: revised.revision,
        },
        409,
      );
      const availableSession = await call(
        'manager',
        'POST',
        'agent/sessions',
        {},
      );
      const availableRoute = `agent/sessions/${availableSession.id}/messages`;
      const availablePeriod = await call('manager', 'POST', availableRoute, {
        message: '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
        eventId: event.id,
      });
      const availablePlan = await call('manager', 'POST', availableRoute, {
        message: '合成赛程球队1周三可用',
        eventId: event.id,
        planningId: availablePeriod.planningRequest.id,
        planningRevision: availablePeriod.planningRequest.revision,
      });
      assert.equal(availablePlan.status, 'PLAN');
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${availablePlan.planningRequest.id}/confirm`,
        { expectedRevision: availablePlan.planningRequest.revision },
      );
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${availablePlan.planningRequest.id}/candidates`,
        {
          ...input,
          expectedRevision: availablePlan.planningRequest.revision,
          baselineRevision: baseline.revision + 1,
        },
        409,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      await call('manager', 'GET', `${url}/${candidate.id}`, undefined, 403);
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
    },
  );

  await t.test(
    'agent candidate save: bound human confirmation creates one DRAFT and replays its receipt',
    async () => {
      const session = await call('manager', 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const messages = `agent/sessions/${session.id}/messages`;
      let reply = await call('manager', 'POST', messages, {
        message: '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
        eventId: event.id,
      });
      const planId = reply.planningRequest.id;
      for (const message of [
        '合成赛程球队2只能周三（模型短ID回归）',
        '尽量让合成赛程球队3只能周二',
      ]) {
        reply = await call('manager', 'POST', messages, {
          message,
          eventId: event.id,
          planningId: planId,
          planningRevision: reply.planningRequest.revision,
        });
      }
      await call(
        'manager',
        'POST',
        `agent/planning-requests/${planId}/confirm`,
        {
          expectedRevision: reply.planningRequest.revision,
        },
      );
      const baseline = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      const currentTeams = await call(
        'manager',
        'GET',
        `events/${event.id}/teams`,
      );
      const url = `agent/planning-requests/${planId}/candidates`;
      const input = {
        expectedRevision: reply.planningRequest.revision,
        baselineRevision: baseline.revision,
        format: 'ROUND_ROBIN',
        configSource: 'EXPLICIT',
        fixedMatchIds: [],
        config: {
          ...baseline.config,
          teamIds: currentTeams
            .filter((item) => item.active)
            .map((item) => item.id),
          startDate: '2027-06-01',
          endDate: '2027-06-07',
        },
      };
      const candidate = await call('manager', 'POST', url, input);
      assert.equal(candidate.status, 'FOUND');
      assert.equal(candidate.canSave, true);
      const second = await call('manager', 'POST', url, input);
      const before = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n;
      const preparePath = `${url}/${candidate.id}/save-ticket`;
      const ticketInput = {
        expectedPlanningRevision: candidate.planningRevision,
        expectedBaselineRevision: candidate.baselineRevision,
      };
      await call('reviewer', 'POST', preparePath, ticketInput, 403);
      await call(
        'manager',
        'POST',
        preparePath,
        { ...ticketInput, expectedBaselineRevision: baseline.revision + 1 },
        409,
      );
      const ticket = await call('manager', 'POST', preparePath, ticketInput);
      assert.equal(ticket.state, 'PENDING');
      assert.equal(ticket.canConfirm, true);
      assert.equal(
        (await call('manager', 'POST', preparePath, ticketInput)).id,
        ticket.id,
      );
      assert.equal(
        (await call('manager', 'GET', `${preparePath}/latest`)).id,
        ticket.id,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        before,
      );
      const otherTicket = await call(
        'manager',
        'POST',
        `${url}/${second.id}/save-ticket`,
        ticketInput,
      );
      const third = await call('manager', 'POST', url, input);
      const cancelledTicket = await call(
        'manager',
        'POST',
        `${url}/${third.id}/save-ticket`,
        ticketInput,
      );
      assert.equal(
        (
          await call(
            'manager',
            'POST',
            `agent/candidate-save-tickets/${cancelledTicket.id}/cancel`,
          )
        ).state,
        'CANCELLED',
      );
      await call(
        'manager',
        'POST',
        `agent/candidate-save-tickets/${cancelledTicket.id}/confirm`,
        {
          candidateId: third.id,
          candidateHash: cancelledTicket.candidateHash,
        },
        409,
      );
      const expiredCandidate = await call('manager', 'POST', url, input);
      const expiredId = randomUUID();
      await sql.query(
        'INSERT INTO "AgentCandidateSaveTicket" (id,"candidateId","ownerId","eventId","planningId","planningRevision","baselineRevision","candidateHash","toolName","toolVersion","commandId",state,"expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()-interval \'1 minute\')',
        [
          expiredId,
          expiredCandidate.id,
          users.manager,
          event.id,
          planId,
          candidate.planningRevision,
          candidate.baselineRevision,
          'a'.repeat(64),
          'schedule.draft.generate',
          'v1',
          randomUUID(),
          'PENDING',
        ],
      );
      await call(
        'manager',
        'POST',
        `agent/candidate-save-tickets/${expiredId}/confirm`,
        {
          candidateId: expiredCandidate.id,
          candidateHash: 'a'.repeat(64),
        },
        409,
      );
      const confirmPath = `agent/candidate-save-tickets/${ticket.id}/confirm`;
      await call(
        'reviewer',
        'POST',
        confirmPath,
        { candidateId: candidate.id, candidateHash: ticket.candidateHash },
        403,
      );
      await call(
        'manager',
        'POST',
        confirmPath,
        { candidateId: candidate.id, candidateHash: '0'.repeat(64) },
        409,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=false WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      await call('manager', 'GET', `${preparePath}/latest`, undefined, 403);
      await call(
        'manager',
        'POST',
        confirmPath,
        { candidateId: candidate.id, candidateHash: ticket.candidateHash },
        403,
      );
      await sql.query(
        'UPDATE "EventGrant" SET active=true WHERE "eventId"=$1 AND "memberId"=$2',
        [event.id, members.manager],
      );
      const [confirmed, concurrentReplay] = await Promise.all([
        call('manager', 'POST', confirmPath, {
          candidateId: candidate.id,
          candidateHash: ticket.candidateHash,
        }),
        call('manager', 'POST', confirmPath, {
          candidateId: candidate.id,
          candidateHash: ticket.candidateHash,
        }),
      ]).then((rows) =>
        rows.sort((a, b) => Number(a.replayed) - Number(b.replayed)),
      );
      assert.equal(confirmed.status, 'DRAFT');
      assert.equal(confirmed.revision, baseline.revision + 1);
      assert.equal(confirmed.matchCount, candidate.matches.length);
      assert.equal(confirmed.replayed, false);
      assert.equal(concurrentReplay.replayed, true);
      assert.equal(concurrentReplay.commandId, confirmed.commandId);
      base = await restartApi();
      const replay = await call('manager', 'POST', confirmPath, {
        candidateId: candidate.id,
        candidateHash: ticket.candidateHash,
      });
      assert.equal(replay.commandId, confirmed.commandId);
      assert.equal(replay.replayed, true);
      const recovered = await call('manager', 'GET', `${preparePath}/latest`);
      assert.equal(recovered.state, 'EXECUTED');
      assert.equal(recovered.receipt.commandId, confirmed.commandId);
      await call(
        'manager',
        'POST',
        `agent/candidate-save-tickets/${otherTicket.id}/confirm`,
        {
          candidateId: second.id,
          candidateHash: otherTicket.candidateHash,
        },
        409,
      );
      const current = await call(
        'manager',
        'GET',
        `events/${event.id}/schedule`,
      );
      assert.equal(current.status, 'DRAFT');
      assert.equal(current.revision, confirmed.revision);
      assert.deepEqual(current.matches, candidate.matches);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        before + 1,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AgentCandidateSaveReceipt" WHERE "eventId"=$1',
            [event.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
}
