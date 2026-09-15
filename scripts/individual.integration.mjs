import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createApplication } from '../apps/api/dist/application.js';
import { createApiClient } from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';

export async function individualIntegration(
  t,
  { base, config, sql, runtime, tokens, users, members, orgA, orgB },
) {
  async function api(key, method, route, body, status = 200) {
    const r = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    assert.equal(
      r.status,
      status,
      `${key} ${method} ${route}: ${JSON.stringify(data)}`,
    );
    assert.equal(r.headers.get('cache-control'), 'no-store');
    return data;
  }
  const eventId = (
    await api('manager', 'POST', 'events', {
      name: 'Individual synthetic event A',
      description: 'CAAU-012 API',
    })
  ).id;
  const eventB = (
    await api('managerB', 'POST', 'events', {
      name: 'Individual synthetic event B',
      description: 'Isolation',
    })
  ).id;
  const grants = {};
  for (const [key, event] of [
    ['reviewer', eventId],
    ['reviewer2', eventId],
    ['reviewer2', eventB],
  ])
    grants[`${key}:${event}`] = (
      await api('sys', 'POST', 'authorization/event-grants', {
        eventId: event,
        memberId: members[key],
      })
    ).id;
  async function task(
    handler = 'a',
    deadline = new Date(Date.now() + 3600000).toISOString(),
  ) {
    const manager = handler === 'b' ? 'managerB' : 'manager';
    const id = (
      await api(manager, 'POST', 'individual-material-tasks', {
        eventId: handler === 'b' ? eventB : eventId,
        organizationId: handler === 'b' ? orgB : orgA,
        handlerMemberId: members[handler],
        title: 'Independent materials',
      })
    ).id;
    const configured = await api(
      manager,
      'PATCH',
      `material-tasks/${id}/requirements`,
      { expectedRevision: 1, requirements: { deadline, materials: [] } },
    );
    const published = await api(
      manager,
      'POST',
      `material-tasks/${id}/publish`,
      { expectedRevision: configured.revision },
    );
    assert.equal(published.reviewerMemberId, null);
    assert.equal(published.individualChannel, true);
    return id;
  }
  const taskId = await task(),
    otherTask = await task('b');
  const body = (title = '自由材料') => ({
    title,
    category: '自由类别',
    text: '合成内容',
    fileIds: [],
  });
  async function create(id = taskId, key = 'a', value = body()) {
    return (
      await api(key, 'POST', 'individual-materials', {
        id: randomUUID(),
        taskId: id,
        key: randomUUID(),
        content: value,
      })
    ).current;
  }
  const snap = async (key, id) =>
    (await api(key, 'GET', `individual-materials/snapshot?selectedId=${id}`))
      .selected;
  const command = (m, extra = {}) => ({
    key: randomUUID(),
    expectedRevision: m.revision,
    generation: m.generation,
    expectedDraftRevision: m.draftRevision,
    ...(m.currentSubmissionId ? { submissionId: m.currentSubmissionId } : {}),
    ...extra,
  });
  async function change(key, op, m, extra = {}, status = 200) {
    return api(
      key,
      'POST',
      `individual-materials/${m.id}/${op}`,
      command(m, extra),
      status,
    );
  }
  let first, second, other, fileId;
  await t.test(
    'individual five states, independent submit, shared reviewer continuation and immutable V1/V2',
    async () => {
      first = await create();
      second = await create(taskId, 'a', body('第二份不同材料'));
      other = await create(otherTask, 'b');
      assert.equal(
        (
          await api(
            'reviewer',
            'GET',
            `individual-materials/snapshot?taskId=${taskId}`,
          )
        ).total,
        0,
      );
      first = (await change('a', 'submit', first)).current;
      assert.equal(first.state, 'PENDING_REVIEW');
      assert.equal((await snap('a', second.id)).state, 'DRAFT');
      const sdk = createApiClient(base, createFetchTransport());
      const snapshot = await sdk.request('getIndividualSnapshot', {
        token: tokens.reviewer2,
        query: { selectedId: first.id, limit: 10 },
      });
      assert.equal(snapshot.selected.draft, null);
      first = (await change('reviewer', 'start-review', first)).current;
      assert.equal(first.state, 'IN_REVIEW');
      first = (
        await change('reviewer2', 'return', first, {
          reason: '资料缺项',
          modification: '请补充说明',
        })
      ).current;
      assert.equal(first.state, 'RETURNED');
      const local = await snap('a', first.id);
      first = (
        await api('a', 'PATCH', `individual-materials/${first.id}/draft`, {
          expectedDraftRevision: local.draftRevision,
          generation: local.generation,
          content: body('修改后材料'),
        })
      ).current;
      assert.equal(first.state, 'RETURNED');
      first = (await change('a', 'submit', first)).current;
      assert.equal(first.submission.version, 2);
      first = (await change('reviewer2', 'start-review', first)).current;
      first = (await change('reviewer', 'approve', first)).current;
      assert.equal(first.state, 'APPROVED');
      const history = await api(
        'reviewer2',
        'GET',
        `individual-materials/${first.id}/history`,
      );
      assert.equal(history.submissions.length, 2);
      assert.equal(history.submissions[1].content.title, '自由材料');
      assert.equal(
        history.actions.find((a) => a.action === 'RETURN').actorId,
        users.reviewer2,
      );
      assert.equal(
        history.actions.find((a) => a.action === 'RETURN').actorName,
        'Synthetic reviewer2',
      );
      assert.equal(history.actions.at(-1).actorId, users.a);
      assert.ok(
        history.actions.every((a) => a.occurredAt && a.content === null),
      );
      await change('reviewer', 'start-review', first, {}, 409);
    },
  );
  await t.test(
    'simultaneous contrary decisions return 200/409 current; identical commands replay once',
    async () => {
      const request = command(second);
      const submitted = await api(
        'a',
        'POST',
        `individual-materials/${second.id}/submit`,
        request,
      );
      const replay = await api(
        'a',
        'POST',
        `individual-materials/${second.id}/submit`,
        request,
      );
      assert.equal(replay.resultSubmissionId, submitted.resultSubmissionId);
      await api(
        'a',
        'POST',
        `individual-materials/${second.id}/submit`,
        { ...request, expectedRevision: 99 },
        409,
      );
      second = (await change('reviewer', 'start-review', submitted.current))
        .current;
      const results = await Promise.all(
        ['approve', 'return'].map((op, i) =>
          fetch(`${base}/api/v1/individual-materials/${second.id}/${op}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens[i ? 'reviewer2' : 'reviewer']}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              command(second, { reason: '并发退回', modification: '补充' }),
            ),
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const losing = await results.find((r) => r.status === 409).json();
      assert.ok(losing.current.revision > second.revision);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "IndividualAction" WHERE "submissionId"=$1 AND action IN (\'APPROVE\',\'RETURN\')',
            [second.currentSubmissionId],
          )
        ).rows[0].n,
        1,
      );
      second = await snap('a', second.id);
      const createRequest = {
        id: randomUUID(),
        taskId,
        key: randomUUID(),
        content: body('幂等新建'),
      };
      const created = await Promise.all([
        api('a', 'POST', 'individual-materials', createRequest),
        api('a', 'POST', 'individual-materials', createRequest),
      ]);
      assert.equal(created[0].current.id, created[1].current.id);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "IndividualMaterial" WHERE id=$1',
            [createRequest.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    'concurrent draft/start and concurrent same-key submission never duplicate history',
    async () => {
      let m = await create();
      const route = `individual-materials/${m.id}/draft`;
      const results = await Promise.all(
        ['甲窗口', '乙窗口'].map((title) =>
          fetch(`${base}/api/v1/${route}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${tokens.a}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              expectedDraftRevision: m.draftRevision,
              generation: m.generation,
              content: body(title),
            }),
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      m = await snap('a', m.id);
      const req = command(m);
      const submissions = await Promise.all([
        api('a', 'POST', `individual-materials/${m.id}/submit`, req),
        api('a', 'POST', `individual-materials/${m.id}/submit`, req),
      ]);
      assert.equal(
        submissions[0].resultSubmissionId,
        submissions[1].resultSubmissionId,
      );
      m = submissions[0].current;
      const starts = await Promise.all(
        ['reviewer', 'reviewer2'].map((key) =>
          fetch(`${base}/api/v1/individual-materials/${m.id}/start-review`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens[key]}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(command(m)),
          }),
        ),
      );
      assert.deepEqual(starts.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "IndividualAction" WHERE "materialId"=$1 AND action=\'START\'',
            [m.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    'private individual uploads, confirmation, binding, historical hash and isolation',
    async () => {
      const m = await create();
      const bytes = Buffer.from('private individual synthetic file');
      const metadata = {
        originalName: '合成附件.txt',
        extension: 'txt',
        expectedBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        generation: m.generation,
      };
      const file = await api(
        'a',
        'POST',
        `individual-materials/${m.id}/uploads`,
        metadata,
      );
      fileId = file.id;
      const sdk = createApiClient(base, createFetchTransport());
      await sdk.request('uploadIndividualContent', {
        token: tokens.a,
        path: { id: fileId },
        body: Uint8Array.from(bytes).buffer,
      });
      await api('a', 'POST', `individual-uploads/${fileId}/confirm`);
      await api(
        'reviewer',
        'GET',
        `individual-uploads/${fileId}/info`,
        undefined,
        403,
      );
      const saved = (
        await api('a', 'PATCH', `individual-materials/${m.id}/draft`, {
          expectedDraftRevision: m.draftRevision,
          generation: m.generation,
          content: { ...body(), fileIds: [fileId] },
        })
      ).current;
      await change('a', 'submit', saved);
      const actual = await sdk.request('downloadIndividualContent', {
        token: tokens.reviewer2,
        path: { id: fileId },
      });
      assert.deepEqual(Buffer.from(actual), bytes);
      for (const key of ['b', 'sys', 'managerB', 'a2'])
        await api(
          key,
          'GET',
          `individual-uploads/${fileId}/info`,
          undefined,
          403,
        );
      await api(
        'b',
        'PATCH',
        `individual-materials/${other.id}/draft`,
        {
          expectedDraftRevision: other.draftRevision,
          generation: other.generation,
          content: { ...body(), fileIds: [fileId] },
        },
        403,
      );
      const invalid = await create();
      const bad = await api(
        'a',
        'POST',
        `individual-materials/${invalid.id}/uploads`,
        { ...metadata, sha256: '0'.repeat(64) },
      );
      await sdk.request('uploadIndividualContent', {
        token: tokens.a,
        path: { id: bad.id },
        body: Uint8Array.from(bytes).buffer,
      });
      await api(
        'a',
        'POST',
        `individual-uploads/${bad.id}/confirm`,
        undefined,
        400,
      );
    },
  );
  await t.test(
    'default deny across events, actors, roles and draft-only materials',
    async () => {
      for (const key of ['b', 'sys', 'managerB', 'a2']) {
        await api(
          key,
          'GET',
          `individual-materials/snapshot?selectedId=${first.id}`,
          undefined,
          403,
        );
        await api(
          key,
          'GET',
          `individual-materials/${first.id}/history`,
          undefined,
          403,
        );
        await change(key, 'approve', first, {}, 403);
      }
      await change('a', 'approve', first, {}, 403);
      await api(
        'reviewer',
        'GET',
        `individual-materials/snapshot?selectedId=${other.id}`,
        undefined,
        403,
      );
      const draft = await create();
      await api(
        'reviewer2',
        'GET',
        `individual-materials/snapshot?selectedId=${draft.id}`,
        undefined,
        403,
      );
      await change(
        'reviewer2',
        'start-review',
        draft,
        { submissionId: randomUUID() },
        403,
      );
      assert.equal(
        (
          await api(
            'reviewer',
            'GET',
            `individual-materials/snapshot?taskId=${otherTask}`,
          )
        ).total,
        0,
      );
    },
  );
  await t.test(
    'deadline save-only, extension, same-organization handover, old generation rejection and close',
    async () => {
      const expiredTask = await task(
        'a',
        new Date(Date.now() - 60000).toISOString(),
      );
      let m = await create(expiredTask);
      m = (
        await api('a', 'PATCH', `individual-materials/${m.id}/draft`, {
          expectedDraftRevision: m.draftRevision,
          generation: m.generation,
          content: body('逾期可存'),
        })
      ).current;
      await change('a', 'submit', m, {}, 409);
      let e = await api(
        'manager',
        'GET',
        `material-tasks/${expiredTask}/execution`,
      );
      e = await api(
        'manager',
        'POST',
        `material-tasks/${expiredTask}/extensions`,
        {
          expectedRevision: e.revision,
          newDeadline: new Date(Date.now() + 3600000).toISOString(),
          reason: '合成延期',
        },
      );
      await api('manager', 'POST', `material-tasks/${expiredTask}/handover`, {
        expectedRevision: e.revision,
        handlerMemberId: members.a2,
      });
      await api(
        'a',
        'GET',
        `individual-materials/snapshot?selectedId=${m.id}`,
        undefined,
        403,
      );
      await api(
        'a2',
        'PATCH',
        `individual-materials/${m.id}/draft`,
        {
          expectedDraftRevision: m.draftRevision,
          generation: m.generation,
          content: body(),
        },
        409,
      );
      m = await snap('a2', m.id);
      assert.equal(m.draft.title, '逾期可存');
      m = (await change('a2', 'submit', m)).current;
      e = await api(
        'manager',
        'GET',
        `material-tasks/${expiredTask}/execution`,
      );
      await api('manager', 'POST', `material-tasks/${expiredTask}/close`, {
        expectedRevision: e.revision,
        reason: '合成关闭',
      });
      await change('reviewer', 'start-review', m, {}, 409);
      assert.equal((await snap('a2', m.id)).closed, true);
    },
  );
  await t.test(
    'optional reference preserves its earlier deadline and file limits without blocking free materials',
    async () => {
      const id = (
        await api('manager', 'POST', 'individual-material-tasks', {
          eventId,
          organizationId: orgA,
          handlerMemberId: members.a,
          title: 'Reference optional',
        })
      ).id;
      const referenceId = randomUUID(),
        deadline = new Date(Date.now() + 3600000).toISOString();
      const configured = await api(
        'manager',
        'PATCH',
        `material-tasks/${id}/requirements`,
        {
          expectedRevision: 1,
          requirements: {
            deadline,
            materials: [
              {
                id: referenceId,
                title: 'Optional reference',
                required: true,
                instructions: 'Reference instructions',
                templateVersion: 'v1',
                formats: ['txt'],
                maxBytes: 10,
                deadline: new Date(Date.now() - 60000).toISOString(),
                acceptanceStandard: 'Reference standard',
              },
            ],
          },
        },
      );
      await api('manager', 'POST', `material-tasks/${id}/publish`, {
        expectedRevision: configured.revision,
      });
      const m = (
        await api('a', 'POST', 'individual-materials', {
          id: randomUUID(),
          taskId: id,
          key: randomUUID(),
          requirementItemId: referenceId,
          content: body(),
        })
      ).current;
      await change('a', 'submit', m, {}, 409);
      await api(
        'a',
        'POST',
        `individual-materials/${m.id}/uploads`,
        {
          originalName: 'large.txt',
          extension: 'txt',
          expectedBytes: 11,
          sha256: '0'.repeat(64),
          generation: m.generation,
        },
        400,
      );
      const free = await create(id);
      assert.equal(
        (await change('a', 'submit', free)).current.state,
        'PENDING_REVIEW',
      );
    },
  );
  await t.test(
    'event-specific revoke preserves grant and history; no snapshot/download/command replay after revoke',
    async () => {
      const grantId = grants[`reviewer2:${eventId}`];
      await api('sys', 'PATCH', `event-grants/${grantId}/active`, {
        active: false,
      });
      await api(
        'reviewer2',
        'GET',
        `individual-materials/snapshot?selectedId=${first.id}`,
        undefined,
        403,
      );
      assert.equal(
        (
          await api(
            'reviewer2',
            'GET',
            `individual-materials/snapshot?taskId=${taskId}`,
          )
        ).total,
        0,
      );
      await api(
        'reviewer2',
        'GET',
        `individual-uploads/${fileId}/info`,
        undefined,
        403,
      );
      await change('reviewer2', 'approve', second, {}, 403);
      // Other event remains explicitly authorized (after organizer submits).
      other = (await change('b', 'submit', other)).current;
      assert.equal((await snap('reviewer2', other.id)).id, other.id);
      assert.equal(
        (
          await sql.query('SELECT active FROM "EventGrant" WHERE id=$1', [
            grantId,
          ])
        ).rows[0].active,
        false,
      );
      await api('sys', 'PATCH', `event-grants/${grantId}/active`, {
        active: true,
      });
      await api('sys', 'PATCH', `authorization/members/${members.reviewer2}`, {
        active: false,
      });
      await api(
        'reviewer2',
        'GET',
        `individual-materials/${first.id}/history`,
        undefined,
        403,
      );
      await api('sys', 'PATCH', `authorization/members/${members.reviewer2}`, {
        active: true,
      });
      await sql.query(
        'UPDATE "Session" SET "expiresAt"=now()-interval \'1 second\' WHERE "tokenHash"=$1',
        [createHash('sha256').update(tokens.reviewer2).digest('hex')],
      );
      await api(
        'reviewer2',
        'GET',
        'individual-materials/snapshot',
        undefined,
        401,
      );
      await sql.query(
        'UPDATE "Session" SET "expiresAt"=now()+interval \'1 hour\' WHERE "tokenHash"=$1',
        [createHash('sha256').update(tokens.reviewer2).digest('hex')],
      );
    },
  );
  await t.test(
    'own-organization reviewer conflicts, inactive user and logged-out session fail closed',
    async () => {
      const conflict = await api('sys', 'POST', 'authorization/members', {
        userId: users.reviewer2,
        organizationId: orgA,
        role: 'REVIEWER',
      });
      await api(
        'reviewer2',
        'GET',
        `individual-materials/snapshot?selectedId=${first.id}`,
        undefined,
        403,
      );
      await api('sys', 'PATCH', `authorization/members/${conflict.id}`, {
        active: false,
      });
      await api('sys', 'PATCH', `authorization/users/${users.reviewer2}`, {
        active: false,
      });
      await api(
        'reviewer2',
        'GET',
        'individual-materials/snapshot',
        undefined,
        401,
      );
      await api('sys', 'PATCH', `authorization/users/${users.reviewer2}`, {
        active: true,
      });
      const saved = tokens.reviewer2,
        token = randomBytes(32).toString('base64url');
      await sql.query(
        'INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 hour\')',
        [
          randomUUID(),
          createHash('sha256').update(token).digest('hex'),
          users.reviewer2,
        ],
      );
      tokens.reviewer2 = token;
      try {
        await api('reviewer2', 'POST', 'authorization/logout');
        await api(
          'reviewer2',
          'GET',
          'individual-materials/snapshot',
          undefined,
          401,
        );
        await api(
          'reviewer2',
          'GET',
          `individual-uploads/${fileId}/info`,
          undefined,
          401,
        );
      } finally {
        tokens.reviewer2 = saved;
      }
    },
  );
  await t.test(
    'explicit activation freezes legacy writes without converting submissions or widening old reviewer access',
    async () => {
      let legacy = await api('manager', 'POST', 'material-tasks', {
        eventId,
        organizationId: orgA,
        handlerMemberId: members.a,
        reviewerMemberId: members.reviewer,
        title: 'Legacy read only fixture',
      });
      const materialId = randomUUID(),
        deadline = new Date(Date.now() + 3600000).toISOString();
      legacy = await api(
        'manager',
        'PATCH',
        `material-tasks/${legacy.id}/requirements`,
        {
          expectedRevision: legacy.revision,
          requirements: {
            deadline,
            materials: [
              {
                id: materialId,
                title: 'Old required item',
                required: true,
                instructions: 'Old instructions',
                templateVersion: 'old-v1',
                formats: ['txt'],
                maxBytes: 1024,
                deadline,
                acceptanceStandard: 'Old standard',
              },
            ],
          },
        },
      );
      legacy = await api(
        'manager',
        'POST',
        `material-tasks/${legacy.id}/publish`,
        { expectedRevision: legacy.revision },
      );
      const draft = await api(
        'a',
        'PATCH',
        `material-tasks/${legacy.id}/draft`,
        {
          expectedRevision: 1,
          entries: [{ materialId, text: 'Legacy submitted text', fileIds: [] }],
        },
      );
      const submission = await api(
        'a',
        'POST',
        `material-tasks/${legacy.id}/submissions`,
        { expectedDraftRevision: draft.revision, idempotencyKey: randomUUID() },
      );
      const before = await api(
        'a',
        'GET',
        `material-tasks/${legacy.id}/submissions`,
      );
      const execution = await api(
        'manager',
        'GET',
        `material-tasks/${legacy.id}/execution`,
      );
      await api(
        'a',
        'POST',
        `material-tasks/${legacy.id}/individual-channel`,
        { expectedRevision: execution.revision, reason: 'not manager' },
        403,
      );
      await api(
        'manager',
        'POST',
        `material-tasks/${legacy.id}/individual-channel`,
        {
          expectedRevision: execution.revision,
          reason: 'Explicit legacy freeze',
        },
      );
      const rejection = await api(
        'a',
        'PATCH',
        `material-tasks/${legacy.id}/draft`,
        { expectedRevision: draft.revision, entries: [] },
        409,
      );
      assert.equal(rejection.code, 'LEGACY_READ_ONLY');
      await api(
        'a',
        'POST',
        `material-tasks/${legacy.id}/submissions`,
        { expectedDraftRevision: draft.revision, idempotencyKey: randomUUID() },
        409,
      );
      await api(
        'reviewer',
        'POST',
        `material-tasks/${legacy.id}/reviews`,
        { submissionId: submission.id, decision: 'PASS', issues: [] },
        409,
      );
      await api(
        'reviewer2',
        'GET',
        `material-tasks/${legacy.id}/submissions`,
        undefined,
        403,
      );
      assert.deepEqual(
        await api('a', 'GET', `material-tasks/${legacy.id}/submissions`),
        before,
      );
      assert.equal(
        (
          await api(
            'reviewer2',
            'GET',
            `individual-materials/snapshot?taskId=${legacy.id}`,
          )
        ).total,
        0,
      );
      const m = await create(legacy.id);
      await change('a', 'submit', m);
      assert.equal(
        (
          await api(
            'reviewer2',
            'GET',
            `individual-materials/snapshot?taskId=${legacy.id}`,
          )
        ).total,
        1,
      );
    },
  );
  await t.test(
    'audit failure rolls back state, immutable rows reject owner/runtime DML, restart restores authoritative state',
    async () => {
      const m = await create();
      await sql.query('REVOKE INSERT ON "AuditRecord" FROM caau_test_app');
      try {
        await change('a', 'submit', m, {}, 503);
      } finally {
        await sql.query('GRANT INSERT ON "AuditRecord" TO caau_test_app');
      }
      assert.equal((await snap('a', m.id)).state, 'DRAFT');
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "IndividualSubmission" WHERE "materialId"=$1',
            [m.id],
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(
        sql.query(
          'INSERT INTO "IndividualAction" (id,"materialId","submissionId",revision,action,"fromState","toState","actorId",detail) VALUES ($1,$2,$3,999,\'RETURN\',\'IN_REVIEW\',\'RETURNED\',$4,$5)',
          [
            randomUUID(),
            first.id,
            first.currentSubmissionId,
            users.reviewer2,
            { reason: 'forged decision', modification: 'forged correction' },
          ],
        ),
        (e) => e.code === '23505',
      );
      await sql.query('BEGIN');
      try {
        await sql.query(
          'UPDATE "IndividualMaterial" SET revision=revision+1 WHERE id=$1',
          [m.id],
        );
        await assert.rejects(sql.query('COMMIT'), (e) => e.code === '23514');
      } finally {
        await sql.query('ROLLBACK');
      }
      assert.equal((await snap('a', m.id)).revision, m.revision);
      for (const client of [sql, runtime])
        for (const table of [
          'IndividualSubmission',
          'IndividualAction',
          'IndividualCommand',
          'IndividualAttachment',
          'TaskMaterialChannel',
        ]) {
          await assert.rejects(
            client.query(
              `UPDATE "${table}" SET ${table === 'IndividualAttachment' ? '"fileId"="fileId"' : table === 'TaskMaterialChannel' ? '"taskId"="taskId"' : 'id=id'}`,
            ),
          );
        }
      const restarted = await createApplication(config);
      try {
        await restarted.listen(0, '127.0.0.1');
        const r = await fetch(
          `${await restarted.getUrl()}/api/v1/individual-materials/snapshot?selectedId=${first.id}`,
          { headers: { Authorization: `Bearer ${tokens.reviewer}` } },
        );
        assert.equal(r.status, 200);
        assert.equal((await r.json()).selected.state, 'APPROVED');
      } finally {
        await restarted.close();
      }
    },
  );
}
