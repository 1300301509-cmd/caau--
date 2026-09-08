import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { materialBrowserTest } from './materials-browser.integration.mjs';

export async function materialsIntegration(
  t,
  { base, config, sql, runtime, tokens, users, members, orgA, orgB, session },
) {
  await session('a', users.a);
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
  const req = () => ({
    deadline: '2030-06-01T08:00:00Z',
    materials: [
      {
        id: randomUUID(),
        title: 'Synthetic safety plan',
        required: true,
        instructions: 'Synthetic instruction',
        templateVersion: 'synthetic-v1',
        formats: ['pdf'],
        maxBytes: 1048576,
        deadline: '2030-06-01T08:00:00Z',
        acceptanceStandard: 'Synthetic criterion',
      },
    ],
  });
  const eventA = (
    await api('manager', 'POST', 'events', {
      name: 'Business event A',
      description: 'Synthetic A',
    })
  ).id;
  const eventB = (
    await api('managerB', 'POST', 'events', {
      name: 'Business event B',
      description: 'Synthetic B',
    })
  ).id;
  const assignmentA = {
    organizationId: orgA,
    handlerMemberId: members.a,
    reviewerMemberId: members.reviewer,
  };
  const assignmentB = {
    organizationId: orgB,
    handlerMemberId: members.b,
    reviewerMemberId: members.reviewer2,
  };
  let taskA = await api('manager', 'POST', 'material-tasks', {
    eventId: eventA,
    title: 'Business task A',
    ...assignmentA,
  });
  let taskB = await api('managerB', 'POST', 'material-tasks', {
    eventId: eventB,
    title: 'Business task B',
    ...assignmentB,
  });
  await t.test(
    'real business resources hide drafts and deny cross-event/organization writes',
    async () => {
      for (const key of ['a', 'b', 'reviewer', 'sys']) {
        await api(key, 'GET', `material-tasks/${taskA.id}`, undefined, 403);
        await api(key, 'GET', `events/${eventA}`, undefined, 403);
        assert.ok(
          !(await api(key, 'GET', 'material-tasks')).some(
            (x) => x.id === taskA.id,
          ),
        );
        await api(
          key,
          'PATCH',
          `material-tasks/${taskA.id}/requirements`,
          { expectedRevision: 1, requirements: req() },
          403,
        );
        await api(
          key,
          'PATCH',
          `material-tasks/${taskA.id}/assignment`,
          { expectedRevision: 1, ...assignmentB },
          403,
        );
        await api(
          key,
          'POST',
          `material-tasks/${taskA.id}/publish`,
          { expectedRevision: 1 },
          403,
        );
      }
      await api(
        'managerB',
        'GET',
        `material-tasks/${taskA.id}`,
        undefined,
        403,
      );
      await api(
        'managerB',
        'POST',
        `material-tasks/${taskA.id}/publish`,
        { expectedRevision: 1 },
        403,
      );
      await api(
        'manager',
        'POST',
        'material-tasks',
        { eventId: eventB, title: 'Forbidden', ...assignmentA },
        403,
      );
      await api(
        'sys',
        'POST',
        'events',
        { name: 'Forbidden', description: 'Forbidden' },
        403,
      );
      await api('a', 'GET', 'workspace/directory', undefined, 403);
      await api(
        'manager',
        'POST',
        'material-tasks',
        {
          eventId: eventA,
          title: 'Mismatched organization',
          ...assignmentA,
          organizationId: orgB,
        },
        403,
      );
      await api(
        'manager',
        'POST',
        'material-tasks',
        {
          eventId: eventA,
          title: 'Wrong reviewer role',
          ...assignmentA,
          reviewerMemberId: members.a,
        },
        403,
      );
      await api(
        'manager',
        'POST',
        `material-tasks/${taskA.id}/publish`,
        { expectedRevision: 1 },
        400,
      );
    },
  );
  await t.test(
    'typed requirements, optimistic revisions and immutable atomic publication',
    async () => {
      const missing = req();
      delete missing.materials[0].templateVersion;
      await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/requirements`,
        { expectedRevision: 1, requirements: missing },
        400,
      );
      const invalid = req();
      invalid.materials[0].maxBytes = -1;
      await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/requirements`,
        { expectedRevision: 1, requirements: invalid },
        400,
      );
      const duplicate = req();
      duplicate.materials.push({ ...duplicate.materials[0] });
      await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/requirements`,
        { expectedRevision: 1, requirements: duplicate },
        400,
      );
      const content = req();
      taskA = await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/requirements`,
        { expectedRevision: 1, requirements: content },
      );
      await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/requirements`,
        { expectedRevision: 1, requirements: req() },
        409,
      );
      taskA = await api(
        'manager',
        'POST',
        `material-tasks/${taskA.id}/publish`,
        { expectedRevision: taskA.revision },
      );
      assert.equal(taskA.state, 'PUBLISHED');
      assert.equal(taskA.requirementVersion, 1);
      const again = await api(
        'manager',
        'POST',
        `material-tasks/${taskA.id}/publish`,
        { expectedRevision: 2 },
      );
      assert.deepEqual(again, taskA);
      await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/requirements`,
        { expectedRevision: taskA.revision, requirements: req() },
        409,
      );
      await api(
        'manager',
        'PATCH',
        `material-tasks/${taskA.id}/assignment`,
        { expectedRevision: taskA.revision, ...assignmentB },
        409,
      );
      await api(
        'manager',
        'PATCH',
        `authorization/task-scopes/${taskA.id}/reviewer`,
        { reviewerGrantId: null },
        409,
      );
      assert.deepEqual(
        (await api('a', 'GET', `material-tasks/${taskA.id}`)).requirements,
        {
          ...content,
          deadline: '2030-06-01T08:00:00.000Z',
          materials: content.materials.map((m) => ({
            ...m,
            deadline: '2030-06-01T08:00:00.000Z',
          })),
        },
      );
      await assert.rejects(
        sql.query('UPDATE "RequirementVersion" SET configuration=\'{}\''),
        (e) => e.code === '42501',
      );
      await assert.rejects(
        runtime.query('DELETE FROM "RequirementVersion"'),
        (e) => e.code === '42501',
      );
      await assert.rejects(
        sql.query(
          'UPDATE "MaterialTask" SET configuration=\'{}\' WHERE id=$1',
          [taskA.id],
        ),
        (e) => e.code === '23514',
      );
      await assert.rejects(
        sql.query('UPDATE "TaskScope" SET "reviewerGrantId"=NULL WHERE id=$1', [
          taskA.id,
        ]),
        (e) => e.code === '23514',
      );
      taskB = await api(
        'managerB',
        'PATCH',
        `material-tasks/${taskB.id}/requirements`,
        { expectedRevision: 1, requirements: req() },
      );
      const responses = await Promise.all(
        [1, 2].map(() =>
          fetch(`${base}/api/v1/material-tasks/${taskB.id}/publish`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.managerB}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ expectedRevision: taskB.revision }),
          }),
        ),
      );
      assert.ok(responses.some((r) => r.status === 200));
      assert.ok(responses.every((r) => [200, 409].includes(r.status)));
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "RequirementVersion" WHERE "taskId"=$1',
            [taskB.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    'published business queries, list isolation and immediate account revocation',
    async () => {
      for (const [key, own, other, event] of [
        ['a', taskA, taskB, eventA],
        ['b', taskB, taskA, eventB],
        ['reviewer', taskA, taskB, eventA],
      ]) {
        await api(key, 'GET', `events/${event}`);
        await api(key, 'GET', `material-tasks/${own.id}`);
        await api(key, 'GET', `material-tasks/${other.id}`, undefined, 403);
        const list = await api(key, 'GET', 'material-tasks');
        assert.ok(list.some((x) => x.id === own.id));
        assert.ok(!list.some((x) => x.id === other.id));
        await api(
          key,
          'PATCH',
          `material-tasks/${other.id}/requirements`,
          { expectedRevision: 3, requirements: req() },
          403,
        );
        await api(
          key,
          'PATCH',
          `material-tasks/${own.id}/requirements`,
          { expectedRevision: 3, requirements: req() },
          403,
        );
      }
      await api('a2', 'GET', `material-tasks/${taskA.id}`, undefined, 403);
      await api('sys', 'GET', `material-tasks/${taskA.id}`, undefined, 403);
      assert.equal((await api('sys', 'GET', 'events')).length, 0);
      await api('sys', 'PATCH', `authorization/members/${members.a}`, {
        active: false,
      });
      await api('a', 'GET', `material-tasks/${taskA.id}`, undefined, 403);
      assert.ok(
        !(await api('a', 'GET', 'material-tasks')).some(
          (x) => x.id === taskA.id,
        ),
      );
      await api('sys', 'PATCH', `authorization/members/${members.a}`, {
        active: true,
      });
    },
  );
  await t.test(
    'pre-publication reassignment retains history and rejects stale publishers',
    async () => {
      let task = await api('manager', 'POST', 'material-tasks', {
        eventId: eventA,
        title: 'Reassigned task',
        ...assignmentA,
        handlerMemberId: members.a2,
      });
      const oldScope = (
        await sql.query('SELECT * FROM "TaskScope" WHERE id=$1', [task.id])
      ).rows[0];
      task = await api(
        'manager',
        'PATCH',
        `material-tasks/${task.id}/assignment`,
        { expectedRevision: 1, ...assignmentB },
      );
      await api(
        'manager',
        'POST',
        `material-tasks/${task.id}/publish`,
        { expectedRevision: 1 },
        409,
      );
      const history = (
        await sql.query(
          'SELECT * FROM "AssignmentHistory" WHERE "taskId"=$1 ORDER BY "createdAt"',
          [task.id],
        )
      ).rows;
      assert.equal(history.length, 2);
      assert.equal(history[1].previousHandlerGrantId, oldScope.handlerGrantId);
      await api(
        'sys',
        'DELETE',
        `authorization/event-grants/${oldScope.handlerGrantId}`,
        undefined,
        409,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventGrant" WHERE id=$1',
            [oldScope.handlerGrantId],
          )
        ).rows[0].n,
        1,
      );
      task = await api(
        'manager',
        'PATCH',
        `material-tasks/${task.id}/requirements`,
        { expectedRevision: task.revision, requirements: req() },
      );
      await api('sys', 'PATCH', `authorization/members/${members.b}`, {
        active: false,
      });
      await api(
        'manager',
        'POST',
        `material-tasks/${task.id}/publish`,
        { expectedRevision: task.revision },
        403,
      );
      await api('sys', 'PATCH', `authorization/members/${members.b}`, {
        active: true,
      });
      task = await api('manager', 'POST', `material-tasks/${task.id}/publish`, {
        expectedRevision: task.revision,
      });
      await api('a', 'GET', `material-tasks/${task.id}`, undefined, 403);
      await api('b', 'GET', `material-tasks/${task.id}`);
    },
  );
  await t.test(
    'audit outage rolls back event anchors, assignments and publication snapshot',
    async () => {
      let task = await api('manager', 'POST', 'material-tasks', {
        eventId: eventA,
        title: 'Rollback task',
        ...assignmentA,
      });
      task = await api(
        'manager',
        'PATCH',
        `material-tasks/${task.id}/requirements`,
        { expectedRevision: 1, requirements: req() },
      );
      const before = (
        await sql.query(
          'SELECT (SELECT count(*)::int FROM "EventScope") scopes, (SELECT count(*)::int FROM "AssignmentHistory") assignments',
        )
      ).rows[0];
      await sql.query('REVOKE INSERT ON "AuditRecord" FROM caau_test_app');
      try {
        await api(
          'manager',
          'POST',
          'events',
          { name: 'Rollback event', description: 'Synthetic' },
          503,
        );
        await api(
          'manager',
          'PATCH',
          `material-tasks/${task.id}/assignment`,
          { expectedRevision: task.revision, ...assignmentB },
          503,
        );
        await api(
          'manager',
          'POST',
          `material-tasks/${task.id}/publish`,
          { expectedRevision: task.revision },
          503,
        );
      } finally {
        await sql.query('GRANT INSERT ON "AuditRecord" TO caau_test_app');
      }
      assert.deepEqual(
        (
          await sql.query(
            'SELECT (SELECT count(*)::int FROM "EventScope") scopes, (SELECT count(*)::int FROM "AssignmentHistory") assignments',
          )
        ).rows[0],
        before,
      );
      const after = await api('manager', 'GET', `material-tasks/${task.id}`);
      assert.equal(after.state, 'DRAFT');
      assert.equal(after.revision, task.revision);
      assert.equal(after.handlerMemberId, members.a);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "RequirementVersion" WHERE "taskId"=$1',
            [task.id],
          )
        ).rows[0].n,
        0,
      );
      const audit = (
        await sql.query(
          'SELECT action, outcome FROM "AuditRecord" WHERE action LIKE \'materials.%\'',
        )
      ).rows;
      assert.ok(
        audit.some(
          (x) => x.action === 'materials.publish' && x.outcome === 'ALLOWED',
        ),
      );
      assert.ok(
        audit.some(
          (x) => x.action === 'materials.configure' && x.outcome === 'DENIED',
        ),
      );
    },
  );
  await t.test(
    'headquarters Web creates, assigns, configures and publishes over real API/PostgreSQL',
    { timeout: 90000 },
    () => materialBrowserTest({ config, tokens, sql }),
  );
}
