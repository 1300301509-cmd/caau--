import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import { deny } from '../authorization/policy.js';
import { personalMemoryContent } from './memory-policy.js';

const view = (row: {
  id: string;
  content: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  content: row.content,
  revision: row.revision,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class AgentMemoryService {
  constructor(private readonly auth: AuthorizationService) {}

  list(token: string) {
    return this.auth.run(
      token,
      'agent.memory.list',
      undefined,
      {},
      async (tx, actor) =>
        (
          await tx.agentMemory.findMany({
            where: { ownerId: actor.id, status: 'ACTIVE' },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 30,
          })
        ).map(view),
    );
  }

  create(token: string, input: unknown) {
    const body = bodyObject(input, ['content']);
    const content = text(body.content, 300);
    if (!personalMemoryContent(content))
      throw new BadRequestException('Only personal preferences can be saved');
    if (/\b(?:sk-[a-z0-9_-]{12,}|Bearer\s+[a-z0-9._-]{12,})\b/i.test(content))
      throw new BadRequestException('Credentials cannot be saved as memory');
    return this.auth.run(
      token,
      'agent.memory.create',
      undefined,
      {},
      async (tx, actor) => {
        const existing = await tx.agentMemory.findFirst({
          where: { ownerId: actor.id, status: 'ACTIVE', content },
        });
        if (existing) return view(existing);
        const count = await tx.agentMemory.count({
          where: { ownerId: actor.id, status: 'ACTIVE' },
        });
        if (count >= 30)
          throw new ConflictException(
            'Memory limit reached; remove an old memory first',
          );
        return view(
          await tx.agentMemory.create({
            data: {
              id: randomUUID(),
              ownerId: actor.id,
              content,
              status: 'ACTIVE',
            },
          }),
        );
      },
      { retries: 5 },
    );
  }

  remove(token: string, memoryId: string) {
    const id = uuid(memoryId);
    return this.auth.run(
      token,
      'agent.memory.delete',
      id,
      {},
      async (tx, actor) => {
        const row = await tx.agentMemory.findFirst({
          where: { id, ownerId: actor.id },
        });
        if (!row) deny();
        if (row.status === 'ACTIVE') {
          const changed = await tx.agentMemory.updateMany({
            where: {
              id,
              ownerId: actor.id,
              status: 'ACTIVE',
              revision: row.revision,
            },
            data: {
              status: 'DELETED',
              content: '',
              revision: { increment: 1 },
              deletedAt: new Date(),
              updatedAt: new Date(),
            },
          });
          if (changed.count !== 1)
            throw new ConflictException('Memory changed; refresh and retry');
        }
        return { id, status: 'DELETED' as const };
      },
      { retries: 5 },
    );
  }
}
