import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

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
