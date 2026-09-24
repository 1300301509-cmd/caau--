import { createApplication } from '../application.js';
import { readConfig } from '../config.js';
import { AiService } from '../modules/ai/ai.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { assertStudioEnvironment } from './guard.js';

// No server-side credentials or login tokens are placed in graph state/config.
assertStudioEnvironment(process.env);
const app = await createApplication(readConfig(process.env));
await app.init();
const identity = await app.get(AuthorizationService).issueLocalTestSession({
  identity: 'super-admin',
});
export const graph = app.get(AiService).createStudioGraph(identity.token);
