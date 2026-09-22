import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  createAuthorizationDatabase,
  hashPassword,
  localTestIdentities,
  localTestOrganizations,
  prepareLocalTestIdentities,
  validPassword,
  verifyPassword,
  type Prisma,
} from '@caau/database';
import { localIdentityKeys, roles, taskActions } from './authorization.dto.js';
import {
  deny,
  eventManager,
  hasRole,
  isHeadquartersSuperAdmin,
  taskPolicy,
  type Actor,
} from './policy.js';

export interface AuthorizationConfig {
  databaseUrl?: string;
  localIdentity: boolean;
  serverTestIdentity: boolean;
  production: boolean;
  cookieSecure: boolean;
  csrfSecret: string;
  throttleSecret: string;
  sessionTtlMs: number;
  origins: string[];
  wechatMiniapp?: {
    appId: string;
    appSecret: string;
    exchange?: (code: string) => Promise<{
      openId: string;
      unionId?: string;
    }>;
  };
}
export interface AuthRequest {
  headers: {
    authorization?: string;
    cookie?: string;
    origin?: string;
    'x-csrf-token'?: string;
  };
  method?: string;
  ip?: string;
  token?: string;
  credential?: 'bearer' | 'cookie';
}
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new BadRequestException('UUID required');
  return value.toLowerCase();
}
export function bodyObject(
  input: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('Invalid body');
  return input as Record<string, unknown>;
}
export function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException('Invalid text');
  return value.trim();
}
const loginPattern = /^[a-z0-9][a-z0-9._-]{2,63}$/;
// A valid-format non-credential record keeps unknown-account verification on
// the same scrypt path without creating an extra usable password.
const dummyPasswordHash = `$scrypt$v=1$N=131072$r=8$p=1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
export function loginName(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Invalid input');
  const normalized = value.trim().toLowerCase();
  if (!loginPattern.test(normalized))
    throw new BadRequestException('Invalid input');
  return normalized;
}
function constantEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Only allowlisted IDs, enums and booleans; never names, arbitrary body, or tokens.
function auditContext(input: unknown): Prisma.InputJsonObject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        ([
          'userId',
          'organizationId',
          'eventId',
          'memberId',
          'handlerGrantId',
          'reviewerGrantId',
          'handlerMemberId',
          'reviewerMemberId',
        ].includes(key) &&
          (value === null ||
            (typeof value === 'string' && uuidPattern.test(value)))) ||
        (key === 'active' && typeof value === 'boolean') ||
        (key === 'expectedRevision' &&
          Number.isInteger(value) &&
          Number(value) > 0) ||
        (key === 'role' && roles.includes(value as (typeof roles)[number])) ||
        (key === 'action' &&
          taskActions.includes(value as (typeof taskActions)[number])),
    ),
  );
}

@Injectable()
export class AuthorizationService {
  private readonly database;
  readonly cookieName: string;
  readonly cookieOptions: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
  };
  constructor(private readonly config: AuthorizationConfig) {
    this.database = config.databaseUrl
      ? createAuthorizationDatabase(config.databaseUrl)
      : undefined;
    this.cookieName = config.production
      ? '__Host-caau_session'
      : 'caau_session';
    this.cookieOptions = {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: config.sessionTtlMs,
    };
  }
  get localIdentityEnabled() {
    return this.config.localIdentity;
  }
  get serverTestIdentityEnabled() {
    return this.config.serverTestIdentity;
  }
  get wechatMiniappEnabled() {
    return !!this.config.wechatMiniapp;
  }
  async onModuleDestroy() {
    await this.database?.close();
  }
  private db() {
    if (!this.database)
      throw new ServiceUnavailableException('Authorization unavailable');
    return this.database.client;
  }
  private localDb() {
    if (!this.config.localIdentity)
      throw new ServiceUnavailableException('Local identity unavailable');
    return this.db();
  }
  private async syncHostingInformationAccess(
    tx: Prisma.TransactionClient,
    memberIds: string[],
  ) {
    if (!memberIds.length) return;
    const grants = await tx.hostingApplicationHandlerGrant.findMany({
      where: { memberId: { in: memberIds } },
      include: { member: { include: { user: true } } },
    });
    const now = (
      await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    )[0]!.now;
    for (const grant of grants) {
      const active =
        grant.active && grant.member.active && grant.member.user.active;
      await tx.eventInformationAccessGrant.updateMany({
        where: { sourceHandlerGrantId: grant.id },
        data: { active, revokedAt: active ? null : now },
      });
    }
  }
  localIdentityOptions() {
    this.localDb();
    return localTestIdentities.map((identity) => ({
      key: identity.key,
      displayName: identity.displayName,
      organizationName:
        localTestOrganizations.find(
          (organization) => organization.id === identity.organizationId,
        )?.name ?? '',
      role: identity.role,
    }));
  }
  async serverTestIdentityOptions(token: string) {
    if (!this.config.serverTestIdentity)
      throw new ServiceUnavailableException('Server test identity unavailable');
    return this.run(
      token,
      'session.server-test.list',
      undefined,
      undefined,
      async (_tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        return localTestIdentities.map((identity) => ({
          key: identity.key,
          displayName: identity.displayName,
          organizationName:
            localTestOrganizations.find(
              (organization) => organization.id === identity.organizationId,
            )?.name ?? '',
          role: identity.role,
        }));
      },
    );
  }
  async issueLocalTestSession(input: unknown) {
    const db = this.localDb();
    const body = bodyObject(input, ['identity']);
    if (
      typeof body.identity !== 'string' ||
      !localIdentityKeys.includes(
        body.identity as (typeof localIdentityKeys)[number],
      )
    )
      throw new BadRequestException('Invalid fixed identity');
    const identity = localTestIdentities.find(
      (candidate) => candidate.key === body.identity,
    )!;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    try {
      await db.$transaction(
        async (tx) => {
          await prepareLocalTestIdentities(tx);
          const user = await tx.internalUser.findUnique({
            where: { id: identity.userId },
            include: { memberships: true },
          });
          if (
            !user?.active ||
            !user.memberships.some(
              (member) =>
                member.active &&
                member.organizationId === identity.organizationId &&
                member.role === identity.role,
            )
          )
            throw new ForbiddenException('Fixed local identity is inactive');
          await tx.session.create({
            data: {
              userId: identity.userId,
              tokenHash: hashToken(token),
              clientType: 'LOCAL_TEST',
              expiresAt,
            },
          });
          await tx.auditRecord.create({
            data: {
              actorId: identity.userId,
              action: 'session.local.issue',
              resourceId: identity.userId,
              outcome: 'ALLOWED',
              requestId: randomUUID(),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return {
        identity: identity.key,
        token,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Local identity unavailable');
    }
  }
  async issueServerTestSession(token: string, input: unknown) {
    if (!this.config.serverTestIdentity)
      throw new ServiceUnavailableException('Server test identity unavailable');
    const body = bodyObject(input, ['identity']);
    if (
      typeof body.identity !== 'string' ||
      !localIdentityKeys.includes(
        body.identity as (typeof localIdentityKeys)[number],
      )
    )
      throw new BadRequestException('Invalid fixed identity');
    const identity = localTestIdentities.find(
      (candidate) => candidate.key === body.identity,
    )!;
    const issuedToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    return this.run(
      token,
      'session.server-test.issue',
      identity.userId,
      { identity: identity.key },
      async (tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        await prepareLocalTestIdentities(tx);
        const user = await tx.internalUser.findUnique({
          where: { id: identity.userId },
          include: { memberships: true },
        });
        if (
          !user?.active ||
          !user.memberships.some(
            (member) =>
              member.active &&
              member.organizationId === identity.organizationId &&
              member.role === identity.role,
          )
        )
          throw new ForbiddenException('Fixed test identity is inactive');
        await tx.session.create({
          data: {
            userId: identity.userId,
            tokenHash: hashToken(issuedToken),
            clientType: 'LOCAL_TEST',
            expiresAt,
          },
        });
        return {
          identity: identity.key,
          token: issuedToken,
          expiresAt: expiresAt.toISOString(),
        };
      },
      { retries: 2, retryUnique: true },
    );
  }
  private async session(tx: Prisma.TransactionClient, token: string) {
    const session = await tx.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { memberships: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.active
    )
      throw new UnauthorizedException('Invalid session');
    return session;
  }
  private async actor(tx: Prisma.TransactionClient, token: string) {
    return (await this.session(tx, token)).user;
  }
  async reloadActor(tx: Prisma.TransactionClient, token: string) {
    return this.actor(tx, token);
  }
  private cookieToken(header = '') {
    const prefix = `${this.cookieName}=`;
    for (const part of header.split(';')) {
      const value = part.trim();
      if (value.startsWith(prefix)) return value.slice(prefix.length);
    }
    return undefined;
  }
  private trustedOrigin(request: AuthRequest) {
    if (
      !request.headers.origin ||
      !this.config.origins.includes(request.headers.origin)
    )
      throw new ForbiddenException('Request origin denied');
  }
  private csrfToken(session: { id: string; createdAt: Date }) {
    return createHmac('sha256', this.config.csrfSecret)
      .update(`${session.id}:${session.createdAt.toISOString()}`)
      .digest('base64url');
  }
  private throttleSubject(scope: 'account' | 'client', value: string) {
    return createHmac('sha256', this.config.throttleSecret)
      .update(`${scope}:${value}`)
      .digest('hex');
  }
  async authenticate(request: AuthRequest, action?: string) {
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
      request.headers.authorization ?? '',
    )?.[1];
    const cookie = this.cookieToken(request.headers.cookie);
    try {
      if (bearer && cookie)
        throw new UnauthorizedException('Ambiguous session credentials');
      const token = bearer ?? cookie;
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new UnauthorizedException('Session required');
      const session = await this.session(this.db(), token);
      const credential = bearer ? 'bearer' : 'cookie';
      if (
        session.user.mustChangePassword &&
        ![
          'session.status',
          'session.logout',
          'session.password.change',
        ].includes(action ?? '')
      )
        throw new ForbiddenException('Password change required');
      if (
        credential === 'cookie' &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? '')
      ) {
        this.trustedOrigin(request);
        if (
          !constantEqual(
            request.headers['x-csrf-token'] ?? '',
            this.csrfToken(session),
          )
        )
          throw new ForbiddenException('CSRF validation failed');
      }
      request.token = token;
      request.credential = credential;
    } catch (error) {
      if (this.database) {
        try {
          await this.database.client.auditRecord.create({
            data: {
              action: 'session.authenticate',
              outcome: 'DENIED',
              requestId: randomUUID(),
            },
          });
        } catch {
          throw new ServiceUnavailableException('Authorization unavailable');
        }
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Authorization unavailable');
    }
  }
  private async throttled(subjectHashes: string[]) {
    return (
      (await this.db().authenticationThrottle.count({
        where: {
          subjectHash: { in: subjectHashes },
          blockedUntil: { gt: new Date() },
        },
      })) > 0
    );
  }
  private async recordLoginFailure(
    accountSubject: string,
    clientSubject: string,
  ) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
    const write = () =>
      this.db().$transaction(
        async (tx) => {
          for (const [subjectHash, limit] of [
            [accountSubject, 5],
            [clientSubject, 20],
          ] as const) {
            const current = await tx.authenticationThrottle.findUnique({
              where: { subjectHash },
            });
            const failures =
              !current || current.windowStartedAt <= windowStart
                ? 1
                : current.failures + 1;
            await tx.authenticationThrottle.upsert({
              where: { subjectHash },
              create: {
                subjectHash,
                failures,
                windowStartedAt: now,
                blockedUntil:
                  failures >= limit
                    ? new Date(now.getTime() + 15 * 60 * 1000)
                    : null,
              },
              update: {
                failures,
                ...(current?.windowStartedAt &&
                current.windowStartedAt > windowStart
                  ? {}
                  : { windowStartedAt: now }),
                blockedUntil:
                  failures >= limit
                    ? new Date(now.getTime() + 15 * 60 * 1000)
                    : current?.blockedUntil,
              },
            });
          }
          await tx.auditRecord.create({
            data: {
              action: 'session.password.login',
              outcome: 'DENIED',
              requestId: randomUUID(),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    for (let attempt = 0; ; attempt++) {
      try {
        await write();
        return;
      } catch (error) {
        const code =
          typeof error === 'object' && error && 'code' in error
            ? String(error.code)
            : '';
        if (attempt >= 2 || !['P2002', 'P2034'].includes(code)) throw error;
      }
    }
  }
  private authenticationResponse(session: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    user: Actor;
  }) {
    return {
      id: session.user.id,
      displayName: session.user.displayName,
      roles: [
        ...new Set(
          session.user.memberships
            .filter((membership) => membership.active)
            .map((membership) => membership.role),
        ),
      ],
      mustChangePassword: session.user.mustChangePassword,
      expiresAt: session.expiresAt.toISOString(),
      csrfToken: this.csrfToken(session),
    };
  }
  async login(input: unknown, request: AuthRequest) {
    this.trustedOrigin(request);
    const body = bodyObject(input, ['loginName', 'password']);
    const candidate =
      typeof body.loginName === 'string'
        ? body.loginName.trim().toLowerCase()
        : '';
    const validLoginName = loginPattern.test(candidate);
    const validSuppliedPassword = validPassword(body.password);
    const suppliedPassword = validSuppliedPassword
      ? (body.password as string)
      : 'invalid-password-placeholder';
    const accountSubject = this.throttleSubject(
      'account',
      validLoginName ? candidate : '<invalid>',
    );
    const clientSubject = this.throttleSubject(
      'client',
      request.ip ?? 'unknown',
    );
    if (await this.throttled([accountSubject, clientSubject])) {
      await this.db().auditRecord.create({
        data: {
          action: 'session.password.login',
          outcome: 'DENIED',
          requestId: randomUUID(),
          context: { reason: 'THROTTLED' },
        },
      });
      throw new HttpException(
        'Unable to sign in',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = validLoginName
      ? await this.db().internalUser.findUnique({
          where: { loginName: candidate },
          include: { memberships: true },
        })
      : null;
    const verified = await verifyPassword(
      suppliedPassword,
      user?.passwordHash ?? dummyPasswordHash,
    );
    if (
      !validSuppliedPassword ||
      !verified ||
      !user?.active ||
      !user.passwordHash
    ) {
      await this.recordLoginFailure(accountSubject, clientSubject);
      if (await this.throttled([accountSubject, clientSubject]))
        throw new HttpException(
          'Unable to sign in',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      throw new UnauthorizedException('Unable to sign in');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    const session = await this.db().$transaction(
      async (tx) => {
        const current = await tx.internalUser.findUnique({
          where: { id: user.id },
          include: { memberships: true },
        });
        if (
          !current?.active ||
          !current.passwordHash ||
          current.passwordHash !== user.passwordHash
        )
          throw new UnauthorizedException('Unable to sign in');
        const created = await tx.session.create({
          data: {
            userId: current.id,
            tokenHash: hashToken(token),
            clientType: 'WEB_PASSWORD',
            expiresAt,
          },
          include: { user: { include: { memberships: true } } },
        });
        await tx.authenticationThrottle.deleteMany({
          where: { subjectHash: { in: [accountSubject, clientSubject] } },
        });
        await tx.auditRecord.create({
          data: {
            actorId: current.id,
            action: 'session.password.login',
            resourceId: current.id,
            outcome: 'ALLOWED',
            requestId: randomUUID(),
          },
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    return { token, response: this.authenticationResponse(session) };
  }
  private wechatCode(input: unknown, binding: boolean) {
    const body = bodyObject(
      input,
      binding ? ['code', 'bindingToken'] : ['code'],
    );
    if (
      typeof body.code !== 'string' ||
      body.code.length < 1 ||
      body.code.length > 256 ||
      /\s/.test(body.code)
    )
      throw new BadRequestException('Invalid login code');
    return { body, code: body.code };
  }
  private async exchangeWechatCode(code: string) {
    const config = this.config.wechatMiniapp;
    if (!config)
      throw new ServiceUnavailableException('WeChat login unavailable');
    if (config.exchange) return config.exchange(code);
    const query = new URLSearchParams({
      appid: config.appId,
      secret: config.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`,
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok)
        throw new ServiceUnavailableException('WeChat login unavailable');
      const result = (await response.json()) as {
        errcode?: number;
        openid?: unknown;
        unionid?: unknown;
      };
      if (
        (result.errcode !== undefined && result.errcode !== 0) ||
        typeof result.openid !== 'string' ||
        !/^[^\s]{1,128}$/.test(result.openid) ||
        (result.unionid !== undefined &&
          (typeof result.unionid !== 'string' ||
            !/^[^\s]{1,128}$/.test(result.unionid)))
      )
        throw new UnauthorizedException('Unable to sign in');
      return {
        openId: result.openid,
        ...(result.unionid ? { unionId: result.unionid } : {}),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('WeChat login unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
  private activeOrganizer(actor: Actor) {
    return actor.memberships.some(
      (membership) => membership.active && membership.role === 'ORGANIZER',
    );
  }
  private async wechatClientSubject(request: AuthRequest, action: string) {
    const subject = this.throttleSubject(
      'client',
      `wechat:${request.ip ?? 'unknown'}`,
    );
    if (await this.throttled([subject])) {
      await this.db().auditRecord.create({
        data: {
          action,
          outcome: 'DENIED',
          requestId: randomUUID(),
          context: { reason: 'THROTTLED' },
        },
      });
      throw new HttpException(
        'Unable to sign in',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return subject;
  }
  private async recordWechatDenial(action: string, subject: string) {
    const write = () =>
      this.db().$transaction(
        async (tx) => {
          const now = new Date();
          const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
          const current = await tx.authenticationThrottle.findUnique({
            where: { subjectHash: subject },
          });
          const failures =
            !current || current.windowStartedAt <= windowStart
              ? 1
              : current.failures + 1;
          await tx.authenticationThrottle.upsert({
            where: { subjectHash: subject },
            create: {
              subjectHash: subject,
              failures,
              windowStartedAt: now,
              blockedUntil:
                failures >= 20
                  ? new Date(now.getTime() + 15 * 60 * 1000)
                  : null,
            },
            update: {
              failures,
              ...(current?.windowStartedAt &&
              current.windowStartedAt > windowStart
                ? {}
                : { windowStartedAt: now }),
              blockedUntil:
                failures >= 20
                  ? new Date(now.getTime() + 15 * 60 * 1000)
                  : current?.blockedUntil,
            },
          });
          await tx.auditRecord.create({
            data: { action, outcome: 'DENIED', requestId: randomUUID() },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    for (let attempt = 0; ; attempt++) {
      try {
        await write();
        return;
      } catch (error) {
        const code =
          typeof error === 'object' && error && 'code' in error
            ? String(error.code)
            : '';
        if (attempt >= 2 || !['P2002', 'P2034'].includes(code))
          throw new ServiceUnavailableException('Authorization unavailable');
      }
    }
  }
  async createWechatBindingIntent(
    token: string,
    credential: AuthRequest['credential'],
  ) {
    if (!this.config.wechatMiniapp)
      throw new ServiceUnavailableException('WeChat login unavailable');
    const bindingToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return this.run(
      token,
      'session.wechat.binding.create',
      undefined,
      undefined,
      async (tx, actor) => {
        if (credential !== 'cookie' || !this.activeOrganizer(actor)) deny();
        const currentSession = await tx.session.findUnique({
          where: { tokenHash: hashToken(token) },
        });
        if (
          !currentSession ||
          currentSession.clientType !== 'WEB_PASSWORD' ||
          currentSession.revokedAt ||
          currentSession.expiresAt <= new Date()
        )
          deny();
        if (
          await tx.wechatIdentity.findUnique({
            where: {
              appId_userId: {
                appId: this.config.wechatMiniapp?.appId ?? '',
                userId: actor.id,
              },
            },
          })
        )
          throw new ConflictException('WeChat identity already bound');
        const now = new Date();
        await tx.identityBindingIntent.updateMany({
          where: {
            userId: actor.id,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        await tx.identityBindingIntent.create({
          data: {
            tokenHash: hashToken(bindingToken),
            userId: actor.id,
            sessionId: currentSession.id,
            expiresAt,
          },
        });
        return { bindingToken, expiresAt: expiresAt.toISOString() };
      },
    );
  }
  async wechatLogin(input: unknown, request: AuthRequest) {
    const { code } = this.wechatCode(input, false);
    const clientSubject = await this.wechatClientSubject(
      request,
      'session.wechat.login',
    );
    const config = this.config.wechatMiniapp;
    if (!config)
      throw new ServiceUnavailableException('WeChat login unavailable');
    let exchanged: { openId: string; unionId?: string };
    try {
      exchanged = await this.exchangeWechatCode(code);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        await this.recordWechatDenial('session.wechat.login', clientSubject);
      throw error;
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    try {
      await this.db().$transaction(
        async (tx) => {
          const identity = await tx.wechatIdentity.findUnique({
            where: {
              appId_openId: { appId: config.appId, openId: exchanged.openId },
            },
            include: { user: { include: { memberships: true } } },
          });
          if (!identity?.user.active || !this.activeOrganizer(identity.user))
            throw new UnauthorizedException('Unable to sign in');
          await tx.wechatIdentity.update({
            where: { id: identity.id },
            data: {
              lastLoginAt: new Date(),
              ...(exchanged.unionId && !identity.unionId
                ? { unionId: exchanged.unionId }
                : {}),
            },
          });
          await tx.session.create({
            data: {
              userId: identity.userId,
              tokenHash: hashToken(token),
              clientType: 'WECHAT_MINIAPP',
              expiresAt,
            },
          });
          await tx.authenticationThrottle.deleteMany({
            where: { subjectHash: clientSubject },
          });
          await tx.auditRecord.create({
            data: {
              actorId: identity.userId,
              action: 'session.wechat.login',
              resourceId: identity.userId,
              outcome: 'ALLOWED',
              requestId: randomUUID(),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return { token, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      await this.recordWechatDenial('session.wechat.login', clientSubject);
      if (await this.throttled([clientSubject]))
        throw new HttpException(
          'Unable to sign in',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('WeChat login unavailable');
    }
  }
  async bindWechat(input: unknown, request: AuthRequest) {
    const { body, code } = this.wechatCode(input, true);
    if (
      typeof body.bindingToken !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.bindingToken)
    )
      throw new BadRequestException('Invalid binding credential');
    const clientSubject = await this.wechatClientSubject(
      request,
      'identity.wechat.bind',
    );
    const config = this.config.wechatMiniapp;
    if (!config)
      throw new ServiceUnavailableException('WeChat login unavailable');
    let exchanged: { openId: string; unionId?: string };
    try {
      exchanged = await this.exchangeWechatCode(code);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        await this.recordWechatDenial('identity.wechat.bind', clientSubject);
      throw error;
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    try {
      await this.db().$transaction(
        async (tx) => {
          const intent = await tx.identityBindingIntent.findUnique({
            where: { tokenHash: hashToken(body.bindingToken as string) },
            include: {
              session: true,
              user: { include: { memberships: true } },
            },
          });
          const now = new Date();
          if (
            !intent ||
            intent.consumedAt ||
            intent.expiresAt <= now ||
            intent.session.revokedAt ||
            intent.session.expiresAt <= now ||
            intent.session.clientType !== 'WEB_PASSWORD' ||
            intent.session.userId !== intent.userId ||
            !intent.user.active ||
            !this.activeOrganizer(intent.user)
          )
            throw new UnauthorizedException('Unable to bind identity');
          await tx.wechatIdentity.create({
            data: {
              userId: intent.userId,
              appId: config.appId,
              openId: exchanged.openId,
              unionId: exchanged.unionId,
              lastLoginAt: now,
            },
          });
          await tx.identityBindingIntent.update({
            where: { id: intent.id },
            data: { consumedAt: now },
          });
          await tx.session.create({
            data: {
              userId: intent.userId,
              tokenHash: hashToken(token),
              clientType: 'WECHAT_MINIAPP',
              expiresAt,
            },
          });
          await tx.authenticationThrottle.deleteMany({
            where: { subjectHash: clientSubject },
          });
          await tx.auditRecord.create({
            data: {
              actorId: intent.userId,
              action: 'identity.wechat.bind',
              resourceId: intent.userId,
              outcome: 'ALLOWED',
              requestId: randomUUID(),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return { token, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      await this.recordWechatDenial('identity.wechat.bind', clientSubject);
      if (await this.throttled([clientSubject]))
        throw new HttpException(
          'Unable to sign in',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      if (error instanceof HttpException) throw error;
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('WeChat identity already bound');
      throw new ServiceUnavailableException('WeChat login unavailable');
    }
  }
  async sessionStatus(token: string) {
    return this.authenticationResponse(await this.session(this.db(), token));
  }
  async changePassword(token: string, input: unknown) {
    const body = bodyObject(input, ['currentPassword', 'newPassword']);
    if (
      !validPassword(body.currentPassword) ||
      !validPassword(body.newPassword)
    )
      throw new BadRequestException('Invalid password');
    const currentSession = await this.session(this.db(), token);
    if (
      !currentSession.user.passwordHash ||
      !(await verifyPassword(
        body.currentPassword,
        currentSession.user.passwordHash,
      ))
    )
      throw new UnauthorizedException('Current password is incorrect');
    if (
      await verifyPassword(body.newPassword, currentSession.user.passwordHash)
    )
      throw new BadRequestException('New password must be different');
    const nextHash = await hashPassword(body.newPassword);
    const nextToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    const next = await this.db().$transaction(
      async (tx) => {
        const current = await tx.internalUser.findUnique({
          where: { id: currentSession.user.id },
        });
        if (
          !current?.active ||
          current.passwordHash !== currentSession.user.passwordHash
        )
          throw new UnauthorizedException('Current password is incorrect');
        await tx.internalUser.update({
          where: { id: current.id },
          data: {
            passwordHash: nextHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          },
        });
        await tx.session.updateMany({
          where: { userId: current.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const created = await tx.session.create({
          data: {
            userId: current.id,
            tokenHash: hashToken(nextToken),
            clientType: 'WEB_PASSWORD',
            expiresAt,
          },
          include: { user: { include: { memberships: true } } },
        });
        await tx.auditRecord.create({
          data: {
            actorId: current.id,
            action: 'session.password.change',
            resourceId: current.id,
            outcome: 'ALLOWED',
            requestId: randomUUID(),
          },
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    return { token: nextToken, response: this.authenticationResponse(next) };
  }
  private accountAdministrator(actor: Actor) {
    if (!hasRole(actor, 'SYSTEM_ADMIN') && !isHeadquartersSuperAdmin(actor))
      deny();
  }
  async listAccounts(token: string) {
    return this.run(
      token,
      'admin.account.read',
      undefined,
      undefined,
      async (tx, actor) => {
        this.accountAdministrator(actor);
        const users = await tx.internalUser.findMany({
          include: {
            memberships: {
              include: {
                organization: true,
                grants: {
                  include: {
                    event: { include: { businessEvent: true } },
                  },
                },
                hostingApplicationHandlerGrant: true,
                hostingApplicationReviewGrant: true,
              },
            },
          },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        });
        return users.map((user) => ({
          id: user.id,
          displayName: user.displayName,
          loginName: user.loginName,
          active: user.active,
          passwordConfigured: !!user.passwordHash,
          mustChangePassword: user.mustChangePassword,
          memberships: user.memberships.map((membership) => ({
            id: membership.id,
            organizationId: membership.organizationId,
            organizationName: membership.organization.name,
            role: membership.role,
            active: membership.active,
          })),
          eventGrantIds: user.memberships.flatMap((membership) =>
            membership.grants
              .filter((grant) => grant.active)
              .map((grant) => grant.id),
          ),
          eventGrants: user.memberships.flatMap((membership) =>
            membership.grants.map((grant) => ({
              id: grant.id,
              eventId: grant.eventId,
              memberId: grant.memberId,
              eventName: grant.event.businessEvent?.name ?? null,
              active: grant.active,
            })),
          ),
          hostingHandlerGrant:
            user.memberships
              .map((membership) => membership.hostingApplicationHandlerGrant)
              .find((grant) => !!grant) ?? null,
          hostingReviewGrant:
            user.memberships
              .map((membership) => membership.hostingApplicationReviewGrant)
              .find((grant) => !!grant) ?? null,
          hostingHandlerGrantId:
            user.memberships.find(
              (membership) => membership.hostingApplicationHandlerGrant?.active,
            )?.hostingApplicationHandlerGrant?.id ?? null,
          hostingReviewGrantId:
            user.memberships.find(
              (membership) => membership.hostingApplicationReviewGrant?.active,
            )?.hostingApplicationReviewGrant?.id ?? null,
        }));
      },
    );
  }
  async createAccount(token: string, input: unknown) {
    const body = bodyObject(input, [
      'loginName',
      'displayName',
      'temporaryPassword',
      'memberships',
    ]);
    const normalized = loginName(body.loginName);
    const displayName = text(body.displayName, 80);
    if (!validPassword(body.temporaryPassword))
      throw new BadRequestException('Invalid temporary password');
    if (
      !Array.isArray(body.memberships) ||
      body.memberships.length < 1 ||
      body.memberships.length > 10
    )
      throw new BadRequestException('Memberships required');
    const memberships = body.memberships.map((value) => {
      const membership = bodyObject(value, ['organizationId', 'role']);
      if (!roles.includes(membership.role as (typeof roles)[number]))
        throw new BadRequestException('Invalid role');
      return {
        organizationId: uuid(membership.organizationId),
        role: membership.role as (typeof roles)[number],
      };
    });
    if (
      new Set(
        memberships.map(
          (membership) => `${membership.organizationId}:${membership.role}`,
        ),
      ).size !== memberships.length
    )
      throw new BadRequestException('Duplicate membership');
    const passwordHash = await hashPassword(body.temporaryPassword);
    return this.run(
      token,
      'admin.account.create',
      undefined,
      { memberships },
      async (tx, actor) => {
        this.accountAdministrator(actor);
        if (
          memberships.some(
            (membership) => membership.role === 'HEADQUARTERS_SUPER_ADMIN',
          ) &&
          !isHeadquartersSuperAdmin(actor)
        )
          deny();
        const user = await tx.internalUser.create({
          data: {
            loginName: normalized,
            displayName,
            passwordHash,
            mustChangePassword: true,
            passwordChangedAt: new Date(),
            memberships: { create: memberships },
          },
          select: { id: true },
        });
        return user;
      },
    );
  }
  async resetAccountPassword(token: string, id: string, input: unknown) {
    const body = bodyObject(input, ['temporaryPassword']);
    if (!validPassword(body.temporaryPassword))
      throw new BadRequestException('Invalid temporary password');
    const passwordHash = await hashPassword(body.temporaryPassword);
    return this.run(
      token,
      'admin.account.password.reset',
      id,
      undefined,
      async (tx, actor, targetId) => {
        this.accountAdministrator(actor);
        if (actor.id === targetId) deny();
        const target = await tx.internalUser.findUnique({
          where: { id: targetId! },
          include: { memberships: true },
        });
        if (!target?.loginName) deny();
        if (
          target.memberships.some(
            (membership) =>
              membership.active &&
              membership.role === 'HEADQUARTERS_SUPER_ADMIN',
          ) &&
          !isHeadquartersSuperAdmin(actor)
        )
          deny();
        await tx.internalUser.update({
          where: { id: target.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            passwordChangedAt: new Date(),
          },
        });
        await tx.session.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { id: target.id };
      },
    );
  }
  execute(token: string, action: string, resource?: string, input?: unknown) {
    return this.run(token, action, resource, input, (tx, actor, id) =>
      this.dispatch(tx, actor, token, action, id, input),
    );
  }
  async run<T>(
    token: string,
    action: string,
    resource: string | undefined,
    input: unknown,
    work: (
      tx: Prisma.TransactionClient,
      actor: Actor,
      id: string | undefined,
    ) => Promise<T>,
    options: { retries?: number; timeout?: number; retryUnique?: boolean } = {},
  ): Promise<T> {
    const db = this.db();
    const requestId = randomUUID();
    const context = auditContext(input);
    let actorId: string | undefined;
    try {
      return await db.$transaction(
        async (tx) => {
          const actor = await this.actor(tx, token);
          actorId = actor.id;
          const id = resource === undefined ? undefined : uuid(resource);
          const result = await work(tx, actor, id);
          await tx.auditRecord.create({
            data: {
              actorId,
              action,
              resourceId:
                id ??
                (typeof result === 'object' && result && 'id' in result
                  ? String(result.id)
                  : undefined),
              outcome: 'ALLOWED',
              requestId,
              context,
            },
          });
          return result;
        },
        { isolationLevel: 'Serializable', timeout: options.timeout ?? 5000 },
      );
    } catch (error) {
      const databaseError = error as {
        code?: string;
        meta?: {
          code?: string;
          driverAdapterError?: { cause?: { originalCode?: string } };
        };
      };
      const sqlState =
        databaseError.meta?.code ??
        databaseError.meta?.driverAdapterError?.cause?.originalCode;
      const serializationConflict =
        databaseError.code === 'P2034' ||
        (databaseError.code === 'P2010' &&
          ['40001', '40P01'].includes(sqlState ?? ''));
      if (
        (serializationConflict ||
          (options.retryUnique && databaseError.code === 'P2002')) &&
        (options.retries ?? 0) > 0
      )
        return this.run(token, action, resource, input, work, {
          ...options,
          retries: options.retries! - 1,
        });
      try {
        await db.auditRecord.create({
          data: {
            actorId,
            action,
            resourceId:
              resource && uuidPattern.test(resource) ? resource : undefined,
            outcome: 'DENIED',
            requestId,
            context,
          },
        });
      } catch {
        throw new ServiceUnavailableException('Authorization unavailable');
      }
      if (error instanceof HttpException) throw error;
      const code = (error as { code?: string }).code;
      if (
        serializationConflict ||
        ['P2002', 'P2003', 'P2025'].includes(code ?? '')
      )
        throw new ConflictException('Conflicting authorization change');
      throw new ServiceUnavailableException('Authorization unavailable');
    }
  }
  async createEventAnchor(
    tx: Prisma.TransactionClient,
    actor: Actor,
  ): Promise<{ id: string }> {
    return (await this.dispatch(
      tx,
      actor,
      '',
      'event.create',
      undefined,
      undefined,
    )) as { id: string };
  }
  async requireEventManager(
    tx: Prisma.TransactionClient,
    actor: Actor,
    eventId: string,
  ) {
    if (isHeadquartersSuperAdmin(actor)) return;
    if (hasRole(actor, 'ORGANIZER')) deny();
    await eventManager(tx, actor, eventId);
  }
  async assignTaskAnchor(
    tx: Prisma.TransactionClient,
    actor: Actor,
    eventId: string,
    organizationId: string,
    handlerMemberId: string,
    reviewerMemberId: string,
    taskId?: string,
  ) {
    await this.requireEventManager(tx, actor, eventId);
    const handler = await tx.organizationMember.findUnique({
      where: { id: handlerMemberId },
      include: { user: true },
    });
    const reviewer = await tx.organizationMember.findUnique({
      where: { id: reviewerMemberId },
      include: { user: { include: { memberships: true } } },
    });
    if (
      !handler?.active ||
      !handler.user.active ||
      handler.role !== 'ORGANIZER' ||
      handler.organizationId !== organizationId ||
      !reviewer?.active ||
      !reviewer.user.active ||
      reviewer.role !== 'REVIEWER' ||
      reviewer.userId === handler.userId ||
      reviewer.user.memberships.some(
        (m) =>
          m.active &&
          (m.role === 'ORGANIZER' || m.organizationId === organizationId),
      )
    )
      deny();
    const grant = (memberId: string) =>
      tx.eventGrant.upsert({
        where: { eventId_memberId: { eventId, memberId } },
        create: { eventId, memberId },
        update: {},
      });
    const handlerGrant = await grant(handler.id);
    const reviewerGrant = await grant(reviewer.id);
    if (!handlerGrant.active || !reviewerGrant.active) deny();
    const data = {
      eventId,
      handlerGrantId: handlerGrant.id,
      reviewerGrantId: reviewerGrant.id,
    };
    return taskId
      ? tx.taskScope.update({ where: { id: taskId }, data })
      : tx.taskScope.create({ data });
  }
  async directory(tx: Prisma.TransactionClient, actor: Actor) {
    if (
      (!hasRole(actor, 'EVENT_MANAGER') &&
        !hasRole(actor, 'SYSTEM_ADMIN') &&
        !isHeadquartersSuperAdmin(actor)) ||
      hasRole(actor, 'ORGANIZER')
    )
      deny();
    const administrator =
      hasRole(actor, 'SYSTEM_ADMIN') || isHeadquartersSuperAdmin(actor);
    const members = await tx.organizationMember.findMany({
      where: {
        active: true,
        user: { active: true },
        ...(administrator
          ? {}
          : {
              role: {
                in: ['ORGANIZER', 'REVIEWER'] as Array<
                  'ORGANIZER' | 'REVIEWER'
                >,
              },
            }),
      },
      select: { id: true, userId: true, organizationId: true, role: true },
      orderBy: { id: 'asc' },
    });
    return {
      users: await tx.internalUser.findMany({
        where: {
          active: true,
          ...(administrator
            ? {}
            : { id: { in: members.map((m) => m.userId) } }),
        },
        select: { id: true, displayName: true },
        orderBy: { id: 'asc' },
      }),
      organizations: await tx.organization.findMany({
        where: administrator
          ? {}
          : { id: { in: members.map((m) => m.organizationId) } },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      members,
    };
  }
  private async dispatch(
    tx: Prisma.TransactionClient,
    actor: Actor,
    token: string,
    action: string,
    id: string | undefined,
    input: unknown,
  ): Promise<unknown> {
    if (action === 'session.me') return { id: actor.id };
    if (action === 'session.logout') {
      await tx.session.update({
        where: { tokenHash: hashToken(token) },
        data: { revokedAt: new Date() },
      });
      return { id: actor.id };
    }
    if (action.startsWith('admin.')) {
      if (!hasRole(actor, 'SYSTEM_ADMIN') && !isHeadquartersSuperAdmin(actor))
        deny();
      if (action === 'admin.user.create') {
        const b = bodyObject(input, ['displayName']);
        return tx.internalUser.create({
          data: { displayName: text(b.displayName, 80) },
          select: { id: true },
        });
      }
      if (action === 'admin.organization.create') {
        const b = bodyObject(input, ['name']);
        return tx.organization.create({
          data: { name: text(b.name, 120) },
          select: { id: true },
        });
      }
      if (action === 'admin.member.create') {
        const b = bodyObject(input, ['userId', 'organizationId', 'role']);
        if (
          !roles.includes(b.role as (typeof roles)[number]) ||
          (b.role === 'HEADQUARTERS_SUPER_ADMIN' &&
            !isHeadquartersSuperAdmin(actor))
        )
          throw new BadRequestException(
            'Super administrator requires super-admin authority or controlled initialization',
          );
        return tx.organizationMember.create({
          data: {
            userId: uuid(b.userId),
            organizationId: uuid(b.organizationId),
            role: b.role as (typeof roles)[number],
          },
          select: { id: true },
        });
      }
      if (action === 'admin.user.active' || action === 'admin.member.active') {
        const b = bodyObject(input, ['active']);
        if (typeof b.active !== 'boolean')
          throw new BadRequestException('Boolean required');
        if (action === 'admin.user.active') {
          const target = await tx.internalUser.findUnique({
            where: { id: id! },
            include: { memberships: true },
          });
          if (!target) deny();
          const targetIsSuper = target.memberships.some(
            (membership) =>
              membership.active &&
              membership.role === 'HEADQUARTERS_SUPER_ADMIN',
          );
          if (targetIsSuper && !isHeadquartersSuperAdmin(actor)) deny();
          if (!b.active && target.id === actor.id) deny();
          if (!b.active && targetIsSuper) {
            const otherSuperAdministrators = await tx.organizationMember.count({
              where: {
                role: 'HEADQUARTERS_SUPER_ADMIN',
                active: true,
                userId: { not: target.id },
                user: { active: true },
              },
            });
            if (!otherSuperAdministrators)
              throw new ConflictException(
                'The last active super administrator cannot be disabled',
              );
          }
          const user = await tx.internalUser.update({
            where: { id: target.id },
            data: { active: b.active },
            select: { id: true, memberships: { select: { id: true } } },
          });
          if (!b.active)
            await tx.session.updateMany({
              where: { userId: user.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          await this.syncHostingInformationAccess(
            tx,
            user.memberships.map((member) => member.id),
          );
          return { id: user.id };
        }
        const member = await tx.organizationMember.update({
          where: { id: id! },
          data: { active: b.active },
          select: { id: true },
        });
        await this.syncHostingInformationAccess(tx, [member.id]);
        return member;
      }
      if (action === 'admin.grant.create') {
        const b = bodyObject(input, ['eventId', 'memberId']);
        const member = await tx.organizationMember.findUnique({
          where: { id: uuid(b.memberId) },
          include: { user: true },
        });
        if (
          !member?.active ||
          !member.user.active ||
          ['SYSTEM_ADMIN', 'HEADQUARTERS_SUPER_ADMIN'].includes(member.role)
        )
          deny();
        return tx.eventGrant.create({
          data: { eventId: uuid(b.eventId), memberId: member.id },
          select: { id: true },
        });
      }
      if (action === 'admin.grant.active') {
        const b = bodyObject(input, ['active']);
        if (typeof b.active !== 'boolean')
          throw new BadRequestException('Boolean required');
        return tx.eventGrant.update({
          where: { id: id! },
          data: { active: b.active },
          select: { id: true },
        });
      }
      if (action === 'admin.grant.delete') {
        const referenced = await tx.assignmentHistory.count({
          where: {
            OR: [
              { handlerGrantId: id! },
              { reviewerGrantId: id! },
              { previousHandlerGrantId: id! },
              { previousReviewerGrantId: id! },
            ],
          },
        });
        const individualReferences = await tx.individualAssignmentHistory.count(
          {
            where: {
              OR: [{ handlerGrantId: id! }, { previousHandlerGrantId: id! }],
            },
          },
        );
        if (referenced || individualReferences)
          throw new ConflictException(
            'Historical assignment grants must be retained; deactivate membership to revoke access',
          );
        return tx.eventGrant.delete({
          where: { id: id! },
          select: { id: true },
        });
      }
      if (action === 'admin.audit.read')
        return tx.auditRecord.findMany({
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 100,
        });
      deny();
    }
    if (action === 'event.create') {
      if (isHeadquartersSuperAdmin(actor))
        return tx.eventScope.create({ data: {}, select: { id: true } });
      const member = actor.memberships.find(
        (m) => m.active && m.role === 'EVENT_MANAGER',
      );
      if (!member || hasRole(actor, 'ORGANIZER')) deny();
      const event = await tx.eventScope.create({
        data: {},
        select: { id: true },
      });
      await tx.eventGrant.create({
        data: { eventId: event.id, memberId: member.id },
      });
      return event;
    }
    if (action === 'event.read') {
      if (isHeadquartersSuperAdmin(actor)) return { id };
      const grants = await tx.eventGrant.count({
        where: {
          eventId: id!,
          active: true,
          member: {
            userId: actor.id,
            active: true,
            role: { not: 'SYSTEM_ADMIN' },
          },
        },
      });
      if (!grants) deny();
      return { id };
    }
    if (action === 'task.create') {
      const b = bodyObject(input, ['eventId', 'handlerGrantId']);
      const eventId = uuid(b.eventId);
      await eventManager(tx, actor, eventId);
      if (hasRole(actor, 'ORGANIZER')) deny();
      const handler = await tx.eventGrant.findUnique({
        where: { id: uuid(b.handlerGrantId) },
        include: { member: { include: { user: true } } },
      });
      if (
        !handler ||
        !handler.active ||
        handler.eventId !== eventId ||
        handler.member.role !== 'ORGANIZER' ||
        !handler.member.active ||
        !handler.member.user.active
      )
        deny();
      return tx.taskScope.create({
        data: { eventId, handlerGrantId: handler.id },
        select: { id: true },
      });
    }
    if (action === 'task.reviewer.assign') {
      const b = bodyObject(input, ['reviewerGrantId']);
      const task = await tx.taskScope.findUnique({
        where: { id: id! },
        include: { handler: { include: { member: true } } },
      });
      if (!task) deny();
      await eventManager(tx, actor, task.eventId);
      if (hasRole(actor, 'ORGANIZER')) deny();
      if (await tx.materialTask.findUnique({ where: { id: id! } }))
        throw new ConflictException(
          'Use the business task assignment operation',
        );
      const reviewerGrantId =
        b.reviewerGrantId === null ? null : uuid(b.reviewerGrantId);
      if (reviewerGrantId) {
        const grant = await tx.eventGrant.findUnique({
          where: { id: reviewerGrantId },
          include: {
            member: { include: { user: { include: { memberships: true } } } },
          },
        });
        if (
          !grant ||
          !grant.active ||
          grant.eventId !== task.eventId ||
          grant.member.role !== 'REVIEWER' ||
          !grant.member.active ||
          !grant.member.user.active ||
          grant.member.userId === task.handler.member.userId ||
          grant.member.user.memberships.some(
            (m) =>
              m.active &&
              (m.organizationId === task.handler.member.organizationId ||
                m.role === 'ORGANIZER'),
          )
        )
          deny();
      }
      return tx.taskScope.update({
        where: { id: id! },
        data: { reviewerGrantId },
        select: { id: true },
      });
    }
    if (action === 'task.read' || action === 'task.access') {
      const b =
        action === 'task.access'
          ? bodyObject(input, ['action'])
          : { action: 'task.read' };
      if (!taskActions.includes(b.action as (typeof taskActions)[number]))
        throw new BadRequestException('Invalid action');
      await taskPolicy(tx, actor, id!, String(b.action));
      return { id };
    }
    deny();
  }
}
