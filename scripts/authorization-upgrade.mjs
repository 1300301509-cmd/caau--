import { cp, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { runPrisma } from './migration-fixture.mjs';
import { root } from './database.mjs';

// Caller has already validated the isolated test service and created this precise database.
export async function deployAuthorizationBaseline(connectionString) {
  const directory = await mkdtemp(path.join(tmpdir(), 'caau-upgrade-'));
  const migrations = path.join(directory, 'migrations');
  const config = path.join(directory, 'prisma.config.ts');
  const client = new pg.Client({ connectionString });
  try {
    await mkdir(migrations);
    for (const name of [
      'migration_lock.toml',
      '202609080001_authorization',
      '202609080002_material_tasks',
    ])
      await cp(
        path.join(root, 'database/prisma/migrations', name),
        path.join(migrations, name),
        { recursive: true },
      );
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(path.join(root, 'database/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.CAAU_FIXTURE_MIGRATION_URL } };\n`,
    );
    await runPrisma({ directory, config }, ['migrate', 'deploy'], {
      CAAU_FIXTURE_MIGRATION_URL: connectionString,
    });
    await client.connect();
    const userId = randomUUID();
    const auditId = randomUUID();
    await client.query(
      'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2)',
      [userId, 'Synthetic preserved 004 user'],
    );
    await client.query(
      'INSERT INTO "AuditRecord" (id,"actorId",action,outcome,"requestId") VALUES ($1,$2,$3,$4,$5)',
      [auditId, userId, 'upgrade.baseline', 'ALLOWED', randomUUID()],
    );
    const checksum = (
      await client.query(
        'SELECT checksum FROM _prisma_migrations WHERE migration_name=$1',
        ['202609080001_authorization'],
      )
    ).rows[0].checksum;
    const taskId = randomUUID(),
      eventId = randomUUID(),
      orgId = randomUUID(),
      reviewerOrg = randomUUID(),
      reviewerUser = randomUUID();
    const handler = randomUUID(),
      reviewer = randomUUID(),
      handlerGrant = randomUUID(),
      reviewerGrant = randomUUID();
    const configuration = {
      deadline: '2099-01-01T00:00:00.000Z',
      materials: [
        {
          id: randomUUID(),
          title: 'Preserved requirement',
          required: true,
          instructions: 'Synthetic',
          templateVersion: 'v1',
          formats: ['txt'],
          maxBytes: 1024,
          deadline: '2099-01-01T00:00:00.000Z',
          acceptanceStandard: 'Synthetic',
        },
      ],
    };
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,\'Synthetic preserved reviewer\')',
      [reviewerUser],
    );
    await client.query(
      "INSERT INTO \"Organization\" (id,name) VALUES ($1,'Synthetic baseline organizer'),($2,'Synthetic baseline headquarters')",
      [orgId, reviewerOrg],
    );
    await client.query(
      'INSERT INTO "OrganizationMember" (id,"userId","organizationId",role) VALUES ($1,$2,$3,\'ORGANIZER\'),($4,$5,$6,\'REVIEWER\')',
      [handler, userId, orgId, reviewer, reviewerUser, reviewerOrg],
    );
    await client.query('INSERT INTO "EventScope" (id) VALUES ($1)', [eventId]);
    await client.query(
      'INSERT INTO "EventGrant" (id,"eventId","memberId") VALUES ($1,$2,$3),($4,$2,$5)',
      [handlerGrant, eventId, handler, reviewerGrant, reviewer],
    );
    await client.query(
      'INSERT INTO "TaskScope" (id,"eventId","handlerGrantId","reviewerGrantId") VALUES ($1,$2,$3,$4)',
      [taskId, eventId, handlerGrant, reviewerGrant],
    );
    await client.query(
      'INSERT INTO "Event" (id,name,description,"createdBy") VALUES ($1,\'Synthetic preserved event\',\'Baseline\',$2)',
      [eventId, userId],
    );
    await client.query(
      'INSERT INTO "MaterialTask" (id,"eventId",title,configuration,state,"publishedAt") VALUES ($1,$2,\'Preserved published task\',$3,\'PUBLISHED\',now())',
      [taskId, eventId, configuration],
    );
    await client.query(
      'INSERT INTO "RequirementVersion" (id,"taskId",version,configuration,"createdBy") VALUES ($1,$2,1,$3,$4)',
      [randomUUID(), taskId, configuration, userId],
    );
    await client.query(
      'INSERT INTO "AssignmentHistory" (id,"taskId","handlerGrantId","reviewerGrantId","actorId") VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), taskId, handlerGrant, reviewerGrant, userId],
    );
    await client.query('COMMIT');
    const snapshots = (
      await client.query(
        'SELECT row_to_json(r) snapshot FROM "RequirementVersion" r WHERE "taskId"=$1',
        [taskId],
      )
    ).rows;
    await cp(
      path.join(
        root,
        'database/prisma/migrations/202609080003_material_execution',
      ),
      path.join(migrations, '202609080003_material_execution'),
      { recursive: true },
    );
    await runPrisma({ directory, config }, ['migrate', 'deploy'], {
      CAAU_FIXTURE_MIGRATION_URL: connectionString,
    });
    const legacyFileId = randomUUID();
    await client.query(
      'INSERT INTO "FileUpload" (id,"taskId","materialId","organizationId","actorId",generation,"storageKey",extension,"expectedBytes",sha256,"expiresAt") VALUES ($1,$2,$3,$4,$5,1,$6,\'txt\',10,$7,\'2099-01-01\')',
      [
        legacyFileId,
        taskId,
        configuration.materials[0].id,
        orgId,
        userId,
        randomUUID(),
        '0'.repeat(64),
      ],
    );
    const legacyFile = (
      await client.query(
        'SELECT to_jsonb(f) data FROM "FileUpload" f WHERE id=$1',
        [legacyFileId],
      )
    ).rows[0].data;
    // Upgrade fixture with real private bytes and semantically distinct old V1 RETURN / V2 PASS.
    // Created only inside this test's temporary database/root, before migration 006.
    for (const name of [
      '202609090001_file_labels',
      '202609100001_template_files',
    ])
      await cp(
        path.join(root, 'database/prisma/migrations', name),
        path.join(migrations, name),
        { recursive: true },
      );
    await runPrisma({ directory, config }, ['migrate', 'deploy'], {
      CAAU_FIXTURE_MIGRATION_URL: connectionString,
    });
    const oldTask = randomUUID(),
      reqId = randomUUID(),
      oldFile = randomUUID(),
      templateId = randomUUID();
    const objects = [randomUUID(), randomUUID()];
    const bytes = Buffer.from('CAAU-012 preserved synthetic private content');
    const fileHash = createHash('sha256').update(bytes).digest('hex');
    const fileRoot = path.join(
      root,
      '.local/files',
      new URL(connectionString).pathname.slice(1),
    );
    await mkdir(fileRoot, { recursive: true });
    for (const object of objects)
      await writeFile(path.join(fileRoot, object), bytes, { mode: 0o600 });
    const deadlines = {
      task: configuration.deadline,
      materials: [
        { id: configuration.materials[0].id, deadline: configuration.deadline },
      ],
    };
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO "TaskScope" (id,"eventId","handlerGrantId","reviewerGrantId") VALUES ($1,$2,$3,$4)',
      [oldTask, eventId, handlerGrant, reviewerGrant],
    );
    await client.query(
      'INSERT INTO "MaterialTask" (id,"eventId",title,configuration,state,"publishedAt") VALUES ($1,$2,\'Old V1/V2 with template\',$3,\'PUBLISHED\',now())',
      [oldTask, eventId, configuration],
    );
    await client.query(
      'INSERT INTO "RequirementVersion" (id,"taskId",version,configuration,"createdBy") VALUES ($1,$2,1,$3,$4)',
      [reqId, oldTask, configuration, userId],
    );
    await client.query(
      'INSERT INTO "TaskExecution" ("taskId",deadlines) VALUES ($1,$2)',
      [oldTask, deadlines],
    );
    await client.query('INSERT INTO "MaterialDraft" ("taskId") VALUES ($1)', [
      oldTask,
    ]);
    await client.query(
      'INSERT INTO "FileUpload" (id,"taskId","materialId","organizationId","actorId",generation,"storageKey","originalName",extension,"expectedBytes",sha256,state,"expiresAt","confirmedAt","boundAt") VALUES ($1,$2,$3,$4,$5,1,$6,\'preserved.txt\',\'txt\',$7,$8,\'CONFIRMED\',\'2099-01-01\',now(),now())',
      [
        oldFile,
        oldTask,
        configuration.materials[0].id,
        orgId,
        userId,
        objects[0],
        bytes.length,
        fileHash,
      ],
    );
    await client.query(
      'INSERT INTO "TemplateUpload" (id,"taskId","materialId","actorId","storageKey","originalName",extension,"expectedBytes",sha256,state,"expiresAt","confirmedAt") VALUES ($1,$2,$3,$4,$5,\'preserved-template.txt\',\'txt\',$6,$7,\'CONFIRMED\',\'2099-01-01\',now())',
      [
        templateId,
        oldTask,
        configuration.materials[0].id,
        userId,
        objects[1],
        bytes.length,
        fileHash,
      ],
    );
    await client.query(
      'INSERT INTO "TemplateAttachment" ("requirementVersionId","materialId","templateId") VALUES ($1,$2,$3)',
      [reqId, configuration.materials[0].id, templateId],
    );
    for (const version of [1, 2]) {
      const submissionId = randomUUID();
      const values = [
        {
          materialId: configuration.materials[0].id,
          text: `Old V${version}`,
          fileIds: [oldFile],
        },
      ];
      await client.query(
        'INSERT INTO "SubmissionVersion" (id,"taskId","requirementVersionId",version,generation,"actorId",entries,deadlines) VALUES ($1,$2,$3,$4,1,$5,$6,$7)',
        [
          submissionId,
          oldTask,
          reqId,
          version,
          userId,
          JSON.stringify(values),
          deadlines,
        ],
      );
      await client.query(
        'INSERT INTO "SubmissionAttachment" ("submissionId","fileId","taskId") VALUES ($1,$2,$3)',
        [submissionId, oldFile, oldTask],
      );
      await client.query(
        'UPDATE "TaskExecution" SET state=\'SUBMITTED\',revision=revision+1,"currentSubmissionId"=$2,"nextVersion"=$3 WHERE "taskId"=$1',
        [oldTask, submissionId, version + 1],
      );
      await client.query(
        'INSERT INTO "ReviewRecord" (id,"submissionId","actorId",decision,issues) VALUES ($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          submissionId,
          reviewerUser,
          version === 1 ? 'RETURN' : 'PASS',
          JSON.stringify(
            version === 1
              ? [
                  {
                    materialId: configuration.materials[0].id,
                    reason: 'Old return',
                    instruction: 'Old correction',
                  },
                ]
              : [],
          ),
        ],
      );
      await client.query(
        'UPDATE "TaskExecution" SET state=$2::"ExecutionState",revision=revision+1 WHERE "taskId"=$1',
        [oldTask, version === 1 ? 'EDITING' : 'APPROVED'],
      );
    }
    await client.query('COMMIT');
    const preserved = {};
    for (const table of [
      'InternalUser',
      'Organization',
      'OrganizationMember',
      'EventScope',
      'EventGrant',
      'TaskScope',
      'Session',
      'AuditRecord',
      'Event',
      'MaterialTask',
      'RequirementVersion',
      'AssignmentHistory',
      'TaskExecution',
      'MaterialDraft',
      'DraftEdit',
      'FileUpload',
      'TemplateUpload',
      'TemplateAttachment',
      'SubmissionVersion',
      'SubmissionAttachment',
      'SubmissionCommand',
      'ReviewRecord',
      'DeadlineHistory',
    ]) {
      const rows = (
        await client.query(
          `SELECT to_jsonb(t) data FROM "${table}" t ORDER BY to_jsonb(t)::text`,
        )
      ).rows;
      preserved[table] = createHash('sha256')
        .update(JSON.stringify(rows))
        .digest('hex');
    }
    const checksums = (
      await client.query(
        'SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name',
      )
    ).rows;
    return {
      preserved,
      checksums,
      objects,
      fileHash,
      fileRoot,
      oldTask,
      oldFile,
      templateId,
      userId,
      auditId,
      checksum,
      taskId,
      configuration,
      snapshots,
      legacyFileId,
      legacyFile,
      reviewerUser,
    };
  } finally {
    await client.end();
    await rm(directory, { recursive: true, force: true });
  }
}
