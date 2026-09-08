import type { components } from '@caau/api-client';
export type Task = components['schemas']['TaskViewDto'];
export type Directory = components['schemas']['DirectoryDto'];
export type Requirements = components['schemas']['RequirementsDto'];
export type Identity = components['schemas']['WorkspaceIdentityDto'];
export type Event = components['schemas']['EventViewDto'];
export const roleNames: Record<string, string> = {
  EVENT_MANAGER: '总部赛事管理员',
  ORGANIZER: '承办方经办人',
  REVIEWER: '总部审核员',
  SYSTEM_ADMIN: '系统管理员',
};
