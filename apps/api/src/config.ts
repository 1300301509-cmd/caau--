function secret(
  env: NodeJS.ProcessEnv,
  name: 'CAAU_CSRF_SECRET' | 'CAAU_LOGIN_THROTTLE_SECRET',
  production: boolean,
) {
  const value =
    env[name] ??
    (name === 'CAAU_CSRF_SECRET'
      ? 'caau-local-only-csrf-secret-not-for-production'
      : 'caau-local-only-throttle-secret-not-for-production');
  if (Buffer.byteLength(value, 'utf8') < 32 || (production && !env[name]))
    throw new Error(`${name} must contain at least 32 bytes`);
  return value;
}

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
  const production = env.NODE_ENV === 'production';
  const localIdentity = env.CAAU_IDENTITY_MODE === 'local';
  if (
    env.CAAU_IDENTITY_MODE &&
    !['local', 'disabled'].includes(env.CAAU_IDENTITY_MODE)
  )
    throw new Error('Invalid identity mode');
  if (
    localIdentity &&
    (production || !['127.0.0.1', '::1'].includes(env.HOST ?? '127.0.0.1'))
  )
    throw new Error('Local identity requires non-production loopback host');
  if (production && origins.some((origin) => !origin.startsWith('https://')))
    throw new Error('Production CORS_ORIGINS must use HTTPS');
  const trustProxy = Number(env.CAAU_TRUST_PROXY_HOPS ?? '0');
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 2)
    throw new Error('CAAU_TRUST_PROXY_HOPS must be an integer from 0 to 2');
  return {
    localIdentity,
    production,
    cookieSecure: production,
    csrfSecret: secret(env, 'CAAU_CSRF_SECRET', production),
    throttleSecret: secret(env, 'CAAU_LOGIN_THROTTLE_SECRET', production),
    sessionTtlMs: 8 * 60 * 60 * 1000,
    trustProxy,
    port,
    host: env.HOST ?? '127.0.0.1',
    origins,
    databaseUrl: env.DATABASE_URL,
    privateFileRoot: env.CAAU_PRIVATE_FILE_ROOT,
  };
}
