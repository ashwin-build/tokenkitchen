function dateParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const parts = Object.fromEntries(values.map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getCalendarDate(now: Date, timeZone: string): string {
  const local = dateParts(now, timeZone);
  return formatDate(local.year, local.month, local.day);
}

export function getBusinessDate(now: Date, timeZone: string, cutoffMinutes: number): string {
  const local = dateParts(now, timeZone);
  if (local.minutes >= cutoffMinutes) return formatDate(local.year, local.month, local.day);
  const previous = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
  return formatDate(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate());
}

export function getFinancialYear(businessDate: string): { key: string; shortKey: string } {
  const [yearText, monthText] = businessDate.split("-");
  const year = Number(yearText);
  const startYear = Number(monthText) >= 4 ? year : year - 1;
  const nextYear = startYear + 1;
  return { key: `${startYear}-${nextYear}`, shortKey: `${startYear}-${String(nextYear).slice(-2)}` };
}