export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type DateParts = { year: number; month: number; day: number };

export function parseDate(dateString: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) throw new Error(`invalid_date:${dateString}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function utcDateFromPlain(dateString: string): Date {
  const { year, month, day } = parseDate(dateString);
  return new Date(Date.UTC(year, month - 1, day));
}

export function todayKst(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function weekStartKst(dateString = todayKst()): string {
  const date = utcDateFromPlain(dateString);
  const diff = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return formatUtcDate(date);
}

export function addDays(dateString: string, days: number): string {
  const date = utcDateFromPlain(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function mondayCleanupExpiresAt(exerciseDate = todayKst()): string {
  const nextMonday = addDays(weekStartKst(exerciseDate), 7);
  const { year, month, day } = parseDate(nextMonday);
  return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS).toISOString();
}


export function monthEndDate(monthStartDate: string): string {
  const { year, month } = parseDate(monthStartDate);
  return formatUtcDate(new Date(Date.UTC(year, month, 1)));
}

export function monthDates(monthStartDate: string): string[] {
  const dates: string[] = [];
  const end = monthEndDate(monthStartDate);
  for (let date = monthStartDate; date < end; date = addDays(date, 1)) dates.push(date);
  return dates;
}
