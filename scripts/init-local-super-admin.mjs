import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

if (process.env.CAAU_ALLOW_LOCAL_SUPER_ADMIN_INIT !== '1')
  throw new Error('Set CAAU_ALLOW_LOCAL_SUPER_ADMIN_INIT=1 explicitly');
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const parsed = new URL(databaseUrl);
if (
  !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
  parsed.pathname !== '/caau_dev'
)
  throw new Error('Super administrator initialization is local caau_dev only');
const organizationId = process.env.CAAU_SUPER_ADMIN_ORGANIZATION_ID;
assert.match(
  organizationId ?? '',
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'CAAU_SUPER_ADMIN_ORGANIZATION_ID must be a UUID',
);
const displayName = process.env.CAAU_SUPER_ADMIN_DISPLAY_NAME?.trim();
if (!displayName || displayName.length > 120)
  throw new Error('CAAU_SUPER_ADMIN_DISPLAY_NAME is required (1-120 chars)');

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('caau:first-super-admin'))",
  );
  const existing = await client.query(
    `SELECT 1 FROM "OrganizationMember"
     WHERE role='HEADQUARTERS_SUPER_ADMIN' AND active LIMIT 1`,
  );
  if (existing.rowCount)
    throw new Error('An active super administrator already exists');
  const organization = await client.query(
    'SELECT 1 FROM "Organization" WHERE id=$1 AND active',
    [organizationId],
  );
  if (!organization.rowCount) throw new Error('Active organization not found');
  const userId = randomUUID();
  const memberId = randomUUID();
  await client.query(
    'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2)',
    [userId, displayName],
  );
  await client.query(
    `INSERT INTO "OrganizationMember"
       (id,"userId","organizationId",role)
     VALUES ($1,$2,$3,'HEADQUARTERS_SUPER_ADMIN')`,
    [memberId, userId, organizationId],
  );
  await client.query('COMMIT');
  process.stdout.write(
    `Initialized local headquarters super administrator user ${userId}, member ${memberId}.\n`,
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
