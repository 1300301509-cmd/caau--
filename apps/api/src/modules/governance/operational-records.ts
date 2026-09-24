import type { Prisma } from '@caau/database';
import type { GovernanceQueryDto } from './governance.dto.js';

// Fixed, metadata-only projections. No content JSON, storage keys, filenames,
// credentials or download links leave the original business access boundary.
export async function operationalRecords(
  tx: Prisma.TransactionClient,
  kind: 'files' | 'business-records',
  query: GovernanceQueryDto,
  window: { cursor?: string; limit: number; from: Date; to: Date },
) {
  const projection =
    kind === 'files'
      ? `
    SELECT f.id, '整包材料'::text kind, f.state::text state,
      f."createdAt" at, f."actorId" actor, t."eventId" event,
      f."taskId" resource, f."expectedBytes"::bigint bytes,
      f."confirmedAt" checked, NULL::integer revision
      FROM "FileUpload" f JOIN "MaterialTask" t ON t.id=f."taskId"
    UNION ALL
    SELECT f.id, '材料模板', f.state::text, f."createdAt", f."actorId", t."eventId",
      f."taskId", f."expectedBytes"::bigint, f."confirmedAt", NULL
      FROM "TemplateUpload" f JOIN "MaterialTask" t ON t.id=f."taskId"
    UNION ALL
    SELECT f.id, '单份材料', f.state::text, f."createdAt", f."actorId", t."eventId",
      f."materialId", f."expectedBytes"::bigint, f."confirmedAt", NULL
      FROM "IndividualUpload" f JOIN "MaterialTask" t ON t.id=f."taskId"
    UNION ALL
    SELECT f.id, '办赛材料', f.state::text, f."createdAt", f."actorId", a."approvedEventId",
      f."applicationId", f."expectedBytes"::bigint, f."confirmedAt", NULL
      FROM "HostingApplicationUpload" f JOIN "EventHostingApplication" a ON a.id=f."applicationId"
    UNION ALL
    SELECT f.id, '赛事物料图片', f.state::text, f."createdAt", f."createdBy", s."eventId",
      f."itemId", f."expectedBytes"::bigint, f."confirmedAt", NULL
      FROM "EventSupplyPhoto" f JOIN "EventSupplyItem" s ON s.id=f."itemId"
  `
      : `
    SELECT a.id, '办赛申请'::text kind, a.status::text state,
      a."createdAt" at, a."createdBy" actor, a."approvedEventId" event,
      a.id resource, NULL::bigint bytes, s."submittedAt" checked, a.revision
      FROM "EventHostingApplication" a LEFT JOIN "HostingApplicationSubmission" s
      ON s.id=a."currentSubmissionId"
    UNION ALL
    SELECT t.id, '整包材料任务', COALESCE(e.state::text, t.state::text), t."createdAt",
      NULL::uuid, t."eventId", t.id, NULL, s."submittedAt", COALESCE(e.revision,t.revision)
      FROM "MaterialTask" t LEFT JOIN "TaskExecution" e ON e."taskId"=t.id
      LEFT JOIN "SubmissionVersion" s ON s.id=e."currentSubmissionId"
      WHERE NOT EXISTS (SELECT 1 FROM "TaskMaterialChannel" c WHERE c."taskId"=t.id)
    UNION ALL
    SELECT m.id, '单份材料', m.state::text, m."createdAt", m."actorId", t."eventId",
      m.id, NULL, s."occurredAt", m.revision
      FROM "IndividualMaterial" m JOIN "MaterialTask" t ON t.id=m."taskId"
      LEFT JOIN "IndividualSubmission" s ON s.id=m."currentSubmissionId"
    UNION ALL
    SELECT s."eventId", '赛程', s.status::text, s."updatedAt", s."updatedBy", s."eventId",
      s."eventId", NULL, s."publishedAt", s.revision FROM "EventSchedule" s
    UNION ALL
    SELECT s.id, '赛事物料准备', s.status::text, s."createdAt", NULL::uuid, s."eventId",
      s.id, NULL, NULL, s.revision FROM "EventSupplyItem" s
  `;
  return tx.$queryRawUnsafe<
    Array<{
      id: string;
      kind: string;
      state: string;
      at: Date;
      actor: string | null;
      event: string | null;
      resource: string;
      bytes: bigint | null;
      checked: Date | null;
      revision: number | null;
    }>
  >(
    `WITH records AS (${projection}) SELECT * FROM records
    WHERE ($1::uuid IS NULL OR id > $1::uuid)
      AND ($2::uuid IS NULL OR actor=$2::uuid)
      AND ($3::uuid IS NULL OR event=$3::uuid)
      AND ($4::uuid IS NULL OR resource=$4::uuid)
      AND ($5::boolean OR at BETWEEN $6::timestamptz AND $7::timestamptz)
    ORDER BY id ASC LIMIT $8::integer`,
    window.cursor ?? null,
    query.actorId ?? null,
    query.eventId ?? null,
    query.resourceId ?? null,
    kind === 'business-records',
    window.from,
    window.to,
    window.limit + 1,
  );
}
