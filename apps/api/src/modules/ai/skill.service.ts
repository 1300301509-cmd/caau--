import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import { deny, isHeadquartersSuperAdmin } from '../authorization/policy.js';
import { agentToolCatalog } from './tool-registry.js';

export const agentSkillKeys = [
  'INTENT_ROUTING',
  'TOOL_SELECTION',
  'SCHEDULE_PLANNING',
  'TEAM_TRAINING',
] as const;
export type AgentSkillKey = (typeof agentSkillKeys)[number];
export type RuntimeSkills = Partial<
  Record<AgentSkillKey, { id: string; version: number; instructions: string }>
>;

const skillKey = (value: unknown): AgentSkillKey => {
  if (
    typeof value !== 'string' ||
    !agentSkillKeys.includes(value as AgentSkillKey)
  )
    throw new BadRequestException('Unsupported agent skill');
  return value as AgentSkillKey;
};
const view = (row: {
  id: string;
  skillKey: string;
  version: number;
  instructions: string;
  state: string;
  createdAt: Date;
  activatedAt: Date | null;
}) => ({
  id: row.id,
  skillKey: row.skillKey as AgentSkillKey,
  version: row.version,
  instructions: row.instructions,
  state: row.state as 'DRAFT' | 'ACTIVE' | 'RETIRED',
  createdAt: row.createdAt.toISOString(),
  activatedAt: row.activatedAt?.toISOString() ?? null,
});

@Injectable()
export class AgentSkillService {
  constructor(private readonly auth: AuthorizationService) {}

  async list(token: string) {
    return this.auth.run(
      token,
      'agent.skill.list',
      undefined,
      {},
      async (tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        return (
          await tx.agentSkillVersion.findMany({
            orderBy: [{ skillKey: 'asc' }, { version: 'desc' }],
            take: 100,
          })
        ).map(view);
      },
    );
  }

  async tools(token: string) {
    return this.auth.run(
      token,
      'agent.tool.catalog',
      undefined,
      {},
      async (_tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        return agentToolCatalog();
      },
    );
  }

  async create(token: string, input: unknown) {
    const body = bodyObject(input, ['skillKey', 'instructions']);
    const key = skillKey(body.skillKey);
    const instructions = text(body.instructions, 8000).trim();
    if (!instructions)
      throw new BadRequestException('Skill instructions are required');
    return this.auth.run(
      token,
      'agent.skill.create',
      undefined,
      {},
      async (tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        const previous = await tx.agentSkillVersion.findFirst({
          where: { skillKey: key },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        return view(
          await tx.agentSkillVersion.create({
            data: {
              id: randomUUID(),
              skillKey: key,
              version: (previous?.version ?? 0) + 1,
              instructions,
              createdBy: actor.id,
            },
          }),
        );
      },
      { retries: 5, retryUnique: true },
    );
  }

  async activate(token: string, rawId: string) {
    const id = uuid(rawId);
    return this.auth.run(
      token,
      'agent.skill.activate',
      id,
      {},
      async (tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        const chosen = await tx.agentSkillVersion.findUnique({ where: { id } });
        if (!chosen) deny();
        if (chosen.state === 'ACTIVE') return view(chosen);
        if (chosen.state !== 'DRAFT')
          throw new ConflictException(
            'Create a new version to restore retired instructions',
          );
        await tx.agentSkillVersion.updateMany({
          where: { skillKey: chosen.skillKey, state: 'ACTIVE' },
          data: { state: 'RETIRED' },
        });
        return view(
          await tx.agentSkillVersion.update({
            where: { id },
            data: {
              state: 'ACTIVE',
              activatedBy: actor.id,
              activatedAt: new Date(),
            },
          }),
        );
      },
      { retries: 5 },
    );
  }

  // Invoked only from an already-authenticated assistant transaction. Skill
  // text enters the model context but never controls tool permissions.
  async activeInTransaction(
    tx: Prisma.TransactionClient,
  ): Promise<RuntimeSkills> {
    const rows = await tx.agentSkillVersion.findMany({
      where: { skillKey: { in: [...agentSkillKeys] }, state: 'ACTIVE' },
    });
    return Object.fromEntries(
      rows.map((row) => [
        row.skillKey,
        {
          id: row.id,
          version: row.version,
          instructions: row.instructions,
        },
      ]),
    ) as RuntimeSkills;
  }
}
