// Display helpers. Everything the API returns is UTC; the portal shows business time (UTC+7, CR-02).

const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const numberFormat = new Intl.NumberFormat('en-US');

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 1234567 -> "1,234,567". */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** ISO timestamp -> "08 Nov 2026, 14:13" in UTC+7. Returns the input unchanged when it is not a date. */
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return dateTimeFormat.format(new Date(time));
}

/** Long identifiers (Sui digests) shortened for tables: "Ab3dEf…9xYz". */
export function shortenMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** "Mai Nguyen" -> "MN". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** "PENDING_ANCHOR" -> "Pending anchor". */
export function titleCase(value: string): string {
  const text = value.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
