import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { hostingBrowserTest } from './hosting-browser.integration.mjs';

export async function hostingIntegration(t, context) {
  const {
    base,
    config,
    tokens,
    users,
    members,
    orgA,
    orgB,
    hq,
    sql,
    api,
    session,
  } = context;
  const headers = (key, json = true) => ({
    Authorization: `Bearer ${tokens[key]}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });
  async function call(key, method, route, body, status = 200) {
    const response = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: headers(key),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, status, `${key} ${method} ${route}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.status === 204 ? null : response.json();
  }
  async function sendFile(key, uploadId, bytes, status = 200) {
    const response = await fetch(
      `${base}/api/v1/hosting-uploads/${uploadId}/content`,
      {
        method: 'PUT',
        headers: {
          ...headers(key, false),
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(bytes.length),
        },
        body: bytes,
      },
    );
    assert.equal(response.status, status, `upload ${uploadId}`);
    return response.json();
  }
  for (const key of ['super', 'a', 'a2', 'b', 'reviewer', 'reviewer2'])
    await session(key, users[key]);
  let approvedId = '';
  let approvedLicenseName = '';
  await t.test(
    'hosting application grants, isolation, immutable submission and atomic approval',
    async () => {
      await call(
        'sys',
        'POST',
        'admin/hosting-application-handler-grants',
        { memberId: members.a },
        403,
      );
      const handler = await call(
        'super',
        'POST',
        'admin/hosting-application-handler-grants',
        { memberId: members.a },
      );
      const handler2 = await call(
        'super',
        'POST',
        'admin/hosting-application-handler-grants',
        { memberId: members.a2 },
      );
      await call('super', 'POST', 'admin/hosting-application-review-grants', {
        memberId: members.reviewer,
      });
      await call('super', 'POST', 'admin/hosting-application-review-grants', {
        memberId: members.reviewer2,
      });
      const application = await call('a', 'POST', 'hosting-applications', {
        applicantOrganizationId: orgA,
        key: randomUUID(),
      });
      await call(
        'b',
        'GET',
        `hosting-applications/${application.id}`,
        undefined,
        403,
      );
      const draft = await call(
        'a',
        'PUT',
        `hosting-applications/${application.id}/draft`,
        {
          expectedDraftRevision: 1,
          form: {
            eventName: 'Synthetic hosting event',
            startDate: '2026-10-01',
            endDate: '2026-10-01',
            location: {
              administrativeArea: {
                province: '北京市',
                city: '北京市',
                district: null,
              },
              detailedAddress: '朝阳区测试路 1 号',
              venueName: '测试场馆',
            },
            eventExperienceIntroduction: '具有多次合规赛事承办经验。',
          },
        },
      );
      assert.equal(draft.draftRevision, 2);
      const pdf = Buffer.from('%PDF-1.7\nsynthetic\n%%EOF');
      const jpg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
      async function attach(code, extension, bytes, expectedDraftRevision) {
        const upload = await call(
          'a',
          'POST',
          `hosting-applications/${application.id}/uploads`,
          {
            requirementCode: code,
            originalName: `synthetic.${extension}`,
            extension,
            expectedBytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        );
        await sendFile('a', upload.id, bytes);
        await call('a', 'POST', `hosting-uploads/${upload.id}/confirm`, {
          expectedDraftRevision,
        });
        return upload.id;
      }
      const licenseId = await attach('BUSINESS_LICENSE', 'pdf', pdf, 2);
      await attach('VENUE_PHOTO', 'jpg', jpg, 3);
      const submitted = await call(
        'a',
        'POST',
        `hosting-applications/${application.id}/submit`,
        {
          expectedDraftRevision: 4,
          expectedRevision: 4,
          key: randomUUID(),
        },
      );
      const reviewerMember = (
        await sql.query(
          'SELECT id FROM "OrganizationMember" WHERE "userId"=$1 AND "organizationId"=$2',
          [users.a, hq],
        )
      ).rows[0].id;
      await api('sys', 'PATCH', `members/${reviewerMember}`, { active: true });
      await call('super', 'POST', 'admin/hosting-application-review-grants', {
        memberId: reviewerMember,
      });
      await call(
        'a',
        'POST',
        `hosting-applications/${application.id}/start-review`,
        {
          submissionId: submitted.submissionId,
          expectedRevision: 5,
          key: randomUUID(),
        },
        403,
      );
      await api('sys', 'PATCH', `members/${reviewerMember}`, { active: false });
      await call(
        'reviewer',
        'POST',
        `hosting-applications/${application.id}/start-review`,
        {
          submissionId: submitted.submissionId,
          expectedRevision: 5,
          key: randomUUID(),
        },
      );
      await call(
        'reviewer2',
        'POST',
        `hosting-applications/${application.id}/request-supplement`,
        {
          submissionId: submitted.submissionId,
          expectedRevision: 6,
          key: randomUUID(),
          reason: '请更新赛事名称后重新提交。',
        },
      );
      await call('a2', 'PUT', `hosting-applications/${application.id}/draft`, {
        expectedDraftRevision: 4,
        form: { ...draft.draft, eventName: 'Synthetic hosting event V2' },
      });
      const resubmitted = await call(
        'a',
        'POST',
        `hosting-applications/${application.id}/submit`,
        {
          expectedDraftRevision: 5,
          expectedRevision: 8,
          key: randomUUID(),
        },
      );
      assert.equal(resubmitted.version, 2);
      const versions = await call(
        'reviewer',
        'GET',
        `hosting-applications/${application.id}`,
      );
      assert.equal(versions.submissions.length, 2);
      assert.equal(versions.diffs.length, 1);
      assert.equal(
        versions.diffs[0].fieldChanges.find(
          (item) => item.field === 'eventName',
        ).status,
        'CHANGED',
      );
      await call(
        'reviewer',
        'POST',
        `hosting-applications/${application.id}/start-review`,
        {
          submissionId: resubmitted.submissionId,
          expectedRevision: 9,
          key: randomUUID(),
        },
      );
      await call(
        'super',
        'PATCH',
        `admin/hosting-application-handler-grants/${handler.id}`,
        { active: false },
      );
      await call(
        'super',
        'PATCH',
        `admin/hosting-application-handler-grants/${handler2.id}`,
        { active: false },
      );
      await call(
        'reviewer',
        'POST',
        `hosting-applications/${application.id}/approve`,
        {
          submissionId: resubmitted.submissionId,
          expectedRevision: 10,
          key: randomUUID(),
        },
        409,
      );
      await call(
        'super',
        'PATCH',
        `admin/hosting-application-handler-grants/${handler.id}`,
        { active: true },
      );
      await call(
        'super',
        'PATCH',
        `admin/hosting-application-handler-grants/${handler2.id}`,
        { active: true },
      );
      const commands = ['reviewer', 'reviewer2'].map((key) =>
        fetch(`${base}/api/v1/hosting-applications/${application.id}/approve`, {
          method: 'POST',
          headers: headers(key),
          body: JSON.stringify({
            submissionId: resubmitted.submissionId,
            expectedRevision: 10,
            key: randomUUID(),
          }),
        }),
      );
      const decisions = await Promise.all(commands);
      assert.deepEqual(
        decisions.map((response) => response.status).sort(),
        [200, 409],
      );
      const approved = await decisions
        .find((response) => response.status === 200)
        .json();
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventOrigin" WHERE "applicationId"=$1',
            [application.id],
          )
        ).rows[0].n,
        1,
      );
      const event = (
        await sql.query('SELECT "lifecycleState" FROM "Event" WHERE id=$1', [
          approved.eventId,
        ])
      ).rows[0];
      assert.equal(event.lifecycleState, 'PREPARING_INTERNAL');
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "MaterialTask" WHERE "eventId"=$1',
            [approved.eventId],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventInformationAccessGrant" WHERE "eventId"=$1 AND active',
            [approved.eventId],
          )
        ).rows[0].n,
        2,
      );
      await call('a', 'GET', `events/${approved.eventId}`);
      await api('sys', 'PATCH', `members/${members.a}`, { active: false });
      await call('a', 'GET', `events/${approved.eventId}`, undefined, 403);
      await api('sys', 'PATCH', `members/${members.a}`, { active: true });
      await call('a', 'GET', `events/${approved.eventId}`);
      await call('a2', 'GET', `events/${approved.eventId}`);
      await call(
        'super',
        'PATCH',
        `admin/hosting-application-handler-grants/${handler2.id}`,
        { active: false },
      );
      await call('a2', 'GET', `events/${approved.eventId}`, undefined, 403);
      await call('super', 'GET', `events/${approved.eventId}`);
      await call('super', 'GET', `hosting-applications/${application.id}`);
      await assert.rejects(
        sql.query(
          'UPDATE "HostingApplicationSubmission" SET version=9 WHERE id=$1',
          [submitted.submissionId],
        ),
        (error) => /immutable/i.test(error.message),
      );
      await assert.rejects(
        context.runtime.query(
          'DELETE FROM "HostingApplicationAction" WHERE "applicationId"=$1',
          [application.id],
        ),
        (error) => error.code === '42501',
      );
      const downloaded = await fetch(
        `${base}/api/v1/hosting-uploads/${licenseId}/content`,
        {
          headers: headers('reviewer', false),
        },
      );
      assert.equal(downloaded.status, 200);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
      assert.equal(orgB !== orgA, true);
      approvedId = application.id;
      approvedLicenseName = 'synthetic.pdf';
    },
  );

  async function browserCandidate(label) {
    const application = await call('a', 'POST', 'hosting-applications', {
      applicantOrganizationId: orgA,
      key: randomUUID(),
    });
    const draft = await call(
      'a',
      'PUT',
      `hosting-applications/${application.id}/draft`,
      {
        expectedDraftRevision: 1,
        form: {
          eventName: `Browser hosting ${label}`,
          startDate: '2027-06-01',
          endDate: '2027-06-02',
          location: {
            administrativeArea: {
              province: '北京市',
              city: '北京市',
              district: '朝阳区',
            },
            detailedAddress: '浏览器验收测试路 1 号',
            venueName: '浏览器验收场馆',
          },
          eventExperienceIntroduction: '真实浏览器审核流程合成申请。',
        },
      },
    );
    const pdf = Buffer.from(`%PDF-1.7\n${label}\n%%EOF`);
    const jpg = Buffer.from([0xff, 0xd8, 5, 6, 7, 0xff, 0xd9]);
    let revision = draft.draftRevision;
    for (const [requirementCode, extension, bytes] of [
      ['BUSINESS_LICENSE', 'pdf', pdf],
      ['VENUE_PHOTO', 'jpg', jpg],
    ]) {
      const upload = await call(
        'a',
        'POST',
        `hosting-applications/${application.id}/uploads`,
        {
          requirementCode,
          originalName: `browser-${label}.${extension}`,
          extension,
          expectedBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      );
      await sendFile('a', upload.id, bytes);
      await call('a', 'POST', `hosting-uploads/${upload.id}/confirm`, {
        expectedDraftRevision: revision,
      });
      revision += 1;
    }
    await call('a', 'POST', `hosting-applications/${application.id}/submit`, {
      expectedDraftRevision: revision,
      expectedRevision: draft.revision + 2,
      key: randomUUID(),
    });
    return application.id;
  }
  const continuationId = await browserCandidate('continuation');
  const concurrentId = await browserCandidate('concurrent');
  const concurrent = await call(
    'reviewer',
    'GET',
    `hosting-applications/${concurrentId}`,
  );
  await call(
    'reviewer',
    'POST',
    `hosting-applications/${concurrentId}/start-review`,
    {
      submissionId: concurrent.currentSubmissionId,
      expectedRevision: concurrent.revision,
      key: randomUUID(),
    },
  );
  await t.test(
    'CAAU-027 C real browser: V2 approval, continuation, rejection, conflict, download and denied access',
    { timeout: 90000 },
    () =>
      hostingBrowserTest({
        config,
        tokens,
        approvedId,
        licenseName: approvedLicenseName,
        continuationId,
        concurrentId,
      }),
  );
}
