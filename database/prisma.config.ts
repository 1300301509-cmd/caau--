import { defineConfig } from 'prisma/config';

// CLI credentials are injected by the repository migration commands.
// Generation must work without a running database or any credentials.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
