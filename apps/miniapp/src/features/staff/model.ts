import type { components } from '@caau/api-client';

type S = components['schemas'];
export type Staff = S['EventStaffViewDto'];
export type Profile = S['EventStaffProfileDto'];
export type Assignment = S['MatchStaffMemberDto'];
export const roles = [
  '裁判',
  '记录台',
  '技术代表',
  '赛事执行',
  '场地保障',
  '医疗',
  '摄影摄像',
  '志愿者',
  '其他',
];
export const blankProfile = (): Profile => ({
  name: '',
  roles: [],
  duties: '',
  contactPhone: '',
  organization: '',
  notes: '',
});

export function addAssignment(
  rows: Assignment[],
  source: Staff,
  id: string,
): Assignment[] {
  if (!source.active) throw new Error('该人员已停用，请重新选择');
  if (rows.some((row) => row.sourceStaffId === source.id))
    throw new Error('该人员已在本场名单中，可直接修改岗位');
  if (rows.length >= 30) throw new Error('每场最多安排 30 人');
  return [
    ...rows,
    {
      id,
      sourceStaffId: source.id,
      sourceStaffRevision: source.revision,
      name: source.profile.name,
      role: source.profile.roles[0] ?? '',
      organization: source.profile.organization,
      contactPhone: source.profile.contactPhone,
      notes: '',
    },
  ];
}

export function profileError(profile: Profile) {
  if (!profile.name.trim()) return '请填写姓名';
  if (!profile.roles.length) return '请至少选择一个岗位';
  if (profile.roles.length > 10) return '每人最多选择 10 个岗位';
  if (
    profile.contactPhone &&
    !/^[+\d][\d\s()-]{5,39}$/.test(profile.contactPhone)
  )
    return '请填写有效联系电话，或留空';
  return '';
}
