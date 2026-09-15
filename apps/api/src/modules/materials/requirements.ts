import { BadRequestException } from '@nestjs/common';
import {
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
export function revision(input: unknown): number {
  if (!Number.isInteger(input) || Number(input) < 1)
    throw new BadRequestException(
      'expectedRevision must be a positive integer',
    );
  return Number(input);
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value)) ||
    Number(value.slice(11, 13)) > 23 ||
    new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !==
      value.slice(0, 10)
  )
    throw new BadRequestException(
      'Deadline requires an ISO instant with timezone',
    );
  return new Date(value).toISOString();
}
export function requirements(input: unknown, allowEmpty = false) {
  const b = bodyObject(input, ['deadline', 'materials']);
  if (
    !Array.isArray(b.materials) ||
    b.materials.length < (allowEmpty ? 0 : 1) ||
    b.materials.length > 50
  )
    throw new BadRequestException('Invalid material requirement count');
  const ids = new Set<string>();
  return {
    deadline: instant(b.deadline),
    materials: b.materials.map((input) => {
      const m = bodyObject(input, [
        'id',
        'title',
        'required',
        'instructions',
        'templateVersion',
        'formats',
        'maxBytes',
        'deadline',
        'acceptanceStandard',
      ]);
      const id = uuid(m.id).toLowerCase();
      if (ids.has(id)) throw new BadRequestException('Duplicate material ID');
      ids.add(id);
      if (
        typeof m.required !== 'boolean' ||
        !Number.isInteger(m.maxBytes) ||
        Number(m.maxBytes) < 1 ||
        Number(m.maxBytes) > 2147483647 ||
        !Array.isArray(m.formats) ||
        !m.formats.length ||
        m.formats.length > 20 ||
        !m.formats.every(
          (v) => typeof v === 'string' && /^[a-z0-9]{1,12}$/.test(v),
        ) ||
        new Set(m.formats).size !== m.formats.length
      )
        throw new BadRequestException('Invalid required, formats or maxBytes');
      return {
        id,
        title: text(m.title, 160),
        required: m.required,
        instructions: text(m.instructions, 2000),
        templateVersion: text(m.templateVersion, 120),
        formats: m.formats as string[],
        maxBytes: Number(m.maxBytes),
        deadline: instant(m.deadline),
        acceptanceStandard: text(m.acceptanceStandard, 2000),
      };
    }),
  };
}
