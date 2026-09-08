export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const origins = (
    env.CORS_ORIGINS ??
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173'
  )
    .split(',')
    .map((origin) => origin.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins');
    }
  }
  const localIdentity = env.CAAU_IDENTITY_MODE === 'local';
  if (
    env.CAAU_IDENTITY_MODE &&
    !['local', 'disabled'].includes(env.CAAU_IDENTITY_MODE)
  )
    throw new Error('Invalid identity mode');
  if (
    localIdentity &&
    (env.NODE_ENV === 'production' ||
      !['127.0.0.1', '::1'].includes(env.HOST ?? '127.0.0.1'))
  )
    throw new Error('Local identity requires non-production loopback host');
  return {
    localIdentity,
    port,
    host: env.HOST ?? '127.0.0.1',
    origins,
    databaseUrl: env.DATABASE_URL,
  };
}
