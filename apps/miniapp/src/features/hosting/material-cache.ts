import {
  emptyHostingForm,
  hostingFormFrom,
  type HostingDetail,
  type HostingForm,
} from './platform';
export type MaterialCache = {
  form: HostingForm;
  revision: number;
  omitted: string[];
  pending?: {
    key: string;
    expectedDraftRevision: number;
    expectedRevision: number;
  };
};
export const materialCacheKey = (actorId: string, applicationId: string) =>
  `caau:materials-input:v1:${actorId}:${applicationId}`;
export function freshMaterialForm(detail: HostingDetail): HostingForm {
  const source = hostingFormFrom(detail.draft);
  return {
    ...emptyHostingForm,
    eventName: source.eventName,
    startDate: source.startDate,
  };
}
export function hasMaterialInput(detail: HostingDetail): boolean {
  const form = hostingFormFrom(detail.draft);
  const initial = freshMaterialForm(detail);
  return (
    Object.keys(form).some(
      (key) =>
        form[key as keyof HostingForm] !== initial[key as keyof HostingForm],
    ) || detail.uploads.some((file) => file.bound)
  );
}
