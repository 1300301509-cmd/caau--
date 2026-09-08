import { createApplication } from './application.js';
import { readConfig } from './config.js';

async function bootstrap() {
  const config = readConfig();
  const app = await createApplication(config);
  await app.listen(config.port, config.host);
  console.log(`CAAU API listening at ${await app.getUrl()}/api/v1/health`);
}

bootstrap().catch((error: unknown) => {
  console.error(
    'API startup failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 1;
});
