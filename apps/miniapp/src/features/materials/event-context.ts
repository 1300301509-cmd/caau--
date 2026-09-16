export function resolveEventId(
  events: readonly { id: string }[],
  preferredId: string,
) {
  return (
    events.find((event) => event.id === preferredId)?.id ?? events[0]?.id ?? ''
  );
}

export function eventScopedPageUrl(
  page: 'materials' | 'progress',
  eventId: string,
) {
  return `/pages/${page}/index?event=${encodeURIComponent(eventId)}`;
}
