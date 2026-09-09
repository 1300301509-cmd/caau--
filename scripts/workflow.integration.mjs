import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createApiClient } from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';
import { createApplication } from '../apps/api/dist/application.js';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function workflowIntegration(
  t,
  { base, config, sql, runtime, tokens, users, members, orgA, orgB },
) {
  const sdk = createApiClient(base, createFetchTransport());
  async function api(key, method, route, body, status = 200) {
    const r = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(r.status, status, `${key} ${method} ${route}`);
    return r.json();
  }
  const eventId = (
    await api('manager', 'POST', 'events', {
      name: 'Workflow synthetic event',
      description: 'Phase 2 API integration',
    })
  ).id;
  async function task(
    key = 'a',
    deadline = new Date(Date.now() + 3600000).toISOString(),
  ) {
    let value = await api('manager', 'POST', 'material-tasks', {
      eventId,
      title: 'Synthetic workflow task',
      organizationId: key === 'b' ? orgB : orgA,
      handlerMemberId: members[key],
      reviewerMemberId: members.reviewer,
    });
    const materialId = randomUUID();
    const requirements = {
      deadline,
      materials: [
        {
          id: materialId,
          title: 'Synthetic required material',
          required: true,
          instructions: 'Synthetic instruction',
          templateVersion: 'fixture-v1',
          formats: ['txt', 'pdf'],
          maxBytes: 1048576,
          deadline,
          acceptanceStandard: 'Synthetic standard',
        },
      ],
    };
    value = await api(
      'manager',
      'PATCH',
      `material-tasks/${value.id}/requirements`,
      { expectedRevision: 1, requirements },
    );
    value = await api('manager', 'POST', `material-tasks/${value.id}/publish`, {
      expectedRevision: value.revision,
    });
    return { id: value.id, materialId };
  }
  const draft = (key, id) => api(key, 'GET', `material-tasks/${id}/draft`);
  const execution = (id) =>
    api('manager', 'GET', `material-tasks/${id}/execution`);
  const save = (key, task, revision, text = '', fileIds = [], status = 200) =>
    api(
      key,
      'PATCH',
      `material-tasks/${task.id}/draft`,
      {
        expectedRevision: revision,
        entries: [{ materialId: task.materialId, text, fileIds }],
      },
      status,
    );
  const submit = (
    key,
    id,
    expectedDraftRevision,
    idempotencyKey = randomUUID(),
    status = 200,
  ) =>
    api(
      key,
      'POST',
      `material-tasks/${id}/submissions`,
      { expectedDraftRevision, idempotencyKey },
      status,
    );
  const intent = (key, task, bytes, extra = {}) =>
    api(key, 'POST', `material-tasks/${task.id}/uploads`, {
      materialId: task.materialId,
      extension: 'txt',
      expectedBytes: bytes.length,
      sha256: hash(bytes),
      ...extra,
    });
  async function upload(
    key,
    task,
    bytes = Buffer.from('synthetic private material'),
    originalName,
  ) {
    const value = await intent(key, task, bytes, { originalName });
    await sdk.request('uploadPrivateContent', {
      token: tokens[key],
      path: { id: value.id },
      body: Uint8Array.from(bytes).buffer,
    });
    assert.equal(
      (await api(key, 'POST', `uploads/${value.id}/confirm`)).state,
      'CONFIRMED',
    );
    return value.id;
  }
  const a = await task();
  const b = await task('b');
  let fileA;
  await t.test(
    'real private upload confirmation/binding/download rejects cross-organization and unbound access',
    async () => {
      fileA = await upload('a', a, undefined, '../方案\r\n.exe');
      await api('a', 'GET', `uploads/${fileA}/content`, undefined, 403);
      await api('b', 'POST', `uploads/${fileA}/confirm`, undefined, 403);
      await save('b', b, 1, '', [fileA], 403);
      assert.equal((await draft('b', b.id)).revision, 1);
      const saved = await save('a', a, 1, '', [fileA]);
      assert.equal(saved.revision, 2);
      const downloaded = await sdk.request('downloadPrivateContent', {
        token: tokens.a,
        path: { id: fileA },
      });
      assert.equal(
        Buffer.from(downloaded).toString(),
        'synthetic private material',
      );
      const info = await api('a', 'GET', `uploads/${fileA}/info`);
      assert.equal(info.name, '方案.txt');
      assert.equal(info.originalNameKnown, true);
      assert.equal(info.extension, 'txt');
      assert.ok(!('storageKey' in info));
      const response = await fetch(`${base}/api/v1/uploads/${fileA}/content`, {
        headers: { Authorization: `Bearer ${tokens.a}` },
      });
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get('content-disposition'),
        `attachment; filename="material.txt"; filename*=UTF-8''${encodeURIComponent('方案.txt')}`,
      );
      await response.arrayBuffer();
      for (const key of ['b', 'sys', 'a2', 'reviewer']) {
        await api(key, 'GET', `uploads/${fileA}/content`, undefined, 403);
        await api(key, 'GET', `uploads/${fileA}/info`, undefined, 403);
      }
      const unauth = await fetch(`${base}/api/v1/uploads/${fileA}/content`);
      assert.equal(unauth.status, 401);
      assert.equal((await fetch(`${base}/files/${fileA}`)).status, 404);
      const object = (
        await sql.query('SELECT "storageKey" FROM "FileUpload" WHERE id=$1', [
          fileA,
        ])
      ).rows[0];
      assert.equal(
        hash(
          await readFile(path.join(config.privateFileRoot, object.storageKey)),
        ),
        hash(Buffer.from('synthetic private material')),
      );
    },
  );
  await t.test(
    'partial upload, forged hash and missing confirmation never create valid submission',
    async () => {
      const bad = await task();
      const bytes = Buffer.from('truncated');
      const value = await intent('a', bad, bytes, {
        expectedBytes: bytes.length + 1,
      });
      const response = await fetch(
        `${base}/api/v1/uploads/${value.id}/content`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.a}`,
            'Content-Type': 'application/octet-stream',
          },
          body: bytes,
        },
      );
      assert.equal(response.status, 400);
      await api('a', 'POST', `uploads/${value.id}/confirm`, undefined, 409);
      await save('a', bad, 1, '', [value.id], 403);
      await submit('a', bad.id, 1, randomUUID(), 400);
      const corrupt = await intent('a', bad, bytes, { sha256: '0'.repeat(64) });
      await sdk.request('uploadPrivateContent', {
        token: tokens.a,
        path: { id: corrupt.id },
        body: Uint8Array.from(bytes).buffer,
      });
      await api('a', 'POST', `uploads/${corrupt.id}/confirm`, undefined, 400);
      await save('a', bad, 1, '', [corrupt.id], 403);
      assert.equal(
        (await api('a', 'GET', `material-tasks/${bad.id}/submissions`)).length,
        0,
      );
    },
  );
  await t.test(
    'draft optimistic concurrency preserves one edit and forbids reviewers/content substitution',
    async () => {
      const responses = await Promise.all(
        [1, 2].map((n) =>
          fetch(`${base}/api/v1/material-tasks/${b.id}/draft`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${tokens.b}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              expectedRevision: 1,
              entries: [
                { materialId: b.materialId, text: `version ${n}`, fileIds: [] },
              ],
            }),
          }),
        ),
      );
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await draft('b', b.id)).revision, 2);
      assert.equal(
        (await api('b', 'GET', `material-tasks/${b.id}/draft-history`)).length,
        1,
      );
      await save('reviewer', b, 2, 'reviewer overwrite', [], 403);
      await api(
        'reviewer',
        'GET',
        `material-tasks/${b.id}/draft`,
        undefined,
        403,
      );
      await save(
        'b',
        { ...b, materialId: randomUUID() },
        2,
        'wrong material',
        [],
        400,
      );
    },
  );
  let late;
  await t.test(
    'server deadline rejects submission but allows drafts; audited headquarters extension enables submission',
    async () => {
      late = await task('a', '2000-01-01T00:00:00.000Z');
      const saved = await save('a', late, 1, 'late draft remains editable');
      await submit('a', late.id, saved.revision, randomUUID(), 409);
      await api(
        'a',
        'POST',
        `material-tasks/${late.id}/extensions`,
        {
          expectedRevision: 1,
          newDeadline: '2099-01-01T00:00:00Z',
          reason: 'not allowed',
        },
        403,
      );
      const before = await execution(late.id);
      const changed = await api(
        'manager',
        'POST',
        `material-tasks/${late.id}/extensions`,
        {
          expectedRevision: before.revision,
          newDeadline: '2099-01-01T00:00:00Z',
          reason: 'Synthetic headquarters extension',
        },
      );
      assert.equal(changed.deadlines.task, '2099-01-01T00:00:00.000Z');
      const history = await api(
        'a',
        'GET',
        `material-tasks/${late.id}/extensions`,
      );
      assert.equal(history.length, 1);
      assert.equal(history[0].actorId, users.manager);
      assert.equal(history[0].previous.task, '2000-01-01T00:00:00.000Z');
      assert.equal(history[0].next.task, changed.deadlines.task);
      assert.ok(history[0].occurredAt);
      assert.equal(
        (await api('a', 'GET', `material-tasks/${late.id}`)).requirements
          .deadline,
        '2000-01-01T00:00:00.000Z',
      );
      await submit('a', late.id, saved.revision);
    },
  );
  await t.test(
    'whole-package PASS freezes further edits/submission and is readable as retained history',
    async () => {
      const version = (
        await api('a', 'GET', `material-tasks/${late.id}/submissions`)
      )[0];
      await api('reviewer', 'POST', `material-tasks/${late.id}/reviews`, {
        submissionId: version.id,
        decision: 'PASS',
        issues: [],
      });
      assert.equal((await execution(late.id)).state, 'APPROVED');
      await save('a', late, 2, 'cannot edit approved', [], 409);
      await submit('a', late.id, 2, randomUUID(), 409);
      assert.equal(
        (await api('a', 'GET', `material-tasks/${late.id}/submissions`))[0]
          .review.decision,
        'PASS',
      );
    },
  );
  let v1;
  await t.test(
    'repeated and concurrent submits produce one immutable version, even after response loss/retry',
    async () => {
      const key = randomUUID();
      const results = await Promise.all([
        submit('a', a.id, 2, key),
        submit('a', a.id, 2, key),
      ]);
      assert.equal(results[0].id, results[1].id);
      v1 = results[0];
      assert.equal(v1.version, 1);
      assert.equal(v1.actorId, users.a);
      await submit('a', a.id, 3, key, 409);
      await submit('a', a.id, 2, randomUUID(), 409);
      await save('a', a, 2, 'overwrite submitted', [], 409);
      assert.equal(
        (await api('a', 'GET', `material-tasks/${a.id}/submissions`)).length,
        1,
      );
      await assert.rejects(
        runtime.query(
          'UPDATE "SubmissionVersion" SET "actorId"=$1 WHERE id=$2',
          [users.b, v1.id],
        ),
        (e) => e.code === '42501',
      );
      await assert.rejects(
        sql.query('UPDATE "SubmissionVersion" SET entries=\'[]\' WHERE id=$1', [
          v1.id,
        ]),
        (e) => e.code === '42501',
      );
      const bytes = await sdk.request('downloadPrivateContent', {
        token: tokens.reviewer,
        path: { id: fileA },
      });
      assert.ok(bytes.byteLength > 0);
    },
  );
  let beforeReview;
  await t.test(
    'same-organization handover inherits draft/files and immediately denies old handler, preserving submitter',
    async () => {
      const hand = await task();
      const attached = await upload('a', hand);
      const pending = await intent(
        'a',
        hand,
        Buffer.from('pending before handover'),
      );
      await save('a', hand, 1, 'original editor', [attached]);
      const oldEdits = await api(
        'a',
        'GET',
        `material-tasks/${hand.id}/draft-history`,
      );
      await api(
        'manager',
        'POST',
        `material-tasks/${hand.id}/handover`,
        { expectedRevision: 1, handlerMemberId: members.b },
        409,
      );
      await api('manager', 'POST', `material-tasks/${hand.id}/handover`, {
        expectedRevision: 1,
        handlerMemberId: members.a2,
      });
      const inherited = await draft('a2', hand.id);
      assert.equal(inherited.entries[0].text, 'original editor');
      assert.deepEqual(inherited.entries[0].fileIds, [attached]);
      assert.deepEqual(
        (await api('a2', 'GET', `material-tasks/${hand.id}/draft-history`))[0],
        oldEdits[0],
      );
      for (const route of [
        `material-tasks/${hand.id}/draft`,
        `uploads/${attached}/content`,
      ])
        await api('a', 'GET', route, undefined, 403);
      await save('a', hand, inherited.revision, 'old editor', [], 403);
      await submit('a', hand.id, inherited.revision, randomUUID(), 403);
      await api('a2', 'POST', `uploads/${pending.id}/confirm`, undefined, 403);
      await api('a', 'POST', `uploads/${pending.id}/confirm`, undefined, 403);
      const inheritedBytes = await sdk.request('downloadPrivateContent', {
        token: tokens.a2,
        path: { id: attached },
      });
      assert.ok(inheritedBytes.byteLength > 0);
      await submit('a2', hand.id, inherited.revision);
      // Also hand over while a submitted version is under review: historical actor/time must not change.
      beforeReview = await execution(a.id);
      await api('manager', 'POST', `material-tasks/${a.id}/handover`, {
        expectedRevision: beforeReview.revision,
        handlerMemberId: members.a2,
      });
      const original = (
        await api('a2', 'GET', `material-tasks/${a.id}/submissions`)
      )[0];
      assert.equal(original.actorId, users.a);
      assert.equal(original.submittedAt, v1.submittedAt);
      assert.deepEqual(original.entries, v1.entries);
    },
  );
  await t.test(
    'material-specific return creates a new draft; resubmit V2 and concurrent review cannot overwrite history',
    async () => {
      await api(
        'reviewer',
        'POST',
        `material-tasks/${a.id}/reviews`,
        { submissionId: v1.id, decision: 'RETURN', issues: [] },
        400,
      );
      await api(
        'reviewer',
        'POST',
        `material-tasks/${a.id}/reviews`,
        {
          submissionId: v1.id,
          decision: 'RETURN',
          issues: [
            { materialId: randomUUID(), reason: 'wrong', instruction: 'wrong' },
          ],
        },
        400,
      );
      await api(
        'a2',
        'POST',
        `material-tasks/${a.id}/reviews`,
        { submissionId: v1.id, decision: 'PASS', issues: [] },
        403,
      );
      const returned = await api(
        'reviewer',
        'POST',
        `material-tasks/${a.id}/reviews`,
        {
          submissionId: v1.id,
          decision: 'RETURN',
          issues: [
            {
              materialId: a.materialId,
              reason: 'Synthetic material correction',
              instruction: 'Replace the plan',
            },
          ],
        },
      );
      assert.equal(returned.issues[0].materialId, a.materialId);
      let next = await draft('a2', a.id);
      assert.equal(next.baseSubmissionId, v1.id);
      assert.deepEqual(next.entries, v1.entries);
      next = await save('a2', a, next.revision, 'corrected V2', [fileA]);
      const v2 = await submit('a2', a.id, next.revision);
      assert.equal(v2.version, 2);
      assert.equal(v2.actorId, users.a2);
      const results = await Promise.all(
        ['PASS', 'RETURN'].map((decision) =>
          fetch(`${base}/api/v1/material-tasks/${a.id}/reviews`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.reviewer}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              submissionId: v2.id,
              decision,
              issues:
                decision === 'PASS'
                  ? []
                  : [
                      {
                        materialId: a.materialId,
                        reason: 'Concurrent return',
                        instruction: 'Change',
                      },
                    ],
            }),
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const versions = await api(
        'a2',
        'GET',
        `material-tasks/${a.id}/submissions`,
      );
      assert.equal(versions.length, 2);
      assert.equal(versions[0].review.id, returned.id);
      assert.equal(versions[0].review.reviewedAt, returned.reviewedAt);
      assert.equal(versions[0].actorId, users.a);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "ReviewRecord" WHERE "submissionId"=$1',
            [v2.id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        sql.query('UPDATE "ReviewRecord" SET decision=\'PASS\' WHERE id=$1', [
          returned.id,
        ]),
        (e) => e.code === '42501',
      );
    },
  );
  await t.test(
    'transaction failure rolls back handover, extension and draft edits; closure never copies original files',
    async () => {
      const value = await task();
      await save('a', value, 1, 'keep edit');
      const before = await execution(value.id);
      const saved = await draft('a', value.id);
      await sql.query('REVOKE INSERT ON "AuditRecord" FROM caau_test_app');
      try {
        await api(
          'manager',
          'POST',
          `material-tasks/${value.id}/handover`,
          { expectedRevision: before.revision, handlerMemberId: members.a2 },
          503,
        );
        await api(
          'manager',
          'POST',
          `material-tasks/${value.id}/extensions`,
          {
            expectedRevision: before.revision,
            newDeadline: '2099-01-01T00:00:00Z',
            reason: 'Must roll back',
          },
          503,
        );
        await save('a', value, saved.revision, 'must roll back', [], 503);
      } finally {
        await sql.query('GRANT INSERT ON "AuditRecord" TO caau_test_app');
      }
      assert.deepEqual(await execution(value.id), before);
      assert.deepEqual(await draft('a', value.id), saved);
      const originalFile = await upload('a', value);
      await save('a', value, saved.revision, 'closed archive', [originalFile]);
      await api('manager', 'POST', `material-tasks/${value.id}/close`, {
        expectedRevision: before.revision,
        reason: 'New organizer requires independent new task',
      });
      await save('a', value, saved.revision + 1, 'closed edit', [], 409);
      await submit('a', value.id, saved.revision + 1, randomUUID(), 409);
      const replacement = await task('b');
      await save('b', replacement, 1, '', [originalFile], 403);
      await api('b', 'GET', `uploads/${originalFile}/content`, undefined, 403);
      assert.equal((await draft('b', replacement.id)).entries.length, 0);
    },
  );
  await t.test(
    'real API restart preserves submissions, edit history, private objects and redacted audit',
    async () => {
      await api('sys', 'PATCH', `authorization/members/${members.a2}`, {
        active: false,
      });
      await api('a2', 'GET', `uploads/${fileA}/content`, undefined, 403);
      await api(
        'a2',
        'GET',
        `material-tasks/${a.id}/submissions`,
        undefined,
        403,
      );
      await api('sys', 'PATCH', `authorization/members/${members.a2}`, {
        active: true,
      });
      const restarted = await createApplication(config);
      try {
        await restarted.listen(0, '127.0.0.1');
        const url = await restarted.getUrl();
        const client = createApiClient(url, createFetchTransport());
        assert.equal(
          (
            await client.request('listSubmissionVersions', {
              token: tokens.a2,
              path: { id: a.id },
            })
          ).length,
          2,
        );
        assert.ok(
          (
            await client.request('downloadPrivateContent', {
              token: tokens.a2,
              path: { id: fileA },
            })
          ).byteLength > 0,
        );
        assert.ok(
          (
            await client.request('getDraftHistory', {
              token: tokens.a2,
              path: { id: a.id },
            })
          ).length >= 3,
        );
      } finally {
        await restarted.close();
      }
      const log = JSON.stringify(
        (await sql.query('SELECT * FROM "AuditRecord"')).rows,
      );
      for (const token of Object.values(tokens))
        assert.ok(!log.includes(token));
      assert.ok(!log.includes('synthetic private material'));
      assert.ok(!log.includes('corrected V2'));
    },
  );
}
