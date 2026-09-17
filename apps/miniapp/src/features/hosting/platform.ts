import type { components } from '@caau/api-client';

type S = components['schemas'];
export type HostingDetail = S['HostingApplicationDetailDto'];
export type HostingStatus = HostingDetail['status'];
export type HostingRequirement = S['HostingUploadInputDto']['requirementCode'];
export type HostingUpload = S['HostingUploadViewDto'];

export type HostingForm = {
  eventName: string;
  startDate: string;
  endDate: string;
  province: string;
  city: string;
  district: string;
  detailedAddress: string;
  venueName: string;
  eventExperienceIntroduction: string;
};

type FormSnapshot = {
  eventName?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  location?: {
    administrativeArea?: {
      province?: unknown;
      city?: unknown;
      district?: unknown;
    };
    detailedAddress?: unknown;
    venueName?: unknown;
  };
  eventExperienceIntroduction?: unknown;
};

export const emptyHostingForm: HostingForm = {
  eventName: '',
  startDate: '',
  endDate: '',
  province: '',
  city: '',
  district: '',
  detailedAddress: '',
  venueName: '',
  eventExperienceIntroduction: '',
};

const stringValue = (value: unknown) =>
  typeof value === 'string' ? value : '';

export function hostingFormFrom(value: unknown): HostingForm {
  const form = (
    value && typeof value === 'object' ? value : {}
  ) as FormSnapshot;
  return {
    eventName: stringValue(form.eventName),
    startDate: stringValue(form.startDate),
    endDate: stringValue(form.endDate),
    province: stringValue(form.location?.administrativeArea?.province),
    city: stringValue(form.location?.administrativeArea?.city),
    district: stringValue(form.location?.administrativeArea?.district),
    detailedAddress: stringValue(form.location?.detailedAddress),
    venueName: stringValue(form.location?.venueName),
    eventExperienceIntroduction: stringValue(form.eventExperienceIntroduction),
  };
}

export function hostingFormBody(form: HostingForm) {
  const hasLocation = [
    form.province,
    form.city,
    form.district,
    form.detailedAddress,
    form.venueName,
  ].some((value) => value.trim());
  return {
    eventName: form.eventName.trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    location: hasLocation
      ? {
          administrativeArea: {
            province: form.province.trim(),
            city: form.city.trim(),
            district: form.district.trim() || null,
          },
          detailedAddress: form.detailedAddress.trim(),
          venueName: form.venueName.trim(),
        }
      : null,
    eventExperienceIntroduction:
      form.eventExperienceIntroduction.trim() || null,
  };
}

export const hostingStatuses: Array<{
  value: HostingStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'IN_REVIEW', label: '审核中' },
  { value: 'NEEDS_SUPPLEMENT', label: '待补充' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
];

export function hostingStatusLabel(status: string) {
  return hostingStatuses.find((item) => item.value === status)?.label ?? status;
}

export const hostingRequirementNames: Record<HostingRequirement, string> = {
  BUSINESS_LICENSE: '营业执照',
  VENUE_PHOTO: '现场照片',
  OTHER_DOCUMENT: '其他文档',
};

export function hostingActionLabel(action: string) {
  return (
    {
      CREATE: '创建申请',
      SAVE: '保存草稿',
      UPLOAD_BIND: '上传附件',
      UPLOAD_CONFIRM: '上传附件',
      UPLOAD_REMOVE: '移除附件',
      SUBMIT: '正式提交',
      START_REVIEW: '开始审核',
      REQUEST_SUPPLEMENT: '要求补充',
      REJECT: '驳回申请',
      APPROVE: '审核通过',
    }[action] ?? action
  );
}

export function hostingFieldLabel(field: string) {
  return (
    {
      eventName: '赛事名称',
      startDate: '开始日期',
      endDate: '结束日期',
      'location.administrativeArea.province': '省份',
      'location.administrativeArea.city': '城市',
      'location.administrativeArea.district': '区县',
      'location.detailedAddress': '详细地址',
      'location.venueName': '场馆名称',
      eventExperienceIntroduction: '办赛经验简介',
    }[field] ?? field
  );
}

export function validateHostingSubmission(
  form: HostingForm,
  uploads: readonly HostingUpload[],
) {
  const missing: string[] = [];
  if (!form.eventName.trim()) missing.push('赛事名称');
  if (!form.startDate) missing.push('开始日期');
  if (!form.endDate) missing.push('结束日期');
  if (!form.province.trim()) missing.push('省份');
  if (!form.city.trim()) missing.push('城市');
  if (!form.detailedAddress.trim()) missing.push('详细地址');
  if (!form.venueName.trim()) missing.push('场馆名称');
  if (!form.eventExperienceIntroduction.trim()) missing.push('办赛经验简介');
  if (form.startDate && form.endDate && form.endDate < form.startDate)
    return '结束日期不能早于开始日期。';
  const bound = uploads.filter(
    (upload) => upload.bound && upload.state === 'CONFIRMED',
  );
  if (!bound.some((item) => item.requirementCode === 'BUSINESS_LICENSE'))
    missing.push('营业执照');
  if (!bound.some((item) => item.requirementCode === 'VENUE_PHOTO'))
    missing.push('现场照片');
  return missing.length ? `请补全：${missing.join('、')}。` : '';
}

export function allowedHostingExtension(
  name: string,
  requirement: HostingRequirement,
) {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  return requirement === 'VENUE_PHOTO'
    ? ['png', 'jpg', 'jpeg'].includes(extension)
    : ['pdf', 'png', 'jpg', 'jpeg'].includes(extension);
}

export function hostingUploadLimit(requirement: HostingRequirement) {
  return requirement === 'BUSINESS_LICENSE'
    ? 1
    : requirement === 'VENUE_PHOTO'
      ? 10
      : 5;
}

export function formatHostingSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function displayHostingValue(value: unknown) {
  return value === null || value === undefined || value === ''
    ? '未填写'
    : String(value);
}
