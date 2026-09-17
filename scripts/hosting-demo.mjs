import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createApiClient } from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';

const base = process.env.CAAU_API_BASE_URL || 'http://127.0.0.1:3000';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base))
  throw new Error('hosting:demo only supports a loopback API');
const client = createApiClient(base, createFetchTransport());
const indexFile = '.local/db/hosting-demo.json';
const identityKeys = ['reviewer-a', 'reviewer-b', 'organizer-a', 'organizer-b'];

async function existingIndex() {
  try {
    return JSON.parse(await readFile(indexFile, 'utf8'));
  } catch {
    return null;
  }
}
async function findSuperToken() {
  for (const name of (await readdir('.local/db'))
    .filter((value) => /^session-.*\.json$/.test(value))
    .reverse()) {
    try {
      const session = JSON.parse(await readFile(`.local/db/${name}`, 'utf8'));
      if (!session.token || new Date(session.expiresAt) <= new Date()) continue;
      const identity = await client.request('getWorkspaceIdentity', {
        token: session.token,
      });
      if (identity.roles.includes('HEADQUARTERS_SUPER_ADMIN'))
        return session.token;
    } catch {
      // Expired, malformed, or unauthorized local session; try the next file.
    }
  }
  throw new Error('No active local headquarters super administrator session');
}
async function localSessions() {
  return Object.fromEntries(
    await Promise.all(
      identityKeys.map(async (key) => {
        const session = await client.request('createLocalTestSession', {
          body: { identity: key },
        });
        return [key, session.token];
      }),
    ),
  );
}
async function main() {
  const indexed = await existingIndex();
  if (indexed?.applications?.length) {
    const superToken = await findSuperToken();
    await Promise.all(
      indexed.applications.map((item) =>
        client.request('HostingController_detail', {
          token: superToken,
          path: { id: item.id },
        }),
      ),
    );
    console.log(
      `CAAU-027 C synthetic demo already ready: ${base}/hosting-applications`,
    );
    return;
  }
  const superToken = await findSuperToken();
  const tokens = await localSessions();
  const directory = await client.request('getWorkspaceDirectory', {
    token: superToken,
  });
  const member = (name) => {
    const user = directory.users.find((item) => item.displayName === name);
    const result = directory.members.find((item) => item.userId === user?.id);
    if (!result) throw new Error(`Missing fixed local member: ${name}`);
    return result;
  };
  const reviewerA = member('总部审核员甲');
  const reviewerB = member('总部审核员乙');
  const organizerA = member('承办方 A 经办人');
  const organizerB = member('承办方 B 经办人');
  for (const reviewer of [reviewerA, reviewerB])
    await client.request('HostingController_reviewGrant', {
      token: superToken,
      body: { memberId: reviewer.id },
    });
  for (const organizer of [organizerA, organizerB])
    await client.request('HostingController_handlerGrant', {
      token: superToken,
      body: { memberId: organizer.id },
    });

  const pdf = new TextEncoder().encode(
    '%PDF-1.7\nCAAU-027 C synthetic license\n%%EOF',
  ).buffer;
  const jpg = Uint8Array.from([0xff, 0xd8, 1, 2, 3, 4, 0xff, 0xd9]).buffer;
  async function attach(
    token,
    applicationId,
    requirementCode,
    name,
    extension,
    bytes,
    revision,
  ) {
    const upload = await client.request('HostingController_uploadIntent', {
      token,
      path: { id: applicationId },
      body: {
        requirementCode,
        originalName: name,
        extension,
        expectedBytes: bytes.byteLength,
        sha256: createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      },
    });
    await client.request('HostingController_uploadContent', {
      token,
      path: { id: upload.id },
      body: bytes,
    });
    await client.request('HostingController_confirmUpload', {
      token,
      path: { id: upload.id },
      body: { expectedDraftRevision: revision },
    });
    return revision + 1;
  }
  async function createSubmitted(sequence, organization, token) {
    const application = await client.request('HostingController_create', {
      token,
      body: {
        applicantOrganizationId: organization.organizationId,
        key: randomUUID(),
      },
    });
    let detail = await client.request('HostingController_save', {
      token,
      path: { id: application.id },
      body: {
        expectedDraftRevision: 1,
        form: {
          eventName: `【合成演示】CAAU-027 C ${sequence}`,
          startDate: '2027-05-01',
          endDate: '2027-05-03',
          location: {
            administrativeArea: {
              province: '北京市',
              city: '北京市',
              district: '朝阳区',
            },
            detailedAddress: `合成测试路 ${sequence} 号`,
            venueName: `合成测试场馆 ${sequence}`,
          },
          eventExperienceIntroduction:
            '仅供本地 C 阶段页面验收的合成办赛经验，不代表真实机构或赛事。',
        },
      },
    });
    let draftRevision = detail.draftRevision;
    draftRevision = await attach(
      token,
      application.id,
      'BUSINESS_LICENSE',
      `合成营业执照-${sequence}.pdf`,
      'pdf',
      pdf,
      draftRevision,
    );
    draftRevision = await attach(
      token,
      application.id,
      'VENUE_PHOTO',
      `合成场地现状-${sequence}.jpg`,
      'jpg',
      jpg,
      draftRevision,
    );
    const submitted = await client.request('HostingController_submit', {
      token,
      path: { id: application.id },
      body: {
        expectedDraftRevision: draftRevision,
        expectedRevision: detail.revision + 2,
        key: randomUUID(),
      },
    });
    return { id: application.id, submitted };
  }
  async function start(item, reviewerToken) {
    const detail = await client.request('HostingController_detail', {
      token: reviewerToken,
      path: { id: item.id },
    });
    await client.request('HostingController_startReview', {
      token: reviewerToken,
      path: { id: item.id },
      body: {
        submissionId: detail.currentSubmissionId,
        expectedRevision: detail.revision,
        key: randomUUID(),
      },
    });
  }
  const pending = await createSubmitted(
    '待审核',
    organizerA,
    tokens['organizer-a'],
  );
  const inReview = await createSubmitted(
    '审核中',
    organizerA,
    tokens['organizer-a'],
  );
  await start(inReview, tokens['reviewer-a']);
  const needs = await createSubmitted(
    '待补充',
    organizerA,
    tokens['organizer-a'],
  );
  await start(needs, tokens['reviewer-a']);
  let detail = await client.request('HostingController_detail', {
    token: tokens['reviewer-b'],
    path: { id: needs.id },
  });
  await client.request('HostingController_supplement', {
    token: tokens['reviewer-b'],
    path: { id: needs.id },
    body: {
      submissionId: detail.currentSubmissionId,
      expectedRevision: detail.revision,
      key: randomUUID(),
      reason: '【合成演示】请补充更新后的赛事名称与场馆说明。',
    },
  });
  const rejected = await createSubmitted(
    '已驳回',
    organizerB,
    tokens['organizer-b'],
  );
  await start(rejected, tokens['reviewer-a']);
  detail = await client.request('HostingController_detail', {
    token: tokens['reviewer-b'],
    path: { id: rejected.id },
  });
  await client.request('HostingController_reject', {
    token: tokens['reviewer-b'],
    path: { id: rejected.id },
    body: {
      submissionId: detail.currentSubmissionId,
      expectedRevision: detail.revision,
      key: randomUUID(),
      reason: '【合成演示】申请信息不足，本申请终止。',
    },
  });
  const approved = await createSubmitted(
    '补充后 V2 获批',
    organizerA,
    tokens['organizer-a'],
  );
  await start(approved, tokens['reviewer-a']);
  detail = await client.request('HostingController_detail', {
    token: tokens['reviewer-b'],
    path: { id: approved.id },
  });
  await client.request('HostingController_supplement', {
    token: tokens['reviewer-b'],
    path: { id: approved.id },
    body: {
      submissionId: detail.currentSubmissionId,
      expectedRevision: detail.revision,
      key: randomUUID(),
      reason: '【合成演示】请将赛事名称更新为 V2。',
    },
  });
  detail = await client.request('HostingController_detail', {
    token: tokens['organizer-a'],
    path: { id: approved.id },
  });
  detail = await client.request('HostingController_save', {
    token: tokens['organizer-a'],
    path: { id: approved.id },
    body: {
      expectedDraftRevision: detail.draftRevision,
      form: {
        ...detail.draft,
        eventName: '【合成演示】CAAU-027 C 补充后 V2 获批（V2）',
      },
    },
  });
  await client.request('HostingController_submit', {
    token: tokens['organizer-a'],
    path: { id: approved.id },
    body: {
      expectedDraftRevision: detail.draftRevision,
      expectedRevision: detail.revision,
      key: randomUUID(),
    },
  });
  await start(approved, tokens['reviewer-a']);
  detail = await client.request('HostingController_detail', {
    token: tokens['reviewer-b'],
    path: { id: approved.id },
  });
  await client.request('HostingController_approve', {
    token: tokens['reviewer-b'],
    path: { id: approved.id },
    body: {
      submissionId: detail.currentSubmissionId,
      expectedRevision: detail.revision,
      key: randomUUID(),
    },
  });

  const applications = [pending, inReview, needs, rejected, approved].map(
    ({ id }, index) => ({
      id,
      label: ['待审核', '审核中', '待补充', '已驳回', '补充后 V2 获批'][index],
    }),
  );
  await writeFile(
    indexFile,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), applications },
      null,
      2,
    ) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  console.log(`CAAU-027 C synthetic demo ready: ${base}/hosting-applications`);
  console.log(
    'Use fixed local identities 总部审核员甲 / 总部审核员乙. No real business data was created.',
  );
}
main().catch((error) => {
  console.error(
    `hosting:demo failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
