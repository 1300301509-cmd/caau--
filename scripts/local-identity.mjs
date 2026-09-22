import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  createAuthorizationDatabase,
  prepareLocalTestIdentities,
} from '../database/dist/index.js';
import { databaseEnvironment, requireDocker } from './database.mjs';

// Trusted offline dev tool, never an HTTP login or a production identity provider.
async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Local identity only');
  const target = process.argv[2];
  if (
    !['bootstrap', 'prepare'].includes(target ?? '') &&
    !/^[a-f0-9-]{36}$/i.test(target ?? '')
  )
    throw new Error('Use prepare, bootstrap or a local internal user UUID');
  await requireDocker();
  const { DATABASE_URL } = await databaseEnvironment('dev');
  const db = createAuthorizationDatabase(DATABASE_URL);
  try {
    if (target === 'prepare') {
      await db.client.$transaction((tx) => prepareLocalTestIdentities(tx));
      console.log(
        'Six fixed local test identities are ready; existing records and business data were not updated.',
      );
      return;
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const userId = await db.client.$transaction(async (tx) => {
      let id = target;
      if (target === 'bootstrap') {
        id = '00000000-0000-4000-8000-000000000001';
        const organizationId = '00000000-0000-4000-8000-000000000002';
        await tx.internalUser.upsert({
          where: { id },
          create: { id, displayName: 'Synthetic local administrator' },
          update: {},
        });
        await tx.organization.upsert({
          where: { id: organizationId },
          create: { id: organizationId, name: 'Synthetic local headquarters' },
          update: {},
        });
        await tx.organizationMember.upsert({
          where: {
            userId_organizationId_role: {
              userId: id,
              organizationId,
              role: 'SYSTEM_ADMIN',
            },
          },
          create: { userId: id, organizationId, role: 'SYSTEM_ADMIN' },
          update: {},
        });
      }
      const user = await tx.internalUser.findUnique({ where: { id } });
      if (!user?.active) throw new Error('Active local user required');
      await tx.session.create({
        data: {
          userId: id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt,
        },
      });
      await tx.auditRecord.create({
        data: {
          actorId: id,
          action: 'session.local.issue',
          resourceId: id,
          outcome: 'ALLOWED',
          requestId: randomUUID(),
        },
      });
      return id;
    });
    // Exclusive file: never overwrite another session or print a bearer token.
    const file = `.local/db/session-${randomUUID()}.json`;
    await writeFile(file, JSON.stringify({ userId, token, expiresAt }) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      `Local-only session saved to ${file}; expires in 8 hours. Not WeChat login.`,
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Local identity failed; check dev migration/configuration and user ID. No credentials printed.',
  );
  process.exitCode = 1;
});
