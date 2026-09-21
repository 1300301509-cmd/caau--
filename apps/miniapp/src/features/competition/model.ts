import type { components } from '@caau/api-client';
export type S = components['schemas'];
export function bj(value: string | number) {
  return new Date(new Date(value).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 16);
}
export function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string) {
  return shift(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}
export function inWeek(value: string, week: string) {
  if (!value) return false;
  const date = bj(value).slice(0, 10);
  return date >= week && date < shift(week, 7);
}
export const teamFields = [
  ['name', '球队名称 *', 120],
  ['contactName', '负责人 *', 80],
  ['contactPhone', '联系电话 *', 40],
  ['province', '省份 *', 60],
  ['city', '城市 *', 60],
  ['district', '区县', 60],
  ['address', '详细地址', 300],
  ['shortName', '简称', 40],
  ['clubName', '俱乐部名称', 120],
  ['introduction', '球队简介', 2000],
  ['notes', '备注', 2000],
] as const;
export function emptyTeam(): S['TeamProfileDto'] {
  return {
    name: '',
    contactName: '',
    contactPhone: '',
    province: '',
    city: '',
    district: '',
    address: '',
    shortName: '',
    clubName: '',
    introduction: '',
    notes: '',
  };
}
export function teamError(p: S['TeamProfileDto']) {
  if (
    ![p.name, p.contactName, p.contactPhone, p.province, p.city].every((v) =>
      v.trim(),
    )
  )
    return '请完整填写球队名称、负责人、电话、省份和城市';
  if (!/^[+\d][\d\s()-]{5,39}$/.test(p.contactPhone))
    return '联系电话格式不正确';
  return '';
}
export const supplyStatuses = {
  TO_PREPARE: '待准备',
  PREPARING: '准备中',
  READY: '已就绪',
  SHORTAGE: '短缺',
};
export const participantRoles = {
  PLAYER: '球员',
  COACH: '教练',
  MANAGER: '领队',
  MEDICAL: '队医',
  OTHER: '其他',
};

export function supplyPhotoExtension(bytes: ArrayBuffer) {
  if (!bytes.byteLength || bytes.byteLength > 10485760)
    throw new Error('照片须为非空文件，且不能超过 10 MB');
  const head = new Uint8Array(bytes);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => head[i] === v))
    return 'png';
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return 'jpg';
  throw new Error('仅支持 JPG / PNG 照片');
}
