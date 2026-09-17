import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import {
  deny,
  isHeadquartersSuperAdmin,
  type Actor,
} from '../authorization/policy.js';
import { PrivateStore, digest, verifyFile } from '../workflow/private-store.js';
import { safeFilename } from '../workflow/filename.js';
import { hostingRequirementCodes } from './hosting.dto.js';

type Tx = Prisma.TransactionClient;
type Status =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'IN_REVIEW'
  | 'NEEDS_SUPPLEMENT'
  | 'REJECTED'
  | 'APPROVED';
type Requirement = 'BUSINESS_LICENSE' | 'VENUE_PHOTO' | 'OTHER_DOCUMENT';
type DraftForm = {
  eventName: string | null;
  startDate: string | null;
  endDate: string | null;
  location: {
    administrativeArea: {
      province: string | null;
      city: string | null;
      district: string | null;
    };
    detailedAddress: string | null;
    venueName: string | null;
  } | null;
  eventExperienceIntroduction: string | null;
};

const mainlandProvinces = new Set([
  '北京市',
  '天津市',
  '河北省',
  '山西省',
  '内蒙古自治区',
  '辽宁省',
  '吉林省',
  '黑龙江省',
  '上海市',
  '江苏省',
  '浙江省',
  '安徽省',
  '福建省',
  '江西省',
  '山东省',
  '河南省',
  '湖北省',
  '湖南省',
  '广东省',
  '广西壮族自治区',
  '海南省',
  '重庆市',
  '四川省',
  '贵州省',
  '云南省',
  '西藏自治区',
  '陕西省',
  '甘肃省',
  '青海省',
  '宁夏回族自治区',
  '新疆维吾尔自治区',
]);
const emptyDraft = (): DraftForm => ({
  eventName: null,
  startDate: null,
  endDate: null,
  location: null,
  eventExperienceIntroduction: null,
});
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, canonical(child)]),
        )
      : value;
const requestHash = (value: unknown) =>
  digest(JSON.stringify(canonical(value)));
const positive = (value: unknown, label = 'revision') => {
  if (!Number.isInteger(value) || Number(value) < 1)
    throw new BadRequestException(`Invalid ${label}`);
  return Number(value);
};
const optionalText = (value: unknown, max: number) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max)
    throw new BadRequestException('Invalid form field');
  return value.trim() || null;
};
const dateValue = (value: unknown) => {
  const normalized = optionalText(value, 10);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized))
    throw new BadRequestException('Date must use YYYY-MM-DD');
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  )
    throw new BadRequestException('Invalid calendar date');
  return normalized;
};
function formValue(input: unknown): DraftForm {
  const form = bodyObject(input, [
    'eventName',
    'startDate',
    'endDate',
    'location',
    'eventExperienceIntroduction',
  ]);
  let location: DraftForm['location'] = null;
  if (form.location !== undefined && form.location !== null) {
    const value = bodyObject(form.location, [
      'administrativeArea',
      'detailedAddress',
      'venueName',
    ]);
    const area = bodyObject(value.administrativeArea, [
      'province',
      'city',
      'district',
    ]);
    location = {
      administrativeArea: {
        province: optionalText(area.province, 40),
        city: optionalText(area.city, 60),
        district: optionalText(area.district, 60),
      },
      detailedAddress: optionalText(value.detailedAddress, 240),
      venueName: optionalText(value.venueName, 120),
    };
  }
  const result: DraftForm = {
    eventName: optionalText(form.eventName, 120),
    startDate: dateValue(form.startDate),
    endDate: dateValue(form.endDate),
    location,
    eventExperienceIntroduction: optionalText(
      form.eventExperienceIntroduction,
      20000,
    ),
  };
  if (result.startDate && result.endDate && result.endDate < result.startDate)
    throw new BadRequestException('End date cannot be before start date');
  return result;
}
function completeForm(value: unknown): DraftForm {
  const form = formValue(value);
  const area = form.location?.administrativeArea;
  if (
    !form.eventName ||
    !form.startDate ||
    !form.endDate ||
    !area?.province ||
    !area.city ||
    !form.location?.detailedAddress ||
    !form.location.venueName ||
    !form.eventExperienceIntroduction
  )
    throw new BadRequestException('Required application fields are missing');
  if (!mainlandProvinces.has(area.province))
    throw new BadRequestException(
      'Only mainland China administrative areas are supported',
    );
  return form;
}
async function databaseNow(tx: Tx) {
  return (
    await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  )[0]!.now;
}
function uploadView(file: {
  id: string;
  requirementCode: string;
  originalName: string;
  extension: string;
  expectedBytes: number;
  state: string;
  bound: boolean;
  expiresAt: Date;
}) {
  return {
    id: file.id,
    requirementCode: file.requirementCode,
    originalName: file.originalName,
    extension: file.extension,
    expectedBytes: file.expectedBytes,
    state: file.state,
    bound: file.bound,
    expiresAt: file.expiresAt.toISOString(),
  };
}
function same(left: unknown, right: unknown) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function valueAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const segment of path)
    current =
      current && typeof current === 'object'
        ? (current as Record<string, unknown>)[segment]
        : null;
  return current ?? null;
}
const fieldPaths = [
  ['eventName'],
  ['startDate'],
  ['endDate'],
  ['location', 'administrativeArea', 'province'],
  ['location', 'administrativeArea', 'city'],
  ['location', 'administrativeArea', 'district'],
  ['location', 'detailedAddress'],
  ['location', 'venueName'],
  ['eventExperienceIntroduction'],
];

