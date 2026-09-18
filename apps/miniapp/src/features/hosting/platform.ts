import type { components } from '@caau/api-client';

type S = components['schemas'];
export type HostingDetail = S['HostingApplicationDetailDto'];
export type HostingStatus = HostingDetail['status'];
export type HostingRequirement = S['HostingUploadInputDto']['requirementCode'];
export type HostingUpload = S['HostingUploadViewDto'];

export type HostingForm = {
  contactName: string;
  startTime: string;
  endTime: string;
  additionalNotes: string;

  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  registrationStart: string;
  registrationEnd: string;
  contactPhone: string;

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
  contactName?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  additionalNotes?: unknown;

  bankAccountName?: unknown;
  bankName?: unknown;
  bankAccountNumber?: unknown;
  registrationStart?: unknown;
  registrationEnd?: unknown;
  contactPhone?: unknown;

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
  contactName: '',
  startTime: '',
  endTime: '',
  additionalNotes: '',

  bankAccountName: '',
  bankName: '',
  bankAccountNumber: '',
  registrationStart: '',
  registrationEnd: '',
  contactPhone: '',

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
    contactName: stringValue(form.contactName),
    startTime: stringValue(form.startTime),
    endTime: stringValue(form.endTime),
    additionalNotes: stringValue(form.additionalNotes),

    bankAccountName: stringValue(form.bankAccountName),
    bankName: stringValue(form.bankName),
    bankAccountNumber: stringValue(form.bankAccountNumber),
    registrationStart: stringValue(form.registrationStart),
    registrationEnd: stringValue(form.registrationEnd),
    contactPhone: stringValue(form.contactPhone),
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

export function hostingFormBody(
  form: HostingForm,
  materials = false,
  formVersion = 1,
) {
  const hasLocation = [
    form.province,
    form.city,
    form.district,
    form.detailedAddress,
    form.venueName,
  ].some((value) => value.trim());
  return {
    ...(formVersion === 2 && !materials
      ? {
          contactName: form.contactName.trim() || null,
          startTime: form.startTime.trim() || null,
          endTime: form.endTime.trim() || null,
          additionalNotes: form.additionalNotes.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
        }
      : {}),
    ...(materials
      ? {
          bankAccountName: form.bankAccountName.trim() || null,
          bankName: form.bankName.trim() || null,
          bankAccountNumber: form.bankAccountNumber.trim() || null,
          registrationStart: form.registrationStart.trim() || null,
          registrationEnd: form.registrationEnd.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
        }
      : {}),
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
      bankAccountName: '账户户名',
      bankName: '开户银行',
      bankAccountNumber: '银行账号',
      registrationStart: '报名开始时间',
      registrationEnd: '报名截止时间',
      contactPhone: '联系人手机号',
      contactName: '联系人姓名',
      startTime: '开始时间',
      endTime: '结束时间',
      additionalNotes: '补充说明',
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
  materials = false,
  formVersion = 1,
) {
  const missing: string[] = [];
  if (materials) {
    if (!form.bankAccountName.trim()) missing.push('账户户名');
    if (!form.bankName.trim()) missing.push('开户银行');
    if (!form.bankAccountNumber.trim()) missing.push('银行账号');
    if (!form.registrationStart.trim()) missing.push('报名开始时间');
    if (!form.registrationEnd.trim()) missing.push('报名截止时间');
    if (!form.contactPhone.trim()) missing.push('报名联系人手机号');
    if (form.contactPhone && !/^1[3-9]\d{9}$/.test(form.contactPhone))
      missing.push('有效的11位手机号');
    if (form.bankAccountNumber && !/^\d{6,40}$/.test(form.bankAccountNumber))
      missing.push('6至40位数字银行账号');
    if (
      form.registrationStart &&
      form.registrationEnd &&
      Date.parse(form.registrationEnd) < Date.parse(form.registrationStart)
    )
      missing.push('报名截止不得早于开始时间');
  }
  if (!form.eventName.trim()) missing.push('赛事名称');
  if (!form.startDate) missing.push('开始日期');
  if (!form.endDate) missing.push('结束日期');
  if (!materials && !form.province.trim()) missing.push('省份');
  if (!materials && !form.city.trim()) missing.push('城市');
  if (!materials && !form.detailedAddress.trim()) missing.push('详细地址');
  if (!materials && !form.venueName.trim()) missing.push('场馆名称');
  if (
    (materials || formVersion === 1) &&
    !form.eventExperienceIntroduction.trim()
  )
    missing.push('办赛经验简介');
  if (form.startDate && form.endDate && form.endDate < form.startDate)
    return '结束日期不能早于开始日期。';
  if (!materials && formVersion === 2) {
    if (!form.contactName.trim()) missing.push('联系人姓名');
    if (!/^1[3-9]\d{9}$/.test(form.contactPhone))
      missing.push('有效的11位联系人手机号');
    if (!form.startTime) missing.push('比赛开始时间');
    if (!form.endTime) missing.push('比赛结束时间');
    if (form.startDate === form.endDate && form.startTime > form.endTime)
      missing.push('结束时间不能早于开始时间');
    return missing.length ? `请补全：${missing.join('、')}。` : '';
  }
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
