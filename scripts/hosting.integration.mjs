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
      const handlerIdentity = await call('a', 'GET', 'workspace/identity');
      assert.deepEqual(handlerIdentity.hostingApplicantOrganizations, [
        { id: orgA, name: 'Synthetic organizer A' },
      ]);
      const ungrantedIdentity = await call('b', 'GET', 'workspace/identity');
      assert.deepEqual(ungrantedIdentity.hostingApplicantOrganizations, []);
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

  await t.test(
    'agent creates an organizer team after clarification and replays one execution; explicit test batch creates three',
    async () => {
      const source = await call(
        'a',
        'GET',
        `hosting-applications/${approvedId}`,
      );
      const eventId = source.approvedEventId;
      assert.ok(eventId);
      const conversation = await call('a', 'POST', 'agent/sessions', {
        currentEventId: eventId,
      });
      const route = `agent/sessions/${conversation.id}/messages`;
      await call(
        'b',
        'GET',
        `agent/sessions/${conversation.id}`,
        undefined,
        403,
      );

      const collecting = await call('a', 'POST', route, {
        eventId,
        message: '帮我添加一支球队吧',
      });
      assert.equal(collecting.status, 'TEAM');
      assert.equal(collecting.teamAction.state, 'COLLECTING');
      assert.deepEqual(collecting.teamAction.missing, [
        '球队名称',
        '负责人',
        '联系电话',
        '省份',
        '城市',
      ]);

      const preview = await call('a', 'POST', route, {
        eventId,
        message:
          '球队叫内测青云队，负责人张测试，电话13800000000，省份北京市，城市北京市',
      });
      assert.equal(preview.status, 'TEAM');
      assert.equal(preview.teamAction.id, collecting.teamAction.id);
      assert.equal(preview.teamAction.state, 'PREVIEW_READY');
      assert.deepEqual(preview.teamAction.missing, []);
      assert.equal(preview.teamAction.profiles[0].name, '内测青云队');
      const teamId = preview.teamAction.teamIds[0];
      assert.ok(teamId);
      const countTeam = async (ids) =>
        (
          await sql.query(
            'SELECT count(*)::int n FROM "Team" WHERE id=ANY($1::uuid[])',
            [ids],
          )
        ).rows[0].n;
      const countEventTeam = async (ids) =>
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventTeam" WHERE "eventId"=$1 AND "teamId"=ANY($2::uuid[])',
            [eventId, ids],
          )
        ).rows[0].n;
      assert.equal(await countTeam([teamId]), 0);
      assert.equal(await countEventTeam([teamId]), 0);

      const vague = await call('a', 'POST', route, {
        eventId,
        message: '好的',
      });
      assert.equal(vague.status, 'CHAT');
      assert.equal(await countTeam([teamId]), 0);
      const confirmed = await call('a', 'POST', route, {
        eventId,
        message: '确认添加这支球队',
      });
      assert.equal(confirmed.teamAction.id, preview.teamAction.id);
      assert.equal(confirmed.teamAction.state, 'EXECUTED');
      assert.deepEqual(confirmed.teamAction.teamIds, [teamId]);
      assert.equal(await countTeam([teamId]), 1);
      assert.equal(await countEventTeam([teamId]), 1);
      const replay = await call('a', 'POST', route, {
        eventId,
        message: '确认添加这支球队',
      });
      assert.equal(replay.teamAction.id, confirmed.teamAction.id);
      assert.deepEqual(replay.teamAction.teamIds, [teamId]);
      assert.equal(await countTeam([teamId]), 1);
      assert.equal(await countEventTeam([teamId]), 1);
      const restored = await call(
        'a',
        'GET',
        `agent/sessions/${conversation.id}`,
      );
      assert.equal(restored.teamAction.state, 'EXECUTED');
      assert.deepEqual(restored.teamAction.teamIds, [teamId]);

      const testPreview = await call('a', 'POST', route, {
        eventId,
        message: '我在做测试，请随机生成3支球队',
      });
      assert.equal(testPreview.teamAction.mode, 'TEST');
      assert.equal(testPreview.teamAction.state, 'PREVIEW_READY');
      assert.equal(testPreview.teamAction.profiles.length, 3);
      assert.equal(new Set(testPreview.teamAction.teamIds).size, 3);
      assert.ok(
        testPreview.teamAction.profiles.every((profile) =>
          profile.name.startsWith('CAAU内测队-'),
        ),
      );
      const testIds = testPreview.teamAction.teamIds;
      assert.equal(await countTeam(testIds), 0);
      const testConfirmed = await call('a', 'POST', route, {
        eventId,
        message: '确认添加这些球队',
      });
      assert.equal(testConfirmed.teamAction.state, 'EXECUTED');
      assert.deepEqual(testConfirmed.teamAction.teamIds, testIds);
      assert.equal(await countTeam(testIds), 3);
      assert.equal(await countEventTeam(testIds), 3);
      const testReplay = await call('a', 'POST', route, {
        eventId,
        message: '确认添加这些球队',
      });
      assert.deepEqual(testReplay.teamAction.teamIds, testIds);
      assert.equal(await countTeam(testIds), 3);
      assert.equal(await countEventTeam(testIds), 3);
    },
  );

  let materialsId = '';
  await t.test(
    'CAAU-033 seven required fields, bundle return/resubmit, isolation and no duplicate event',
    async () => {
      const source = await call(
        'a',
        'GET',
        `hosting-applications/${approvedId}`,
      );
      const eventId = source.approvedEventId;
      const eventCount = (
        await sql.query('SELECT count(*)::int n FROM "Event"')
      ).rows[0].n;
      await call(
        'a',
        'POST',
        'event-materials',
        { eventId: randomUUID(), key: randomUUID() },
        400,
      );
      await call(
        'b',
        'POST',
        'event-materials',
        { eventId, key: randomUUID() },
        403,
      );
      const created = await call('a', 'POST', 'event-materials', {
        eventId,
        key: randomUUID(),
      });
      materialsId = created.id;
      assert.equal(created.materialEventId, eventId);
      assert.equal(
        (
          await call('a', 'POST', 'event-materials', {
            eventId,
            key: randomUUID(),
          })
        ).id,
        created.id,
      );
      assert.ok(
        !(await call('reviewer', 'GET', 'hosting-applications')).some(
          (row) => row.id === created.id,
        ),
      );
      const list = await call('reviewer', 'GET', 'event-materials');
      assert.ok(list.some((row) => row.id === created.id));
      assert.ok(list.every((row) => !('draft' in row)));
      await call(
        'b',
        'GET',
        `hosting-applications/${created.id}`,
        undefined,
        403,
      );
      let d = await call('a', 'GET', `hosting-applications/${created.id}`);
      const form = {
        ...d.draft,
        eventExperienceIntroduction:
          '本机构位于北京。曾组织青少年赛事。设有专职执行团队。',
        bankAccountName: '合成办赛机构',
        bankName: '测试银行',
        bankAccountNumber: '6222000000000000',
        registrationStart: '2027-04-01T09:00+08:00',
        registrationEnd: '2027-04-20T18:00+08:00',
        contactPhone: '13800000000',
      };
      for (const [key, value] of [
        ['registrationEnd', '2027-03-01T09:00+08:00'],
        ['contactPhone', '123'],
        ['bankAccountNumber', 'invalid'],
      ]) {
        await call(
          'a',
          'PUT',
          `hosting-applications/${created.id}/draft`,
          {
            expectedDraftRevision: d.draftRevision,
            form: { ...form, [key]: value },
          },
          400,
        );
      }
      for (const key of [
        'eventExperienceIntroduction',
        'bankAccountName',
        'bankName',
        'bankAccountNumber',
        'registrationStart',
        'registrationEnd',
        'contactPhone',
        'startDate',
        'endDate',
      ]) {
        d = await call('a', 'PUT', `hosting-applications/${created.id}/draft`, {
          expectedDraftRevision: d.draftRevision,
          form: { ...form, [key]: null },
        });
        const missing = await call(
          'a',
          'POST',
          `hosting-applications/${created.id}/submit`,
          {
            expectedDraftRevision: d.draftRevision,
            expectedRevision: d.revision,
            key: randomUUID(),
          },
          400,
        );
        assert.match(missing.message, /请完成机构简介/);
      }
      d = await call('a', 'PUT', `hosting-applications/${created.id}/draft`, {
        expectedDraftRevision: d.draftRevision,
        form,
      });
      await call(
        'a',
        'PUT',
        `hosting-applications/${created.id}/draft`,
        { expectedDraftRevision: d.draftRevision - 1, form },
        409,
      );
      await call(
        'a',
        'POST',
        `hosting-applications/${created.id}/submit`,
        {
          expectedDraftRevision: d.draftRevision,
          expectedRevision: d.revision,
          key: randomUUID(),
        },
        400,
      );
      let licenseId;
      for (const [requirementCode, extension, bytes] of [
        [
          'BUSINESS_LICENSE',
          'pdf',
          Buffer.from('%PDF-1.7\nmaterials fixture\n%%EOF'),
        ],
        ['VENUE_PHOTO', 'jpg', Buffer.from([255, 216, 1, 2, 255, 217])],
      ]) {
        const upload = await call(
          'a',
          'POST',
          `hosting-applications/${created.id}/uploads`,
          {
            requirementCode,
            extension,
            originalName: `required.${extension}`,
            expectedBytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        );
        await sendFile('a', upload.id, bytes);
        await call('a', 'POST', `hosting-uploads/${upload.id}/confirm`, {
          expectedDraftRevision: d.draftRevision,
        });
        d = await call('a', 'GET', `hosting-applications/${created.id}`);
        if (requirementCode === 'BUSINESS_LICENSE') licenseId = upload.id;
      }
      const forbidden = await fetch(
        `${base}/api/v1/hosting-uploads/${licenseId}/content`,
        { headers: headers('b', false) },
      );
      assert.equal(forbidden.status, 403);
      const submit = {
        expectedDraftRevision: d.draftRevision,
        expectedRevision: d.revision,
        key: randomUUID(),
      };
      const v1 = await call(
        'a',
        'POST',
        `hosting-applications/${created.id}/submit`,
        submit,
      );
      assert.deepEqual(
        await call(
          'a',
          'POST',
          `hosting-applications/${created.id}/submit`,
          submit,
        ),
        v1,
      );
      d = await call('reviewer', 'GET', `hosting-applications/${created.id}`);
      assert.equal(d.draft, null);
      await call(
        'reviewer',
        'POST',
        `hosting-applications/${created.id}/start-review`,
        {
          submissionId: d.currentSubmissionId,
          expectedRevision: d.revision,
          key: randomUUID(),
        },
      );
      d = await call('reviewer', 'GET', `hosting-applications/${created.id}`);
      await call(
        'reviewer',
        'POST',
        `hosting-applications/${created.id}/request-supplement`,
        {
          submissionId: d.currentSubmissionId,
          expectedRevision: d.revision,
          key: randomUUID(),
          reason: '请补充机构简介',
        },
      );
      d = await call('a', 'GET', `hosting-applications/${created.id}`);
      d = await call('a', 'PUT', `hosting-applications/${created.id}/draft`, {
        expectedDraftRevision: d.draftRevision,
        form: {
          ...form,
          eventExperienceIntroduction:
            '补充后的公司简介。位于北京。已完成多场赛事。',
        },
      });
      await call('a', 'POST', `hosting-applications/${created.id}/submit`, {
        expectedDraftRevision: d.draftRevision,
        expectedRevision: d.revision,
        key: randomUUID(),
      });
      d = await call('reviewer2', 'GET', `hosting-applications/${created.id}`);
      await call(
        'reviewer2',
        'POST',
        `hosting-applications/${created.id}/start-review`,
        {
          submissionId: d.currentSubmissionId,
          expectedRevision: d.revision,
          key: randomUUID(),
        },
      );
      d = await call('reviewer2', 'GET', `hosting-applications/${created.id}`);
      await call(
        'reviewer2',
        'POST',
        `hosting-applications/${created.id}/reject`,
        {
          submissionId: d.currentSubmissionId,
          expectedRevision: d.revision,
          key: randomUUID(),
          reason: 'not supported',
        },
        400,
      );
      const approve = {
        submissionId: d.currentSubmissionId,
        expectedRevision: d.revision,
        key: randomUUID(),
      };
      const approved = await call(
        'reviewer2',
        'POST',
        `hosting-applications/${created.id}/approve`,
        approve,
      );
      assert.equal(approved.eventId, eventId);
      assert.deepEqual(
        await call(
          'reviewer2',
          'POST',
          `hosting-applications/${created.id}/approve`,
          approve,
        ),
        approved,
      );
      d = await call('a', 'GET', `hosting-applications/${created.id}`);
      assert.equal(d.submissions.length, 2);
      assert.equal(
        d.submissions[0].form.eventExperienceIntroduction,
        form.eventExperienceIntroduction,
      );
      assert.equal(d.status, 'APPROVED');
      assert.equal(d.approvedEventId, null);
      await call(
        'a',
        'PUT',
        `hosting-applications/${created.id}/draft`,
        { expectedDraftRevision: d.draftRevision, form },
        409,
      );
      assert.equal(
        (await sql.query('SELECT count(*)::int n FROM "Event"')).rows[0].n,
        eventCount,
      );
    },
  );

  await t.test(
    'CAAU-034 simple application and contract-confirmed permit journey',
    async () => {
      const created = await call('a', 'POST', 'hosting-applications', {
        applicantOrganizationId: orgA,
        formVersion: 2,
        key: randomUUID(),
      });
      let d = await call('a', 'GET', `hosting-applications/${created.id}`);
      const form = {
        eventName: '合成简表申请',
        startDate: '2027-07-01',
        endDate: null,
        startTime: null,
        endTime: null,
        contactName: '合成联系人',
        contactPhone: '13800000000',
        additionalNotes: '选填说明',
        location: {
          administrativeArea: {
            province: '北京市',
            city: '北京市',
            district: null,
          },
          detailedAddress: '合成场地地址',
          venueName: '合成场馆',
        },
      };
      d = await call('a', 'PUT', `hosting-applications/${d.id}/draft`, {
        expectedDraftRevision: d.draftRevision,
        form: { ...form, contactPhone: null },
      });
      await call(
        'a',
        'POST',
        `hosting-applications/${d.id}/submit`,
        {
          expectedDraftRevision: d.draftRevision,
          expectedRevision: d.revision,
          key: randomUUID(),
        },
        400,
      );
      d = await call('a', 'PUT', `hosting-applications/${d.id}/draft`, {
        expectedDraftRevision: d.draftRevision,
        form,
      });
      await call('a', 'POST', `hosting-applications/${d.id}/submit`, {
        expectedDraftRevision: d.draftRevision,
        expectedRevision: d.revision,
        key: randomUUID(),
      });
      d = await call('reviewer', 'GET', `hosting-applications/${d.id}`);
      assert.equal(d.submissions[0].attachments.length, 0);
      assert.equal(d.submissions[0].form.contactName, form.contactName);
      await call(
        'reviewer',
        'POST',
        `event-materials/${d.id}/confirm-permit`,
        { submissionId: d.currentSubmissionId, key: randomUUID() },
        409,
      );
      await call(
        'reviewer',
        'POST',
        `hosting-applications/${d.id}/start-review`,
        {
          submissionId: d.currentSubmissionId,
          expectedRevision: d.revision,
          key: randomUUID(),
        },
      );
      d = await call('reviewer', 'GET', `hosting-applications/${d.id}`);
      await call('reviewer', 'POST', `hosting-applications/${d.id}/approve`, {
        submissionId: d.currentSubmissionId,
        expectedRevision: d.revision,
        key: randomUUID(),
      });
      let journeys = await call('a', 'GET', 'hosting-journeys');
      assert.equal(
        journeys.find((j) => j.applicationId === d.id).stage,
        'MATERIALS',
      );
      assert.equal(
        journeys.find((j) => j.applicationId === approvedId).stage,
        'CONTRACT',
      );
      await call('b', 'GET', 'hosting-journeys', undefined, 403);
      const material = await call(
        'reviewer',
        'GET',
        `hosting-applications/${materialsId}`,
      );
      const command = {
        submissionId: material.currentSubmissionId,
        key: randomUUID(),
      };
      await call(
        'a',
        'POST',
        `event-materials/${materialsId}/confirm-permit`,
        command,
        403,
      );
      await call(
        'b',
        'POST',
        `event-materials/${materialsId}/confirm-permit`,
        command,
        403,
      );
      const permitted = await call(
        'reviewer',
        'POST',
        `event-materials/${materialsId}/confirm-permit`,
        command,
      );
      assert.equal(permitted.confirmedBy, users.reviewer);
      assert.deepEqual(
        await call(
          'reviewer',
          'POST',
          `event-materials/${materialsId}/confirm-permit`,
          command,
        ),
        permitted,
      );
      assert.deepEqual(
        await call(
          'reviewer2',
          'POST',
          `event-materials/${materialsId}/confirm-permit`,
          { ...command, key: randomUUID() },
        ),
        permitted,
      );
      journeys = await call('a', 'GET', 'hosting-journeys');
      const complete = journeys.find((j) => j.applicationId === approvedId);
      assert.equal(complete.stage, 'PERMITTED');
      assert.equal(complete.canConfirm, false);
      assert.equal(complete.permit.confirmedBy, users.reviewer);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "HostingPermit" WHERE "applicationId"=$1',
            [materialsId],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        sql.query(
          'UPDATE "HostingPermit" SET "confirmedAt"=now() WHERE "applicationId"=$1',
          [materialsId],
        ),
      );
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
        materialsId,
        licenseName: approvedLicenseName,
        continuationId,
        concurrentId,
      }),
  );
}
