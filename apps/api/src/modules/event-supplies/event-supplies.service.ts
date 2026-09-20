import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import { type Actor, deny, eventOperations } from '../authorization/policy.js';
import { PrivateStore, verifyFile } from '../workflow/private-store.js';
import {
  eventSupplyStatuses,
  type EventSupplyItemViewDto,
} from './event-supplies.dto.js';

type Tx = Prisma.TransactionClient;
const itemInclude = {
  photos: {
    where: { state: { not: 'REMOVED' as const } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.EventSupplyItemInclude;
type Item = Prisma.EventSupplyItemGetPayload<{ include: typeof itemInclude }>;

function positiveInteger(value: unknown, maximum: number, label: string) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > maximum
  )
    throw new BadRequestException(`Invalid ${label}`);
  return Number(value);
}

function photoView(photo: Item['photos'][number]) {
  return {
    id: photo.id,
    originalName: photo.originalName,
    extension: photo.extension,
    expectedBytes: photo.expectedBytes,
    state: photo.state,
    confirmedAt: photo.confirmedAt?.toISOString() ?? null,
  };
}

function itemView(item: Item): EventSupplyItemViewDto {
  return {
    id: item.id,
    eventId: item.eventId,
    name: item.name,
    quantity: item.quantity,
    notes: item.notes,
    status: item.status,
    revision: item.revision,
    photos: item.photos.map(photoView),
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

@Injectable()
export class EventSuppliesService {
  constructor(
    private readonly auth: AuthorizationService,
    private readonly store: PrivateStore,
  ) {}

  private async readAccess(tx: Tx, actor: Actor, eventId: string) {
    uuid(eventId);
    if (!(await tx.event.findUnique({ where: { id: eventId } }))) deny();
    await eventOperations(tx, actor, eventId);
  }

  private async writeAccess(tx: Tx, actor: Actor, eventId: string) {
    await this.readAccess(tx, actor, eventId);
    const organizationIds = actor.memberships
      .filter((member) => member.active && member.role === 'ORGANIZER')
      .map((member) => member.organizationId);
    if (!organizationIds.length) deny();
    const handlerOrganizations =
      await tx.hostingApplicationHandlerGrant.findMany({
        where: {
          active: true,
          organizationId: { in: organizationIds },
          member: { userId: actor.id, active: true, role: 'ORGANIZER' },
        },
        select: { organizationId: true },
      });
    if (
      !(await tx.eventOrganizerAppointment.findFirst({
        where: {
          eventId,
          active: true,
          organizationId: {
            in: handlerOrganizations.map((grant) => grant.organizationId),
          },
        },
      }))
    )
      deny();
  }

  private async item(tx: Tx, eventId: string, id: string) {
    const item = await tx.eventSupplyItem.findFirst({
      where: { id: uuid(id), eventId: uuid(eventId) },
      include: itemInclude,
    });
    if (!item) deny();
    return item;
  }

  private snapshot(item: Item): Prisma.InputJsonValue {
    return {
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      status: item.status,
      photos: item.photos
        .filter((photo) => photo.state === 'CONFIRMED')
        .map((photo) => ({
          id: photo.id,
          originalName: photo.originalName,
          extension: photo.extension,
          expectedBytes: photo.expectedBytes,
          sha256: photo.sha256,
        })),
    };
  }

  private async record(tx: Tx, item: Item, actorId: string, action: string) {
    await tx.eventSupplyHistory.create({
      data: {
        id: randomUUID(),
        itemId: item.id,
        revision: item.revision,
        action,
        snapshot: this.snapshot(item),
        actorId,
      },
    });
  }

  list(token: string, eventId: string) {
    return this.auth.run(
      token,
      'eventSupplies.list',
      eventId,
      {},
      async (tx, actor) => {
        await this.readAccess(tx, actor, eventId);
        return (
          await tx.eventSupplyItem.findMany({
            where: { eventId },
            include: itemInclude,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          })
        ).map(itemView);
      },
    );
  }

  create(token: string, eventId: string, input: unknown) {
    return this.auth.run(
      token,
      'eventSupplies.create',
      eventId,
      input,
      async (tx, actor) => {
        await this.writeAccess(tx, actor, eventId);
        const body = bodyObject(input, ['id', 'name', 'quantity', 'notes']);
        const id = uuid(body.id);
        const data = {
          name: text(body.name, 120),
          quantity: positiveInteger(body.quantity, 1_000_000, 'quantity'),
          notes:
            body.notes === undefined || body.notes === ''
              ? ''
              : text(body.notes, 2000),
        };
        const previous = await tx.eventSupplyItem.findUnique({
          where: { id },
          include: itemInclude,
        });
        if (previous) {
          if (
            previous.eventId !== eventId ||
            previous.createdBy !== actor.id ||
            previous.name !== data.name ||
            previous.quantity !== data.quantity ||
            previous.notes !== data.notes
          )
            throw new ConflictException('Creation conflict');
          return itemView(previous);
        }
        const item = await tx.eventSupplyItem.create({
          data: {
            id,
            eventId,
            ...data,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
          include: itemInclude,
        });
        await this.record(tx, item, actor.id, 'CREATED');
        return itemView(item);
      },
      { retries: 2, retryUnique: true },
    );
  }

  update(token: string, eventId: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'eventSupplies.update',
      id,
      input,
      async (tx, actor) => {
        await this.writeAccess(tx, actor, eventId);
        await this.item(tx, eventId, id);
        const body = bodyObject(input, [
          'expectedRevision',
          'name',
          'quantity',
          'notes',
          'status',
        ]);
        const expectedRevision = positiveInteger(
          body.expectedRevision,
          2_147_483_647,
          'revision',
        );
        if (!eventSupplyStatuses.includes(body.status as never))
          throw new BadRequestException('Invalid status');
        const changed = await tx.eventSupplyItem.updateMany({
          where: { id, eventId, revision: expectedRevision },
          data: {
            name: text(body.name, 120),
            quantity: positiveInteger(body.quantity, 1_000_000, 'quantity'),
            notes: body.notes === '' ? '' : text(body.notes, 2000),
            status: body.status as (typeof eventSupplyStatuses)[number],
            revision: { increment: 1 },
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('物料信息已更新，请刷新后重试');
        const item = await this.item(tx, eventId, id);
        await this.record(tx, item, actor.id, 'UPDATED');
        return itemView(item);
      },
    );
  }

  history(token: string, eventId: string, id: string) {
    return this.auth.run(
      token,
      'eventSupplies.history',
      id,
      {},
      async (tx, actor) => {
        await this.readAccess(tx, actor, eventId);
        await this.item(tx, eventId, id);
        return (
          await tx.eventSupplyHistory.findMany({
            where: { itemId: id },
            orderBy: { revision: 'asc' },
          })
        ).map((row) => ({
          id: row.id,
          revision: row.revision,
          action: row.action,
          snapshot: row.snapshot,
          actorId: row.actorId,
          occurredAt: row.occurredAt.toISOString(),
        }));
      },
    );
  }

  createPhoto(token: string, eventId: string, itemId: string, input: unknown) {
    return this.auth.run(
      token,
      'eventSupplies.photo.create',
      itemId,
      input,
      async (tx, actor) => {
        await this.writeAccess(tx, actor, eventId);
        await this.item(tx, eventId, itemId);
        const body = bodyObject(input, [
          'id',
          'originalName',
          'extension',
          'expectedBytes',
          'sha256',
        ]);
        const id = uuid(body.id);
        const extension = text(body.extension, 8).toLowerCase();
        if (!['png', 'jpg', 'jpeg'].includes(extension))
          throw new BadRequestException(
            'Only png, jpg and jpeg photos are supported',
          );
        const sha256 = text(body.sha256, 64);
        if (!/^[a-f0-9]{64}$/.test(sha256))
          throw new BadRequestException('Invalid sha256');
        const originalName = text(body.originalName, 180);
        const expectedBytes = positiveInteger(
          body.expectedBytes,
          10 * 1024 * 1024,
          'file size',
        );
        const previous = await tx.eventSupplyPhoto.findUnique({
          where: { id },
        });
        if (previous) {
          if (
            previous.itemId !== itemId ||
            previous.createdBy !== actor.id ||
            previous.originalName !== originalName ||
            previous.extension !== extension ||
            previous.expectedBytes !== expectedBytes ||
            previous.sha256 !== sha256
          )
            throw new ConflictException('Creation conflict');
          return photoView(previous);
        }
        if (
          (await tx.eventSupplyPhoto.count({
            where: { itemId, state: { not: 'REMOVED' } },
          })) >= 20
        )
          throw new ConflictException('每项物料最多保留20张照片');
        const photo = await tx.eventSupplyPhoto.create({
          data: {
            id,
            itemId,
            originalName,
            extension,
            expectedBytes,
            sha256,
            objectKey: randomUUID(),
            createdBy: actor.id,
          },
        });
        return photoView(photo);
      },
    );
  }

  async uploadContent(token: string, id: string, request: IncomingMessage) {
    const photo = await this.auth.run(
      token,
      'eventSupplies.photo.upload',
      id,
      {},
      async (tx, actor) => {
        const row = await tx.eventSupplyPhoto.findUnique({
          where: { id: uuid(id) },
          include: { item: true },
        });
        if (!row) deny();
        await this.writeAccess(tx, actor, row.item.eventId);
        if (row.state !== 'PENDING')
          throw new ConflictException('Photo is no longer pending');
        return row;
      },
    );
    await this.store.put(photo.objectKey, request, photo.expectedBytes);
    return { id: photo.id };
  }

  mutatePhoto(
    token: string,
    id: string,
    action: 'confirm' | 'remove',
    input: unknown,
  ) {
    return this.auth.run(
      token,
      `eventSupplies.photo.${action}`,
      id,
      input,
      async (tx, actor) => {
        const body = bodyObject(input, ['expectedRevision']);
        const expectedRevision = positiveInteger(
          body.expectedRevision,
          2_147_483_647,
          'revision',
        );
        const photo = await tx.eventSupplyPhoto.findUnique({
          where: { id: uuid(id) },
          include: { item: true },
        });
        if (!photo) deny();
        await this.writeAccess(tx, actor, photo.item.eventId);
        const target = action === 'confirm' ? 'CONFIRMED' : 'REMOVED';
        if (photo.state === target) return photoView(photo);
        if (
          (action === 'confirm' && photo.state !== 'PENDING') ||
          (action === 'remove' && photo.state !== 'CONFIRMED')
        )
          throw new ConflictException('Invalid photo state');
        if (action === 'confirm') {
          const bytes = await this.store.read(photo.objectKey).catch(() => {
            throw new ConflictException('Upload content before confirming');
          });
          verifyFile(bytes, photo.extension, photo.expectedBytes, photo.sha256);
        }
        const bumped = await tx.eventSupplyItem.updateMany({
          where: { id: photo.itemId, revision: expectedRevision },
          data: {
            revision: { increment: 1 },
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
        if (bumped.count !== 1)
          throw new ConflictException('物料信息已更新，请刷新后重试');
        const changed = await tx.eventSupplyPhoto.update({
          where: { id: photo.id },
          data:
            action === 'confirm'
              ? { state: 'CONFIRMED', confirmedAt: new Date() }
              : { state: 'REMOVED', removedAt: new Date() },
        });
        const item = await this.item(tx, photo.item.eventId, photo.itemId);
        await this.record(
          tx,
          item,
          actor.id,
          action === 'confirm' ? 'PHOTO_ADDED' : 'PHOTO_REMOVED',
        );
        return photoView(changed);
      },
    );
  }

  download(token: string, id: string) {
    return this.auth.run(
      token,
      'eventSupplies.photo.download',
      id,
      {},
      async (tx, actor) => {
        const photo = await tx.eventSupplyPhoto.findUnique({
          where: { id: uuid(id), state: 'CONFIRMED' },
          include: { item: true },
        });
        if (!photo) deny();
        await this.readAccess(tx, actor, photo.item.eventId);
        return {
          info: photo,
          data: await this.store.read(photo.objectKey),
        };
      },
    );
  }
}
