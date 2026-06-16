export function formatCurrency(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatDateTime(value: string, timezone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatDate(value: string, timezone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: timezone,
  }).format(new Date(`${value}T00:00:00`));
}

export function formatTimeRange(startAt: string, endAt: string, timezone?: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeStyle: 'short',
    timeZone: timezone,
  });

  return `${formatter.format(new Date(startAt))} - ${formatter.format(new Date(endAt))}`;
}

export function startOfTodayInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function isoToLocalDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function isoToLocalTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}
