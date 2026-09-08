import { cp, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
    return { userId, auditId, checksum, taskId, configuration, snapshots };
  } finally {
    await client.end();
    await rm(directory, { recursive: true, force: true });
  }
}