const applicationInclude = {
  applicantOrganization: true,
  uploads: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  submissions: {
    include: { attachments: { include: { file: true } } },
    orderBy: { version: 'asc' as const },
  },
  actions: { orderBy: { revision: 'asc' as const } },
} satisfies Prisma.EventHostingApplicationInclude;
type LoadedApplication = Prisma.EventHostingApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

@Injectable()
export class HostingService {
  constructor(
    private readonly auth: AuthorizationService,
    private readonly store: PrivateStore,
  ) {}

  private super(actor: Actor) {
    return isHeadquartersSuperAdmin(actor);
  }
  private async handler(tx: Tx, actor: Actor, organizationId: string) {
    const grant = await tx.hostingApplicationHandlerGrant.findFirst({
      where: {
        organizationId,
        active: true,
        member: {
          userId: actor.id,
          active: true,
          role: 'ORGANIZER',
          user: { active: true },
        },
      },
      include: { member: true },
    });
    if (!grant) deny();
    return grant;
  }
  private async reviewer(tx: Tx, actor: Actor) {
    if (this.super(actor)) return;
    const grant = await tx.hostingApplicationReviewGrant.findFirst({
      where: {
        active: true,
        member: {
          userId: actor.id,
          active: true,
          role: 'REVIEWER',
          user: { active: true },
        },
      },
    });
    if (!grant) deny();
  }
  private async canRead(tx: Tx, actor: Actor, application: LoadedApplication) {
    if (this.super(actor)) return 'super' as const;
    const review = await tx.hostingApplicationReviewGrant.count({
      where: {
        active: true,
        member: {
          userId: actor.id,
          active: true,
          role: 'REVIEWER',
          user: { active: true },
        },
      },
    });
    if (review) return 'reviewer' as const;
    await this.handler(tx, actor, application.applicantOrganizationId);
    return 'handler' as const;
  }
  private async load(tx: Tx, id: string) {
    const application = await tx.eventHostingApplication.findUnique({
      where: { id },
      include: applicationInclude,
    });
    if (!application) deny();
    return application;
  }
  private diff(
    previous: LoadedApplication['submissions'][number],
    current: LoadedApplication['submissions'][number],
  ) {
    const fieldChanges = fieldPaths.map((path) => {
      const before = valueAt(previous.form, path);
      const after = valueAt(current.form, path);
      return {
        field: path.join('.'),
        status: same(before, after) ? 'UNCHANGED' : 'CHANGED',
        before,
        after,
      };
    });
    const attachmentChanges = hostingRequirementCodes.flatMap((code) => {
      const before = previous.attachments
        .filter((item) => item.requirementCode === code)
        .map((item) => item.file);
      const after = current.attachments
        .filter((item) => item.requirementCode === code)
        .map((item) => item.file);
      const oldByHash = new Map(before.map((file) => [file.sha256, file]));
      const newByHash = new Map(after.map((file) => [file.sha256, file]));
      const safe = (file: (typeof before)[number]) => ({
        id: file.id,
        originalName: file.originalName,
        extension: file.extension,
        expectedBytes: file.expectedBytes,
        sha256: file.sha256,
      });
      const removed = before.filter((file) => !newByHash.has(file.sha256));
      const added = after.filter((file) => !oldByHash.has(file.sha256));
      if (!removed.length && !added.length)
        return [{ requirementCode: code, action: 'UNCHANGED' }];
      if (removed.length && added.length)
        return [
          {
            requirementCode: code,
            action: 'REPLACED',
            removed: removed.map(safe),
            added: added.map(safe),
          },
        ];
      return [
        {
          requirementCode: code,
          action: removed.length ? 'REMOVED' : 'ADDED',
          files: (removed.length ? removed : added).map(safe),
        },
      ];
    });
    return {
      fromSubmissionId: previous.id,
      toSubmissionId: current.id,
      fieldChanges,
      attachmentChanges,
    };
  }
  private view(
    application: LoadedApplication,
    scope: 'handler' | 'reviewer' | 'super',
  ) {
    const submissions = application.submissions.map((submission) => ({
      id: submission.id,
      version: submission.version,
      form: submission.form,
      submittedBy: submission.submittedBy,
      submittedAt: submission.submittedAt.toISOString(),
      attachments: submission.attachments.map((item) => uploadView(item.file)),
    }));
    return {
      id: application.id,
      applicantOrganizationId: application.applicantOrganizationId,
      applicantOrganizationName: application.applicantOrganization.name,
      status: application.status,
      revision: application.revision,
      draftRevision: application.draftRevision,
      currentSubmissionId: application.currentSubmissionId,
      approvedEventId: application.approvedEventId,
      createdAt: application.createdAt.toISOString(),
      draft: scope === 'reviewer' ? null : application.draft,
      uploads:
        scope === 'handler'
          ? application.uploads.map(uploadView)
          : application.uploads
              .filter((upload) =>
                application.submissions.some((submission) =>
                  submission.attachments.some(
                    (attachment) => attachment.fileId === upload.id,
                  ),
                ),
              )
              .map(uploadView),
      submissions,
      actions: application.actions.map((action) => ({
        id: action.id,
        action: action.action,
        fromState: action.fromState,
        toState: action.toState,
        actorId: action.actorId,
        occurredAt: action.occurredAt.toISOString(),
        detail: action.detail,
      })),
      diffs: application.submissions
        .slice(1)
        .map((submission, index) =>
          this.diff(application.submissions[index]!, submission),
        ),
    };
  }
  private listView(application: {
    id: string;
    applicantOrganizationId: string;
    status: Status;
    revision: number;
    draftRevision: number;
    currentSubmissionId: string | null;
    approvedEventId: string | null;
    createdAt: Date;
    applicantOrganization: { name: string };
  }) {
    return {
      ...application,
      applicantOrganizationName: application.applicantOrganization.name,
      createdAt: application.createdAt.toISOString(),
      applicantOrganization: undefined,
    };
  }
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "EventHostingApplication" WHERE id=${id}::uuid FOR UPDATE`;
  }
  private async selfReviewDenied(tx: Tx, actor: Actor, applicationId: string) {
    if (
      await tx.hostingApplicationSubmission.count({
        where: { applicationId, submittedBy: actor.id },
      })
    )
      throw new ForbiddenException('Submitters cannot review this application');
  }
  private async command(
    tx: Tx,
    applicationId: string,
    actorId: string,
    key: string,
    hash: string,
  ) {
    const existing = await tx.hostingApplicationCommand.findUnique({
      where: { actorId_key: { actorId, key } },
    });
    if (!existing) return null;
    if (
      existing.applicationId !== applicationId ||
      existing.requestHash !== hash
    )
      throw new ConflictException('Idempotency key used with different input');
    return existing.result as Record<string, unknown>;
  }
  private async saveCommand(
    tx: Tx,
    applicationId: string,
    actorId: string,
    key: string,
    hash: string,
    result: object,
  ) {
    await tx.hostingApplicationCommand.create({
      data: {
        applicationId,
        actorId,
        key,
        requestHash: hash,
        result: json(result),
      },
    });
  }
  private async syncHandlerAccess(
    tx: Tx,
    grant: { id: string; memberId: string; organizationId: string },
    active: boolean,
  ) {
    if (!active) {
      await tx.eventInformationAccessGrant.updateMany({
        where: { sourceHandlerGrantId: grant.id, active: true },
        data: { active: false, revokedAt: await databaseNow(tx) },
      });
      return;
    }
    const appointments = await tx.eventOrganizerAppointment.findMany({
      where: { organizationId: grant.organizationId, active: true },
    });
    for (const appointment of appointments)
      await tx.eventInformationAccessGrant.upsert({
        where: {
          eventId_memberId_sourceHandlerGrantId: {
            eventId: appointment.eventId,
            memberId: grant.memberId,
            sourceHandlerGrantId: grant.id,
          },
        },
        create: {
          eventId: appointment.eventId,
          memberId: grant.memberId,
          sourceHandlerGrantId: grant.id,
          sourceApplicationId: appointment.sourceApplicationId,
          sourceSubmissionId: appointment.sourceSubmissionId,
        },
        update: { active: true, revokedAt: null },
      });
  }
  manageGrant(
    token: string,
    type: 'handler' | 'review',
    id: string | undefined,
    input: unknown,
  ) {
    return this.auth.run(
      token,
      `hosting.${type}-grant.${id ? 'active' : 'create'}`,
      id,
      input,
      async (tx, actor, resourceId) => {
        if (!this.super(actor)) deny();
        if (!resourceId) {
          const body = bodyObject(input, ['memberId']);
          const member = await tx.organizationMember.findUnique({
            where: { id: uuid(body.memberId) },
            include: { user: true },
          });
          if (
            !member?.active ||
            !member.user.active ||
            member.role !== (type === 'handler' ? 'ORGANIZER' : 'REVIEWER')
          )
            deny();
          if (type === 'handler') {
            const grant = await tx.hostingApplicationHandlerGrant.upsert({
              where: { memberId: member.id },
              create: {
                memberId: member.id,
                organizationId: member.organizationId,
                grantedBy: actor.id,
              },
              update: {
                active: true,
                grantedBy: actor.id,
                grantedAt: await databaseNow(tx),
                revokedBy: null,
                revokedAt: null,
              },
            });
            await this.syncHandlerAccess(tx, grant, true);
            return {
              id: grant.id,
              memberId: grant.memberId,
              organizationId: grant.organizationId,
              active: grant.active,
            };
          }
          const grant = await tx.hostingApplicationReviewGrant.upsert({
            where: { memberId: member.id },
            create: { memberId: member.id, grantedBy: actor.id },
            update: {
              active: true,
              grantedBy: actor.id,
              grantedAt: await databaseNow(tx),
              revokedBy: null,
              revokedAt: null,
            },
          });
          return {
            id: grant.id,
            memberId: grant.memberId,
            organizationId: null,
            active: grant.active,
          };
        }
        const body = bodyObject(input, ['active']);
        if (typeof body.active !== 'boolean')
          throw new BadRequestException('Boolean required');
        const time = await databaseNow(tx);
        if (type === 'handler') {
          const grant = await tx.hostingApplicationHandlerGrant.update({
            where: { id: resourceId },
            data: {
              active: body.active,
              ...(body.active
                ? {
                    grantedBy: actor.id,
                    grantedAt: time,
                    revokedBy: null,
                    revokedAt: null,
                  }
                : { revokedBy: actor.id, revokedAt: time }),
            },
          });
          await this.syncHandlerAccess(tx, grant, body.active);
          return {
            id: grant.id,
            memberId: grant.memberId,
            organizationId: grant.organizationId,
            active: grant.active,
          };
        }
        const grant = await tx.hostingApplicationReviewGrant.update({
          where: { id: resourceId },
          data: {
            active: body.active,
            ...(body.active
              ? {
                  grantedBy: actor.id,
                  grantedAt: time,
                  revokedBy: null,
                  revokedAt: null,
                }
              : { revokedBy: actor.id, revokedAt: time }),
          },
        });
        return {
          id: grant.id,
          memberId: grant.memberId,
          organizationId: null,
          active: grant.active,
        };
      },
      { retries: 3, retryUnique: true },
    );
  }
  create(token: string, input: unknown) {
    return this.auth.run(
      token,
      'hosting.application.create',
      undefined,
      input,
      async (tx, actor) => {
        const body = bodyObject(input, ['applicantOrganizationId', 'key']);
        const organizationId = uuid(body.applicantOrganizationId);
        const key = uuid(body.key);
        await this.handler(tx, actor, organizationId);
        const hash = requestHash({ organizationId });
        const prior = await tx.hostingApplicationCommand.findFirst({
          where: { actorId: actor.id, key },
        });
        if (prior) {
          if (prior.requestHash !== hash)
            throw new ConflictException(
              'Idempotency key used with different input',
            );
          return prior.result;
        }
        const application = await tx.eventHostingApplication.create({
          data: {
            applicantOrganizationId: organizationId,
            createdBy: actor.id,
            draft: json(emptyDraft()),
          },
          include: { applicantOrganization: true },
        });
        await tx.hostingApplicationAction.create({
          data: {
            applicationId: application.id,
            revision: 1,
            action: 'CREATE',
            fromState: 'DRAFT',
            toState: 'DRAFT',
            actorId: actor.id,
          },
        });
        const result = this.listView(application);
        await this.saveCommand(tx, application.id, actor.id, key, hash, result);
        return result;
      },
      { retries: 3, retryUnique: true },
    );
  }
  list(token: string) {
    return this.auth.run(
      token,
      'hosting.application.list',
      undefined,
      undefined,
      async (tx, actor) => {
        let where: Prisma.EventHostingApplicationWhereInput = {};
        if (!this.super(actor)) {
          const reviewer = await tx.hostingApplicationReviewGrant.count({
            where: {
              active: true,
              member: {
                userId: actor.id,
                active: true,
                user: { active: true },
              },
            },
          });
          if (!reviewer) {
            const organizations =
              await tx.hostingApplicationHandlerGrant.findMany({
                where: {
                  active: true,
                  member: {
                    userId: actor.id,
                    active: true,
                    user: { active: true },
                  },
                },
                select: { organizationId: true },
              });
            if (!organizations.length) deny();
            where = {
              applicantOrganizationId: {
                in: organizations.map((item) => item.organizationId),
              },
            };
          }
        }
        return (
          await tx.eventHostingApplication.findMany({
            where,
            include: { applicantOrganization: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          })
        ).map((application) => this.listView(application));
      },
    );
  }
  detail(token: string, id: string) {
    return this.auth.run(
      token,
      'hosting.application.read',
      id,
      undefined,
      async (tx, actor, applicationId) => {
        const application = await this.load(tx, applicationId!);
        return this.view(
          application,
          await this.canRead(tx, actor, application),
        );
      },
    );
  }
  save(token: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'hosting.application.save',
      id,
      input,
      async (tx, actor, applicationId) => {
        const body = bodyObject(input, ['expectedDraftRevision', 'form']);
        const expected = positive(body.expectedDraftRevision, 'draft revision');
        const form = formValue(body.form);
        await this.lock(tx, applicationId!);
        actor = await this.auth.reloadActor(tx, token);
        let application = await this.load(tx, applicationId!);
        await this.handler(tx, actor, application.applicantOrganizationId);
        if (
          !['DRAFT', 'NEEDS_SUPPLEMENT'].includes(application.status) ||
          application.draftRevision !== expected
        )
          throw new ConflictException('Draft changed or is not editable');
        const revision = application.revision + 1;
        await tx.eventHostingApplication.update({
          where: { id: application.id },
          data: {
            draft: json(form),
            revision,
            draftRevision: { increment: 1 },
          },
        });
        await tx.hostingApplicationAction.create({
          data: {
            applicationId: application.id,
            revision,
            action: 'SAVE',
            fromState: application.status,
            toState: application.status,
            actorId: actor.id,
            detail: json({ draftRevision: expected + 1 }),
          },
        });
        application = await this.load(tx, application.id);
        return this.view(application, 'handler');
      },
      { retries: 3 },
    );
  }
  createUpload(token: string, applicationId: string, input: unknown) {
    return this.auth.run(
      token,
      'hosting.upload.create',
      applicationId,
      input,
      async (tx, actor, id) => {
        const body = bodyObject(input, [
          'requirementCode',
          'originalName',
          'extension',
          'expectedBytes',
          'sha256',
        ]);
        const application = await this.load(tx, id!);
        await this.handler(tx, actor, application.applicantOrganizationId);
        if (!['DRAFT', 'NEEDS_SUPPLEMENT'].includes(application.status))
          throw new ConflictException('Application is not editable');
        if (
          typeof body.requirementCode !== 'string' ||
          !hostingRequirementCodes.includes(body.requirementCode as Requirement)
        )
          throw new BadRequestException('Invalid requirement code');
        const requirementCode = body.requirementCode as Requirement;
        const extension =
          typeof body.extension === 'string'
            ? body.extension.toLowerCase()
            : '';
        const allowed =
          requirementCode === 'VENUE_PHOTO'
            ? ['png', 'jpg', 'jpeg']
            : ['pdf', 'png', 'jpg', 'jpeg'];
        if (
          !allowed.includes(extension) ||
          !Number.isInteger(body.expectedBytes) ||
          Number(body.expectedBytes) < 1 ||
          Number(body.expectedBytes) > 10 * 1024 * 1024 ||
          typeof body.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(body.sha256)
        )
          throw new BadRequestException('Invalid hosting upload metadata');
        const time = await databaseNow(tx);
        return uploadView(
          await tx.hostingApplicationUpload.create({
            data: {
              applicationId: application.id,
              organizationId: application.applicantOrganizationId,
              requirementCode,
              actorId: actor.id,
              storageKey: randomUUID(),
              originalName: safeFilename(body.originalName, extension)!,
              extension,
              expectedBytes: Number(body.expectedBytes),
              sha256: body.sha256,
              expiresAt: new Date(time.getTime() + 30 * 60000),
            },
          }),
        );
      },
    );
  }
  uploadContent(token: string, uploadId: string, stream: IncomingMessage) {
    return this.auth.run(
      token,
      'hosting.upload.content',
      uploadId,
      undefined,
      async (tx, actor, id) => {
        const upload = await tx.hostingApplicationUpload.findUnique({
          where: { id: id! },
          include: { application: true },
        });
        if (!upload) deny();
        await this.handler(tx, actor, upload.organizationId);
        if (
          !['DRAFT', 'NEEDS_SUPPLEMENT'].includes(upload.application.status) ||
          upload.state !== 'PENDING' ||
          upload.expiresAt <= (await databaseNow(tx)) ||
          stream.headers['content-type']?.split(';')[0] !==
            'application/octet-stream'
        )
          throw new ConflictException('Upload is unavailable');
        await this.store.put(upload.storageKey, stream, upload.expectedBytes);
        return { id: upload.id };
      },
    );
  }
  mutateUpload(
    token: string,
    uploadId: string,
    operation: 'confirm' | 'remove',
    input: unknown,
  ) {
    return this.auth.run(
      token,
      `hosting.upload.${operation}`,
      uploadId,
      input,
      async (tx, actor, id) => {
        const body = bodyObject(input, ['expectedDraftRevision']);
        const expected = positive(body.expectedDraftRevision, 'draft revision');
        const initial = await tx.hostingApplicationUpload.findUnique({
          where: { id: id! },
        });
        if (!initial) deny();
        await this.lock(tx, initial.applicationId);
        actor = await this.auth.reloadActor(tx, token);
        const application = await this.load(tx, initial.applicationId);
        await this.handler(tx, actor, application.applicantOrganizationId);
        const upload = application.uploads.find((item) => item.id === id)!;
        if (
          !['DRAFT', 'NEEDS_SUPPLEMENT'].includes(application.status) ||
          application.draftRevision !== expected
        )
          throw new ConflictException('Draft changed or is not editable');
        const time = await databaseNow(tx);
        if (operation === 'confirm') {
          if (upload.state !== 'PENDING' || upload.expiresAt <= time)
            throw new ConflictException('Upload expired or already confirmed');
          let bytes: Buffer;
          try {
            bytes = await this.store.read(upload.storageKey);
          } catch {
            throw new ConflictException('Upload content is missing');
          }
          verifyFile(
            bytes,
            upload.extension,
            upload.expectedBytes,
            upload.sha256,
          );
          await tx.hostingApplicationUpload.update({
            where: { id: upload.id },
            data: { state: 'CONFIRMED', confirmedAt: time, bound: true },
          });
        } else {
          if (upload.state !== 'CONFIRMED' || !upload.bound)
            throw new ConflictException('Attachment is not bound');
          await tx.hostingApplicationUpload.update({
            where: { id: upload.id },
            data: { bound: false },
          });
        }
        const revision = application.revision + 1;
        await tx.eventHostingApplication.update({
          where: { id: application.id },
          data: { revision, draftRevision: { increment: 1 } },
        });
        await tx.hostingApplicationAction.create({
          data: {
            applicationId: application.id,
            revision,
            action: operation === 'confirm' ? 'UPLOAD_BIND' : 'UPLOAD_REMOVE',
            fromState: application.status,
            toState: application.status,
            actorId: actor.id,
            detail: json({
              uploadId: upload.id,
              requirementCode: upload.requirementCode,
            }),
          },
        });
        return uploadView(
          await tx.hostingApplicationUpload.findUniqueOrThrow({
            where: { id: upload.id },
          }),
        );
      },
      { retries: 3 },
    );
  }
  download(token: string, uploadId: string) {
    return this.auth.run(
      token,
      'hosting.upload.download',
      uploadId,
      undefined,
      async (tx, actor, id) => {
        const upload = await tx.hostingApplicationUpload.findUnique({
          where: { id: id! },
          include: {
            application: { include: applicationInclude },
            attachments: true,
          },
        });
        if (!upload || upload.state !== 'CONFIRMED') deny();
        const scope = await this.canRead(tx, actor, upload.application);
        if (scope === 'reviewer' && !upload.attachments.length) deny();
        let data: Buffer;
        try {
          data = await this.store.read(upload.storageKey);
        } catch {
          throw new ConflictException('Confirmed upload is unavailable');
        }
        verifyFile(data, upload.extension, upload.expectedBytes, upload.sha256);
        return { data, info: uploadView(upload) };
      },
    );
  }
  submit(token: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'hosting.application.submit',
      id,
      input,
      async (tx, actor, applicationId) => {
        const body = bodyObject(input, [
          'expectedDraftRevision',
          'expectedRevision',
          'key',
        ]);
        const expectedDraft = positive(
          body.expectedDraftRevision,
          'draft revision',
        );
        const expectedRevision = positive(body.expectedRevision);
        const key = uuid(body.key);
        const hash = requestHash(body);
        await this.lock(tx, applicationId!);
        actor = await this.auth.reloadActor(tx, token);
        const application = await this.load(tx, applicationId!);
        await this.handler(tx, actor, application.applicantOrganizationId);
        const prior = await this.command(
          tx,
          application.id,
          actor.id,
          key,
          hash,
        );
        if (prior) return prior;
        if (
          !['DRAFT', 'NEEDS_SUPPLEMENT'].includes(application.status) ||
          application.revision !== expectedRevision ||
          application.draftRevision !== expectedDraft
        )
          throw new ConflictException('Application changed or is not editable');
        const form = completeForm(application.draft);
        const files = application.uploads.filter(
          (file) => file.state === 'CONFIRMED' && file.bound,
        );
        const grouped = (code: Requirement) =>
          files.filter((file) => file.requirementCode === code);
        if (
          grouped('BUSINESS_LICENSE').length !== 1 ||
          grouped('VENUE_PHOTO').length < 1 ||
          grouped('VENUE_PHOTO').length > 10 ||
          grouped('OTHER_DOCUMENT').length > 5
        )
          throw new BadRequestException(
            'Required application files are invalid',
          );
        const submission = await tx.hostingApplicationSubmission.create({
          data: {
            applicationId: application.id,
            version: application.nextVersion,
            form: json(form),
            requirementSnapshot: json({
              BUSINESS_LICENSE: { required: true, min: 1, max: 1 },
              EVENT_EXPERIENCE_INTRO: { required: true, type: 'TEXT' },
              VENUE_PHOTO: { required: true, min: 1, max: 10 },
              OTHER_DOCUMENT: { required: false, min: 0, max: 5 },
              maxBytes: 10 * 1024 * 1024,
            }),
            submittedBy: actor.id,
          },
        });
        if (files.length)
          await tx.hostingSubmissionAttachment.createMany({
            data: files.map((file) => ({
              submissionId: submission.id,
              fileId: file.id,
              applicationId: application.id,
              requirementCode: file.requirementCode,
            })),
          });
        const revision = application.revision + 1;
        await tx.eventHostingApplication.update({
          where: { id: application.id },
          data: {
            status: 'PENDING_REVIEW',
            revision,
            nextVersion: { increment: 1 },
            currentSubmissionId: submission.id,
          },
        });
        await tx.hostingApplicationAction.create({
          data: {
            applicationId: application.id,
            submissionId: submission.id,
            revision,
            action: 'SUBMIT',
            fromState: application.status,
            toState: 'PENDING_REVIEW',
            actorId: actor.id,
            detail: json({ version: submission.version }),
          },
        });
        const result = {
          id: application.id,
          submissionId: submission.id,
          version: submission.version,
        };
        await this.saveCommand(tx, application.id, actor.id, key, hash, result);
        return result;
      },
      { retries: 3, retryUnique: true },
    );
  }
  review(
    token: string,
    id: string,
    operation: 'start' | 'supplement' | 'reject' | 'approve',
    input: unknown,
  ) {
    return this.auth.run(
      token,
      `hosting.application.${operation}`,
      id,
      input,
      async (tx, actor, applicationId) => {
        const body = bodyObject(
          input,
          operation === 'start'
            ? ['submissionId', 'expectedRevision', 'key']
            : operation === 'approve'
              ? ['submissionId', 'expectedRevision', 'key']
              : ['submissionId', 'expectedRevision', 'key', 'reason'],
        );
        const submissionId = uuid(body.submissionId);
        const expectedRevision = positive(body.expectedRevision);
        const key = uuid(body.key);
        const reason =
          operation === 'supplement' || operation === 'reject'
            ? text(body.reason, 2000)
            : undefined;
        const hash = requestHash(body);
        await this.lock(tx, applicationId!);
        actor = await this.auth.reloadActor(tx, token);
        const application = await this.load(tx, applicationId!);
        await this.reviewer(tx, actor);
        await this.selfReviewDenied(tx, actor, application.id);
        const prior = await this.command(
          tx,
          application.id,
          actor.id,
          key,
          hash,
        );
        if (prior) return prior;
        if (
          application.revision !== expectedRevision ||
          application.currentSubmissionId !== submissionId ||
          (operation === 'start'
            ? application.status !== 'PENDING_REVIEW'
            : application.status !== 'IN_REVIEW')
        )
          throw new ConflictException('Application review state changed');
        const revision = application.revision + 1;
        if (operation === 'start') {
          await tx.eventHostingApplication.update({
            where: { id: application.id },
            data: { status: 'IN_REVIEW', revision },
          });
          await tx.hostingApplicationAction.create({
            data: {
              applicationId: application.id,
              submissionId,
              revision,
              action: 'START_REVIEW',
              fromState: 'PENDING_REVIEW',
              toState: 'IN_REVIEW',
              actorId: actor.id,
            },
          });
          const result = { id: application.id, status: 'IN_REVIEW' };
          await this.saveCommand(
            tx,
            application.id,
            actor.id,
            key,
            hash,
            result,
          );
          return result;
        }
        if (operation === 'supplement' || operation === 'reject') {
          const status =
            operation === 'supplement' ? 'NEEDS_SUPPLEMENT' : 'REJECTED';
          await tx.eventHostingApplication.update({
            where: { id: application.id },
            data: { status, revision },
          });
          await tx.hostingApplicationAction.create({
            data: {
              applicationId: application.id,
              submissionId,
              revision,
              action:
                operation === 'supplement' ? 'REQUEST_SUPPLEMENT' : 'REJECT',
              fromState: 'IN_REVIEW',
              toState: status,
              actorId: actor.id,
              detail: json({ reason }),
            },
          });
          const result = { id: application.id, status };
          await this.saveCommand(
            tx,
            application.id,
            actor.id,
            key,
            hash,
            result,
          );
          return result;
        }
        const handlers = await tx.hostingApplicationHandlerGrant.findMany({
          where: {
            organizationId: application.applicantOrganizationId,
            active: true,
            member: { active: true, role: 'ORGANIZER', user: { active: true } },
          },
        });
        if (!handlers.length)
          throw new ConflictException('Approval requires an active handler');
        const submission = application.submissions.find(
          (item) => item.id === submissionId,
        );
        if (!submission) deny();
        const form = completeForm(submission.form);
        const eventId = randomUUID();
        await tx.eventScope.create({ data: { id: eventId } });
        await tx.event.create({
          data: {
            id: eventId,
            name: form.eventName!,
            description: '',
            createdBy: actor.id,
            lifecycleState: 'PREPARING_INTERNAL',
          },
        });
        await tx.eventProfileVersion.create({
          data: {
            eventId,
            version: 1,
            profile: json({
              eventName: form.eventName,
              startDate: form.startDate,
              endDate: form.endDate,
              location: form.location,
              lifecycleState: 'PREPARING_INTERNAL',
            }),
            sourceSubmissionId: submission.id,
            createdBy: actor.id,
          },
        });
        await tx.eventOrigin.create({
          data: {
            eventId,
            applicationId: application.id,
            approvedSubmissionId: submission.id,
          },
        });
        await tx.eventOrganizerAppointment.create({
          data: {
            eventId,
            organizationId: application.applicantOrganizationId,
            sourceApplicationId: application.id,
            sourceSubmissionId: submission.id,
            createdBy: actor.id,
          },
        });
        await tx.eventInformationAccessGrant.createMany({
          data: handlers.map((handler) => ({
            eventId,
            memberId: handler.memberId,
            sourceHandlerGrantId: handler.id,
            sourceApplicationId: application.id,
            sourceSubmissionId: submission.id,
          })),
        });
        await tx.eventHostingApplication.update({
          where: { id: application.id },
          data: {
            status: 'APPROVED',
            revision,
            approvedEventId: eventId,
          },
        });
        await tx.hostingApplicationAction.create({
          data: {
            applicationId: application.id,
            submissionId,
            revision,
            action: 'APPROVE',
            fromState: 'IN_REVIEW',
            toState: 'APPROVED',
            actorId: actor.id,
            detail: json({ eventId }),
          },
        });
        const result = { id: application.id, status: 'APPROVED', eventId };
        await this.saveCommand(tx, application.id, actor.id, key, hash, result);
        return result;
      },
      { retries: 0, retryUnique: false, timeout: 10000 },
    );
  }
}
