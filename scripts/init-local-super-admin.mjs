import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword, validPassword } from '../database/dist/index.js';

if (process.env.CAAU_ALLOW_SUPER_ADMIN_INIT !== '1')
  throw new Error('Set CAAU_ALLOW_SUPER_ADMIN_INIT=1 explicitly');
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
new URL(databaseUrl);
const organizationId = process.env.CAAU_SUPER_ADMIN_ORGANIZATION_ID;
assert.match(
  organizationId ?? '',
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'CAAU_SUPER_ADMIN_ORGANIZATION_ID must be a UUID',
);
const displayName = process.env.CAAU_SUPER_ADMIN_DISPLAY_NAME?.trim();
if (!displayName || displayName.length > 80)
  throw new Error('CAAU_SUPER_ADMIN_DISPLAY_NAME is required (1-80 chars)');
const loginName = process.env.CAAU_SUPER_ADMIN_LOGIN_NAME?.trim().toLowerCase();
if (!loginName || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(loginName))
  throw new Error('CAAU_SUPER_ADMIN_LOGIN_NAME is invalid');

async function hiddenLine(prompt) {
  process.stdout.write(prompt);
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Cancelled'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function readPasswordPair() {
  if (process.stdin.isTTY) {
    return [
      await hiddenLine('Temporary password: '),
      await hiddenLine('Confirm temporary password: '),
    ];
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  return [lines[0] ?? '', lines[1] ?? ''];
}

const [password, confirmation] = await readPasswordPair();
if (password !== confirmation || !validPassword(password))
  throw new Error(
    'Passwords must match and satisfy the 12-128 character policy',
  );
const passwordHash = await hashPassword(password);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('caau:first-super-admin'))",
  );
  const existing = await client.query(
    `SELECT u.id,u."loginName",u."passwordHash",m."organizationId"
     FROM "OrganizationMember" m
     JOIN "InternalUser" u ON u.id=m."userId"
     WHERE m.role='HEADQUARTERS_SUPER_ADMIN' AND m.active AND u.active`,
  );
  const organization = await client.query(
    'SELECT 1 FROM "Organization" WHERE id=$1',
    [organizationId],
  );
  if (!organization.rowCount) throw new Error('Organization not found');
  let userId;
  let auditAction;
  if (existing.rowCount) {
    const current = existing.rows[0];
    if (
      existing.rowCount !== 1 ||
      current.organizationId !== organizationId ||
      current.loginName ||
      current.passwordHash
    )
      throw new Error(
        'An initialized active super administrator already exists',
      );
    userId = current.id;
    auditAction = 'account.bootstrap.credentials';
    await client.query(
      `UPDATE "InternalUser"
       SET "loginName"=$1,"passwordHash"=$2,"mustChangePassword"=true,
           "passwordChangedAt"=clock_timestamp()
       WHERE id=$3`,
      [loginName, passwordHash, userId],
    );
  } else {
    userId = randomUUID();
    auditAction = 'account.bootstrap';
    await client.query(
      `INSERT INTO "InternalUser"
         (id,"displayName","loginName","passwordHash","mustChangePassword","passwordChangedAt")
       VALUES ($1,$2,$3,$4,true,clock_timestamp())`,
      [userId, displayName, loginName, passwordHash],
    );
    await client.query(
      `INSERT INTO "OrganizationMember"
         (id,"userId","organizationId",role)
       VALUES ($1,$2,$3,'HEADQUARTERS_SUPER_ADMIN')`,
      [randomUUID(), userId, organizationId],
    );
  }
  await client.query(
    `INSERT INTO "AuditRecord"
       (id,action,outcome,"requestId","resourceId",context)
     VALUES ($1,$2,'ALLOWED',$3,$4,$5::jsonb)`,
    [
      randomUUID(),
      auditAction,
      randomUUID(),
      userId,
      JSON.stringify({ organizationId }),
    ],
  );
  await client.query('COMMIT');
  process.stdout.write(
    'Initialized credentials for the headquarters super administrator.\n',
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
