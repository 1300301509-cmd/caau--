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
    'http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:4173'
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
  const deploymentStage = env.CAAU_DEPLOYMENT_STAGE ?? 'local';
  if (!['local', 'test', 'production'].includes(deploymentStage))
    throw new Error('Invalid deployment stage');
  const identityMode = env.CAAU_IDENTITY_MODE ?? 'disabled';
  const localIdentity = identityMode === 'local';
  const serverTestIdentity = identityMode === 'server-test';
  if (!['local', 'server-test', 'disabled'].includes(identityMode))
    throw new Error('Invalid identity mode');
  if (
    localIdentity &&
    (production || !['127.0.0.1', '::1'].includes(env.HOST ?? '127.0.0.1'))
  )
    throw new Error('Local identity requires non-production loopback host');
  if (serverTestIdentity && (!production || deploymentStage !== 'test'))
    throw new Error(
      'Server test identity requires production runtime in test deployment',
    );
  if (deploymentStage === 'production' && identityMode !== 'disabled')
    throw new Error('Production deployment cannot enable test identities');
  if (production && origins.some((origin) => !origin.startsWith('https://')))
    throw new Error('Production CORS_ORIGINS must use HTTPS');
  const trustProxy = Number(env.CAAU_TRUST_PROXY_HOPS ?? '0');
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 2)
    throw new Error('CAAU_TRUST_PROXY_HOPS must be an integer from 0 to 2');
  const wechatAppId = env.CAAU_WECHAT_MINIAPP_APP_ID?.trim();
  const wechatAppSecret = env.CAAU_WECHAT_MINIAPP_APP_SECRET?.trim();
  if (!!wechatAppId !== !!wechatAppSecret)
    throw new Error(
      'WeChat Mini Program AppID and AppSecret must be set together',
    );
  if (wechatAppId && !/^wx[a-zA-Z0-9]{8,30}$/.test(wechatAppId))
    throw new Error('Invalid WeChat Mini Program AppID');
  if (wechatAppSecret && Buffer.byteLength(wechatAppSecret, 'utf8') < 16)
    throw new Error('Invalid WeChat Mini Program AppSecret');
  return {
    localIdentity,
    serverTestIdentity,
    deploymentStage,
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
    wechatMiniapp:
      wechatAppId && wechatAppSecret
        ? { appId: wechatAppId, appSecret: wechatAppSecret }
        : undefined,
  };
}
