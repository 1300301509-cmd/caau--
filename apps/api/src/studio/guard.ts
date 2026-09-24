/** Refuse to mount Studio against development, production or remote databases. */
export function assertStudioEnvironment(env: NodeJS.ProcessEnv) {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('Start Studio using pnpm agent:studio');
  }
  if (
    env.CAAU_STUDIO !== '1' ||
    env.NODE_ENV === 'production' ||
    env.CAAU_IDENTITY_MODE !== 'local' ||
    env.LANGSMITH_TRACING !== 'false' ||
    env.LANGCHAIN_TRACING_V2 !== 'false' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '15433' ||
    url.username !== 'caau_test_app' ||
    !/^\/caau_studio_[a-f0-9]{32}$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Studio requires its isolated local test database and disabled cloud tracing',
    );
}
