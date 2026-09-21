export function beijingDateTime(value: string | number) {
  return new Date(new Date(value).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 16);
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

export function inWeek(startAt: string, monday: string) {
  if (!startAt) return false;
  const day = beijingDateTime(startAt).slice(0, 10);
  return day >= monday && day < shiftDate(monday, 7);
}
