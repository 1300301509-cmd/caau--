import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
export const passwordPolicy = {
  minCharacters: 12,
  maxCharacters: 128,
  maxBytes: 512,
} as const;
export const productionScrypt = {
  N: 131_072,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 256 * 1024 * 1024,
} as const;
type ScryptParameters = typeof productionScrypt;

export function validPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const characters = Array.from(value).length;
  return (
    characters >= passwordPolicy.minCharacters &&
    characters <= passwordPolicy.maxCharacters &&
    Buffer.byteLength(value, 'utf8') <= passwordPolicy.maxBytes
  );
}

async function derive(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: parameters.maxmem,
      },
      (error, result) => (error ? reject(error) : resolve(Buffer.from(result))),
    );
  });
}

export async function hashPassword(
  password: string,
  parameters: ScryptParameters = productionScrypt,
) {
  if (!validPassword(password)) throw new Error('Password policy violation');
  const salt = randomBytes(16);
  const hash = await derive(password, salt, parameters);
  return [
    '',
    'scrypt',
    'v=1',
    `N=${parameters.N}`,
    `r=${parameters.r}`,
    `p=${parameters.p}`,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (
    parts.length !== 8 ||
    parts[0] !== '' ||
    parts[1] !== 'scrypt' ||
    parts[2] !== 'v=1'
  )
    return false;
  const numeric = (part: string, name: string) => {
    const match = new RegExp(`^${name}=(\\d+)$`).exec(part);
    return match ? Number(match[1]) : NaN;
  };
  const N = numeric(parts[3]!, 'N');
  const r = numeric(parts[4]!, 'r');
  const p = numeric(parts[5]!, 'p');
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[6]!, 'base64url');
    expected = Buffer.from(parts[7]!, 'base64url');
  } catch {
    return false;
  }
  if (
    N !== productionScrypt.N ||
    r !== productionScrypt.r ||
    p !== productionScrypt.p ||
    salt.length !== 16 ||
    expected.length !== productionScrypt.keyLength
  )
    return false;
  try {
    const actual = await derive(password, salt, productionScrypt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
