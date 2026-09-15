import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import type { Prisma } from './generated/prisma/client.js';

// Prisma is constructed only here; callers never import generated internals.
export type { Prisma } from './generated/prisma/client.js';
export { Role } from './generated/prisma/client.js';

export const localTestOrganizations = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'CAAU 总部（本地测试）',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    name: '承办方 A（本地测试）',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    name: '承办方 B（本地测试）',
  },
] as const;

export const localTestIdentities = [
  {
    key: 'event-manager',
    userId: '00000000-0000-4000-8000-000000000201',
    memberId: '00000000-0000-4000-8000-000000000301',
    displayName: '总部赛事管理员',
    organizationId: localTestOrganizations[0].id,
    role: 'EVENT_MANAGER',
  },
  {
    key: 'reviewer-a',
    userId: '00000000-0000-4000-8000-000000000202',
    memberId: '00000000-0000-4000-8000-000000000302',
    displayName: '总部审核员甲',
    organizationId: localTestOrganizations[0].id,
    role: 'REVIEWER',
  },
  {
    key: 'reviewer-b',
    userId: '00000000-0000-4000-8000-000000000203',
    memberId: '00000000-0000-4000-8000-000000000303',
    displayName: '总部审核员乙',
    organizationId: localTestOrganizations[0].id,
    role: 'REVIEWER',
  },
  {
    key: 'organizer-a',
    userId: '00000000-0000-4000-8000-000000000204',
    memberId: '00000000-0000-4000-8000-000000000304',
    displayName: '承办方 A 经办人',
    organizationId: localTestOrganizations[1].id,
    role: 'ORGANIZER',
  },
  {
    key: 'organizer-b',
    userId: '00000000-0000-4000-8000-000000000205',
    memberId: '00000000-0000-4000-8000-000000000305',
    displayName: '承办方 B 经办人',
    organizationId: localTestOrganizations[2].id,
    role: 'ORGANIZER',
  },
] as const;

export async function prepareLocalTestIdentities(tx: Prisma.TransactionClient) {
  for (const organization of localTestOrganizations)
    await tx.organization.upsert({
      where: { id: organization.id },
      create: organization,
      update: {},
    });
  for (const identity of localTestIdentities) {
    await tx.internalUser.upsert({
      where: { id: identity.userId },
      create: { id: identity.userId, displayName: identity.displayName },
      update: {},
    });
    await tx.organizationMember.upsert({
      where: {
        userId_organizationId_role: {
          userId: identity.userId,
          organizationId: identity.organizationId,
          role: identity.role,
        },
      },
      create: {
        id: identity.memberId,
        userId: identity.userId,
        organizationId: identity.organizationId,
        role: identity.role,
      },
      update: {},
    });
  }
}
export function createAuthorizationDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 6,
    connectionTimeoutMillis: 1000,
    statement_timeout: 5000,
    application_name: 'caau-authorization',
  });
  pool.on('error', () => {});
  const client = new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: false }),
    log: [],
    errorFormat: 'minimal',
  });
  return {
    client,
    async close() {
      await client.$disconnect();
      await pool.end();
    },
  };
}

export interface DatabaseProbe {
  check(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(connectionString?: string): DatabaseProbe {
  // No implicit localhost/user/OS credential fallback when configuration is absent.
  if (!connectionString)
    return { check: async () => false, close: async () => {} };
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('Invalid DATABASE_URL configuration');
  }
  const pool = new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 500,
    query_timeout: 750,
    statement_timeout: 750,
    idleTimeoutMillis: 10000,
    application_name: 'caau-api',
  });
  // A disconnected idle connection must not become an uncaught process error.
  pool.on('error', () => {});
  const adapter = new PrismaPg(pool, {
    disposeExternalPool: false,
    onPoolError: () => {},
  });
  const prisma = new PrismaClient({ adapter, log: [], errorFormat: 'minimal' });
  let inFlight: Promise<boolean> | undefined;
  let closed = false;
  return {
    check() {
      if (closed) return Promise.resolve(false);
      // One probe in flight per process. No health-check storm grows the pool queue.
      inFlight ??= prisma.$queryRaw<Array<{ ready: number }>>`SELECT 1 AS ready`
        .then((rows) => rows[0]?.ready === 1)
        .catch(() => false)
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await prisma.$disconnect();
      } finally {
        await pool.end();
      }
    },
  };
}
