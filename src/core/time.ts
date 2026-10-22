/** Flipnote timestamps count seconds from 2000-01-01 00:00:00 (console local time, read as UTC). */
const EPOCH_MS = Date.UTC(2000, 0, 1);

export function timestampToDate(timestamp: number): Date {
  return new Date(EPOCH_MS + timestamp * 1000);
}

export function dateToTimestamp(date: Date): number {
  return Math.max(0, Math.min(0xffffffff, Math.floor((date.getTime() - EPOCH_MS) / 1000)));
}

/** Current local wall-clock time, matching what a console would store. */
export function currentTimestamp(): number {
  const now = new Date();
  return dateToTimestamp(new Date(now.getTime() - now.getTimezoneOffset() * 60000));
}
